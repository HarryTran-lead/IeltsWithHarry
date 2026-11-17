import json
from pathlib import Path
import sys
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import h73_privilege_surface_gate as h73


def inventory(paths, complete=True, source_sha="a" * 40):
    return {
        "commit_sha": source_sha,
        "static_inventory_status": "STATIC_INVENTORY_PRODUCED" if complete else "PARTIAL_STATIC_INVENTORY",
        "coverage": {"complete": complete},
        "findings": [
            {"path": path, "indicator": kind, "scope": scope}
            for path, kind, scope in paths
        ],
    }


class H73PrivilegeSurfaceTests(unittest.TestCase):
    def test_exact_observed_baseline_only_matches_static_scope(self):
        path = "src/lib/known.ts"
        report = h73.evaluate(inventory([(path, "SERVICE_ROLE_REF", "APPLICATION_RUNTIME")]),
                              frozenset({path}), client_baseline=frozenset())
        self.assertEqual(report["status"], "STATIC_BASELINE_MATCH")
        self.assertEqual(report["release_gate"], "NO_GO")
        self.assertFalse(report["supabase_staging_verified"])

    def test_new_unreviewed_privileged_runtime_path_fails_closed(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
            ("src/app/api/new/route.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
        ]), frozenset({"src/lib/known.ts"}), client_baseline=frozenset())
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertEqual(report["unreviewed_new_role_paths"], ["src/app/api/new/route.ts"])

    def test_other_source_layout_is_not_silently_excluded(self):
        report = h73.evaluate(inventory([
            ("packages/worker/index.ts", "SERVICE_ROLE_REF", "OTHER_SOURCE"),
        ]), frozenset(), client_baseline=frozenset())
        self.assertEqual(report["unreviewed_new_role_paths"], ["packages/worker/index.ts"])

    def test_removed_role_source_requires_baseline_shrink(self):
        report = h73.evaluate(inventory([]), frozenset({"src/lib/legacy.ts"}), client_baseline=frozenset())
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertEqual(report["stale_baseline_paths"], ["src/lib/legacy.ts"])

    def test_incomplete_coverage_never_passes_even_with_matching_paths(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
        ], complete=False), frozenset({"src/lib/known.ts"}), client_baseline=frozenset())
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertFalse(report["source_coverage_complete"])

    def test_unrelated_rpc_findings_do_not_count_as_privileged_reference(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
            ("src/app/api/other/route.ts", "SUBMIT_RPC_REF", "APPLICATION_RUNTIME"),
            ("sql/backfill.sql", "SERVICE_ROLE_REF", "MILESTONE_OR_OPERATIONAL"),
        ]), frozenset({"src/lib/known.ts"}), client_baseline=frozenset())
        self.assertEqual(report["status"], "STATIC_BASELINE_MATCH")
        self.assertEqual(report["observed_role_paths"], ["src/lib/known.ts"])

    def test_json_report_never_includes_source_code(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
        ]), frozenset({"src/lib/known.ts"}), client_baseline=frozenset())
        payload = json.dumps(report)
        self.assertNotIn("MY_FAKE_SUPABASE_SECRET", payload)
        self.assertIn("STATIC_TOKEN_MATCHES_NOT_RUNTIME_REACHABILITY", payload)


    def test_full_baseline_covers_32_static_review_locations(self):
        self.assertEqual(len(h73.BASELINE_SERVICE_ROLE_PATHS), 11)
        self.assertEqual(len(h73.BASELINE_INDIRECT_BANK_CLIENT_PATHS), 21)
        self.assertEqual(len(h73.BASELINE_POSSIBLE_CLIENT_PATHS), 22)
        self.assertEqual(len(
            h73.BASELINE_SERVICE_ROLE_PATHS | h73.BASELINE_POSSIBLE_CLIENT_PATHS
        ), 32)
        self.assertEqual(
            h73.BASELINE_INDIRECT_BANK_CLIENT_PATHS & h73.BASELINE_SERVICE_ROLE_PATHS,
            frozenset(),
        )

    def test_indirect_bank_client_new_route_fails_closed(self):
        report = h73.evaluate(inventory([
            ("src/app/api/new/route.ts", "POSSIBLE_SERVICE_CLIENT", "APPLICATION_RUNTIME"),
        ]), frozenset(), client_baseline=frozenset())
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertEqual(report["unreviewed_new_client_paths"], ["src/app/api/new/route.ts"])
        self.assertEqual(report["unreviewed_new_indirect_client_paths"], [
            "src/app/api/new/route.ts",
        ])
        self.assertEqual(report["release_gate"], "NO_GO")

    def test_known_indirect_client_matches_explicit_baseline(self):
        path = "src/app/api/ielts/bank/catalog/route.ts"
        report = h73.evaluate(inventory([
            (path, "POSSIBLE_SERVICE_CLIENT", "APPLICATION_RUNTIME"),
        ]), frozenset(), client_baseline=frozenset({path}))
        self.assertEqual(report["status"], "STATIC_BASELINE_MATCH")
        self.assertEqual(report["observed_indirect_bank_client_paths"], [path])
        self.assertEqual(report["unreviewed_new_client_paths"], [])

    def test_renamed_indirect_client_requires_baseline_update(self):
        old = "src/app/api/ielts/bank/catalog/route.ts"
        new = "src/app/api/ielts/bank/brand-new/route.ts"
        report = h73.evaluate(inventory([
            (new, "POSSIBLE_SERVICE_CLIENT", "APPLICATION_RUNTIME"),
        ]), frozenset(), client_baseline=frozenset({old}))
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertEqual(report["unreviewed_new_client_paths"], [new])
        self.assertEqual(report["stale_client_baseline_paths"], [old])

    def test_new_client_in_other_source_layout_also_fails(self):
        path = "packages/new-service/api.ts"
        report = h73.evaluate(inventory([
            (path, "POSSIBLE_SERVICE_CLIENT", "OTHER_SOURCE"),
        ]), frozenset(), client_baseline=frozenset())
        self.assertEqual(report["unreviewed_new_client_paths"], [path])
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")

    def test_migration_client_symbol_not_runtime_claim(self):
        report = h73.evaluate(inventory([
            ("supabase/migrations/old.sql", "POSSIBLE_SERVICE_CLIENT", "DB_MIGRATION_HISTORY"),
            ("scripts/old.py", "POSSIBLE_SERVICE_CLIENT", "MILESTONE_OR_OPERATIONAL"),
        ]), frozenset(), client_baseline=frozenset())
        self.assertEqual(report["observed_possible_client_paths"], [])
        self.assertEqual(report["status"], "STATIC_BASELINE_MATCH")



if __name__ == "__main__":
    unittest.main()
