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
                              frozenset({path}))
        self.assertEqual(report["status"], "STATIC_BASELINE_MATCH")
        self.assertEqual(report["release_gate"], "NO_GO")
        self.assertFalse(report["supabase_staging_verified"])

    def test_new_unreviewed_privileged_runtime_path_fails_closed(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
            ("src/app/api/new/route.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
        ]), frozenset({"src/lib/known.ts"}))
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertEqual(report["unreviewed_new_role_paths"], ["src/app/api/new/route.ts"])

    def test_other_source_layout_is_not_silently_excluded(self):
        report = h73.evaluate(inventory([
            ("packages/worker/index.ts", "SERVICE_ROLE_REF", "OTHER_SOURCE"),
        ]), frozenset())
        self.assertEqual(report["unreviewed_new_role_paths"], ["packages/worker/index.ts"])

    def test_removed_role_source_requires_baseline_shrink(self):
        report = h73.evaluate(inventory([]), frozenset({"src/lib/legacy.ts"}))
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertEqual(report["stale_baseline_paths"], ["src/lib/legacy.ts"])

    def test_incomplete_coverage_never_passes_even_with_matching_paths(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
        ], complete=False), frozenset({"src/lib/known.ts"}))
        self.assertEqual(report["status"], "STATIC_BASELINE_DRIFT")
        self.assertFalse(report["source_coverage_complete"])

    def test_unrelated_rpc_findings_do_not_count_as_privileged_reference(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
            ("src/app/api/other/route.ts", "SUBMIT_RPC_REF", "APPLICATION_RUNTIME"),
            ("sql/backfill.sql", "SERVICE_ROLE_REF", "MILESTONE_OR_OPERATIONAL"),
        ]), frozenset({"src/lib/known.ts"}))
        self.assertEqual(report["status"], "STATIC_BASELINE_MATCH")
        self.assertEqual(report["observed_role_paths"], ["src/lib/known.ts"])

    def test_json_report_never_includes_source_code(self):
        report = h73.evaluate(inventory([
            ("src/lib/known.ts", "SERVICE_ROLE_REF", "APPLICATION_RUNTIME"),
        ]), frozenset({"src/lib/known.ts"}))
        payload = json.dumps(report)
        self.assertNotIn("MY_FAKE_SUPABASE_SECRET", payload)
        self.assertIn("STATIC_TOKEN_MATCHES_NOT_RUNTIME_REACHABILITY", payload)


if __name__ == "__main__":
    unittest.main()
