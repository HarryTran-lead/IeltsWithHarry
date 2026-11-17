import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/"scripts/h72_dependency_audit.py"
spec=importlib.util.spec_from_file_location("audit_h72",SCRIPT)
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
COMMIT="a"*40

class H72StaticAuditTests(unittest.TestCase):
    def project(self, files):
        directory=tempfile.TemporaryDirectory()
        root=Path(directory.name)
        for path,content in files.items():
            dest=root/path
            dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_text(content,encoding="utf-8")
        self.addCleanup(directory.cleanup)
        return root

    def test_direct_h58_application_reference(self):
        root=self.project({"src/lib/reviews.ts":'const q = "r19_h58.probes";'})
        report=audit.analyze(root,["src/lib/reviews.ts"],COMMIT)
        self.assertEqual(report["application_direct_h58_reference_paths"],["src/lib/reviews.ts"])

    def test_service_role_usage_is_review_not_equivalent_to_h58(self):
        root=self.project({"src/lib/ielts-bank/server.ts":'const key=process.env.SUPABASE_SERVICE_ROLE_KEY;'})
        report=audit.analyze(root,["src/lib/ielts-bank/server.ts"],COMMIT)
        self.assertEqual(report["application_direct_h58_reference_paths"],[])
        self.assertEqual(report["application_service_role_or_client_paths"],["src/lib/ielts-bank/server.ts"])

    def test_sql_schema_indirection_match(self):
        root=self.project({"src/app/api/route.ts":'''client.schema("r19_h58").from("probes")'''})
        report=audit.analyze(root,["src/app/api/route.ts"],COMMIT)
        self.assertIn("SCHEMA_CALL_H58",report["counts_by_indicator"])

    def test_h68_rpc_reference(self):
        root=self.project({"src/app/api/route.ts":'client.rpc("h68_submit_review")'})
        report=audit.analyze(root,["src/app/api/route.ts"],COMMIT)
        self.assertIn("SUBMIT_RPC_REF",report["counts_by_indicator"])

    def test_old_quota_rpc_captured(self):
        root=self.project({"src/app/api/route.ts":'client.rpc("h68_rate_limit_review")'})
        report=audit.analyze(root,["src/app/api/route.ts"],COMMIT)
        self.assertIn("DEPRECATED_QUOTA_RPC_REF",report["counts_by_indicator"])

    def test_docs_do_not_produce_runtime_claim(self):
        root=self.project({"docs/note.md":"service_role r19_h58.probes","src/app/page.tsx":"export default null"})
        report=audit.analyze(root,["docs/note.md","src/app/page.tsx"],COMMIT)
        self.assertFalse(report["findings"])

    def test_symlink_never_followed(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);source=root/"secret.ts";source.write_text("r19_h58.probes")
            (root/"src/lib").mkdir(parents=True)
            (root/"src/lib/linked.ts").symlink_to(source)
            report=audit.analyze(root,["src/lib/linked.ts"],COMMIT)
            self.assertEqual(report["coverage"]["skipped"][0]["reason"],"SYMLINK_OR_MISSING")

    def test_path_traversal_rejected(self):
        root=self.project({"src/lib/x.ts":"OK"})
        report=audit.analyze(root,["../secret.ts","src/lib/x.ts"],COMMIT)
        self.assertIn("UNSAFE_OR_EXCLUDED",[x["reason"] for x in report["coverage"]["skipped"]])

    def test_invalid_commit_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                audit.analyze(Path(d),[],"not_a_commit")

    def test_report_never_reveals_code_or_secret(self):
        root=self.project({"src/lib/a.ts":'const secret="USER_TOKEN_ABC123";const k=process.env.SUPABASE_SERVICE_ROLE_KEY;'})
        report=audit.analyze(root,["src/lib/a.ts"],COMMIT)
        raw=json.dumps(report)
        self.assertNotIn("USER_TOKEN_ABC123",raw)
        self.assertIn("SERVICE_ROLE_REF",raw)

    def test_report_always_no_go(self):
        root=self.project({"src/lib/z.ts":"export const ok = true;"})
        report=audit.analyze(root,["src/lib/z.ts"],COMMIT)
        self.assertEqual(report["release_gate"],"NO_GO")
        self.assertEqual(report["live_supabase_checks_pass"],0)

    def test_source_docs_classification(self):
        self.assertEqual(audit.classify("src/app/api/admin/route.ts"),"APPLICATION_RUNTIME")
        self.assertEqual(audit.classify("supabase/migrations/change.sql"),"DB_MIGRATION_HISTORY")
        self.assertEqual(audit.classify("scripts/h72_dependency_audit.py"),"MILESTONE_OR_OPERATIONAL")

    def test_sha_bound_scan_rejects_modified_tracked_checkout(self):
        root=self.project({"src/lib/a.ts":"export const version=1;"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/a.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        audit.assert_clean_tracked_tree(root)
        (root/"src/lib/a.ts").write_text("export const version=2;",encoding="utf-8")
        with self.assertRaisesRegex(ValueError,"differs from checked-out HEAD"):
            audit.assert_clean_tracked_tree(root)

    def test_sha_bound_scan_ignores_untracked_generated_reports(self):
        root=self.project({"src/lib/a.ts":"export const stable=true;"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/a.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        (root/"reports").mkdir()
        (root/"reports/h72_output.json").write_text("{}",encoding="utf-8")
        audit.assert_clean_tracked_tree(root)

    def test_additional_runtime_layouts_and_extensions(self):
        root=self.project({
            "workers/worker.mts":'const schema="r19_h58.probes";',
            "src/pages/review.jsx":'const key=process.env.SUPABASE_SERVICE_ROLE_KEY;',
            "functions/probe.json":'{"rpc": "h68_submit_review"}',
            "lib/schema.prisma":'// r19_h58.reviews',
        })
        report=audit.analyze(root,[
            "workers/worker.mts","src/pages/review.jsx",
            "functions/probe.json","lib/schema.prisma",
        ],COMMIT)
        self.assertIn("workers/worker.mts",report["application_direct_h58_reference_paths"])
        self.assertIn("src/pages/review.jsx",report["application_service_role_or_client_paths"])
        self.assertIn("SUBMIT_RPC_REF",report["counts_by_indicator"])
        self.assertIn("lib/schema.prisma",report["application_direct_h58_reference_paths"])
        self.assertTrue(report["coverage"]["complete"])

    def test_large_tracked_source_exits_nonzero(self):
        root=self.project({"src/lib/large.ts":"r19_h58.probes;"+(" " * 64)})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/large.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        sha=audit.head_sha(root)
        json_out=root/"reports/inventory.json"
        md_out=root/"reports/inventory.md"
        args=["h72_dependency_audit.py","--repo",str(root),"--expected-sha",sha,
              "--json-out",str(json_out),"--md-out",str(md_out)]
        with patch.object(audit,"MAX_BYTES",16),patch("sys.argv",args):
            self.assertEqual(audit.main(),3)
        inventory=json.loads(json_out.read_text())
        self.assertEqual(inventory["static_inventory_status"],"PARTIAL_STATIC_INVENTORY")
        self.assertFalse(inventory["coverage"]["complete"])
        self.assertEqual(inventory["release_gate"],"NO_GO")
        self.assertEqual(inventory["coverage"]["skipped"][0]["reason"],"LARGE_SOURCE_FILE")

    def test_sha_bound_scan_rejects_assume_unchanged_index_flag(self):
        root=self.project({"src/lib/a.ts":"export const version=1;"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/a.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        subprocess.run(["git","-C",str(root),"update-index","--assume-unchanged","src/lib/a.ts"],check=True)
        (root/"src/lib/a.ts").write_text("export const version=2;",encoding="utf-8")
        # Git status intentionally hides the modified tracked file.
        with self.assertRaisesRegex(ValueError,"tracked index has unverified"):
            audit.assert_clean_tracked_tree(root)

    def test_sha_bound_scan_rejects_skip_worktree_flag(self):
        root=self.project({"src/lib/a.ts":"export const version=1;"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/a.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        subprocess.run(["git","-C",str(root),"update-index","--skip-worktree","src/lib/a.ts"],check=True)
        with self.assertRaisesRegex(ValueError,"tracked index has unverified"):
            audit.assert_clean_tracked_tree(root)

    def test_sha_bound_scan_rejects_concurrent_source_change(self):
        root=self.project({"src/lib/a.ts":"export const version=1;"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/a.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        sha=audit.head_sha(root)
        out_json=root/"reports/audit.json"
        out_md=root/"reports/audit.md"
        args=["h72_dependency_audit.py","--repo",str(root),"--expected-sha",sha,
              "--json-out",str(out_json),"--md-out",str(out_md)]
        original=audit.analyze
        def change_after_scan(*params):
            result=original(*params)
            (root/"src/lib/a.ts").write_text("export const version=2;",encoding="utf-8")
            return result
        with patch.object(audit,"analyze",side_effect=change_after_scan),patch("sys.argv",args):
            self.assertEqual(audit.main(),2)
        self.assertFalse(out_json.exists())
        self.assertFalse(out_md.exists())

    def test_sha_bound_scan_rejects_head_move_during_scan(self):
        root=self.project({"src/lib/a.ts":"export const version=1;"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","src/lib/a.ts"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        original_sha=audit.head_sha(root)
        out_json=root/"reports/audit.json"
        out_md=root/"reports/audit.md"
        args=["h72_dependency_audit.py","--repo",str(root),"--expected-sha",original_sha,
              "--json-out",str(out_json),"--md-out",str(out_md)]
        original=audit.analyze
        def move_head_after_scan(*params):
            result=original(*params)
            subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                            "-c","user.email=h72@example.invalid",
                            "-c","commit.gpgsign=false","commit","--allow-empty",
                            "-qm","head moved"],check=True)
            return result
        with patch.object(audit,"analyze",side_effect=move_head_after_scan),patch("sys.argv",args):
            self.assertEqual(audit.main(),2)
        self.assertNotEqual(original_sha,audit.head_sha(root))
        self.assertFalse(out_json.exists())
        self.assertFalse(out_md.exists())

    def test_empty_eligible_source_inventory_refuses_success(self):
        root=self.project({"README.md":"# No source files here"})
        subprocess.run(["git","-C",str(root),"init","-q"],check=True)
        subprocess.run(["git","-C",str(root),"add","README.md"],check=True)
        subprocess.run(["git","-C",str(root),"-c","user.name=H72 Test",
                        "-c","user.email=h72@example.invalid",
                        "-c","commit.gpgsign=false","commit","-qm","baseline"],check=True)
        sha=audit.head_sha(root)
        out_json=root/"reports/audit.json"
        out_md=root/"reports/audit.md"
        args=["h72_dependency_audit.py","--repo",str(root),"--expected-sha",sha,
              "--json-out",str(out_json),"--md-out",str(out_md)]
        with patch("sys.argv",args):
            self.assertEqual(audit.main(),3)
        output=json.loads(out_json.read_text())
        self.assertEqual(output["static_inventory_status"],"INVENTORY_INCOMPLETE")
        self.assertFalse(output["coverage"]["complete"])
        self.assertIn("NO_ELIGIBLE_SOURCE_FILES",output["coverage"]["errors"])
        self.assertEqual(output["release_gate"],"NO_GO")

    def test_unknown_source_layout_is_scanned_and_explicitly_classified(self):
        root=self.project({
            "packages/extra/adapter.ts":'const table="r19_h58.reviews";',
            "modules/frontend/dashboard.vue":'<script>const key="SUPABASE_SERVICE_ROLE_KEY";</script>',
            "next.config.mjs":'const rpc="h68_submit_review";',
            "src/lib/ok.ts":"export const ok=true;",
        })
        paths=["packages/extra/adapter.ts","modules/frontend/dashboard.vue",
               "next.config.mjs","src/lib/ok.ts"]
        report=audit.analyze(root,paths,COMMIT)
        self.assertEqual(report["unclassified_source_reference_paths"],[
            "modules/frontend/dashboard.vue","next.config.mjs",
            "packages/extra/adapter.ts"])
        self.assertEqual(report["coverage"]["inspected_files"],4)
        self.assertTrue(report["coverage"]["complete"])
        self.assertIn("OTHER_SOURCE",set(x["scope"] for x in report["findings"]))
        self.assertIn("packages/extra/adapter.ts",audit.markdown(report))

    def test_dependency_lockfiles_excluded_explicitly_not_silent(self):
        root=self.project({
            "package-lock.json":'{"name":"app","comment":"r19_h58.reviews"}',
            "pnpm-lock.yaml":"# SUPABASE_SERVICE_ROLE_KEY",
            "src/lib/review.ts":'const source="r19_h58.probes";',
        })
        report=audit.analyze(root,[
            "package-lock.json","pnpm-lock.yaml","src/lib/review.ts"],COMMIT)
        self.assertTrue(report["coverage"]["complete"])
        self.assertEqual(report["coverage"]["inspected_files"],1)
        self.assertEqual(sorted(x["path"] for x in report["coverage"]["skipped"]),[
            "package-lock.json","pnpm-lock.yaml"])
        self.assertEqual(set(x["reason"] for x in report["coverage"]["skipped"]),{
            "DEPENDENCY_LOCKFILE_EXCLUDED"})
        self.assertEqual(report["application_direct_h58_reference_paths"],[
            "src/lib/review.ts"])

    def test_ci_retains_diagnostic_artifacts_on_audit_failure(self):
        workflow=(SCRIPT.parents[1]/".github/workflows/h72-dependency-evidence-ci.yml").read_text(encoding="utf-8")
        upload=workflow.split("- uses: actions/upload-artifact@v4",1)[1]
        self.assertIn("if: always()",upload)
        self.assertIn("if-no-files-found: warn",upload)
        self.assertIn("reports/h72_dependency_inventory.json",upload)
        self.assertIn("reports/h72_dependency_inventory.md",upload)

    def test_only_lockfile_does_not_count_as_scanned_source(self):
        root=self.project({"package-lock.json":'{"name":"demo"}'})
        report=audit.analyze(root,["package-lock.json"],COMMIT)
        self.assertEqual(report["static_inventory_status"],"INVENTORY_INCOMPLETE")
        self.assertFalse(report["coverage"]["complete"])
        self.assertIn("NO_ELIGIBLE_SOURCE_FILES",report["coverage"]["errors"])
        self.assertEqual(report["coverage"]["skipped"][0]["reason"],"DEPENDENCY_LOCKFILE_EXCLUDED")

    def test_markdown_disclaims_no_matches(self):
        root=self.project({"src/lib/clean.ts":"export const clean = true"})
        report=audit.analyze(root,["src/lib/clean.ts"],COMMIT)
        md=audit.markdown(report)
        self.assertIn("NOT proof of absence",md)
        self.assertIn("NO_GO",md)

if __name__=="__main__":unittest.main()
