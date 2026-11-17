import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import unittest

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

    def test_markdown_disclaims_no_matches(self):
        root=self.project({"src/lib/clean.ts":"export const clean = true"})
        report=audit.analyze(root,["src/lib/clean.ts"],COMMIT)
        md=audit.markdown(report)
        self.assertIn("NOT proof of absence",md)
        self.assertIn("NO_GO",md)

if __name__=="__main__":unittest.main()
