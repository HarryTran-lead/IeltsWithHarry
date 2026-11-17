"""H75/M01 safety checks; no external database or live environment."""
from pathlib import Path
import os
import subprocess
import unittest
import re

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/h75_ci_forward_only_rollback.sh"
EXPECTED_DSN="postgresql://h75_ci_runner:h75_ci_password_only@127.0.0.1:5432/h75_ci"
FLAG="YES_DISPOSABLE_LOCAL_PG16_ONLY"

class H75ForwardOnlyRollbackPreflightTests(unittest.TestCase):
    def invoke(self, config):
        env={key:value for key,value in os.environ.items() if not key.startswith("H75_")}
        env.update(config)
        return subprocess.run(["bash",str(SCRIPT)],cwd=ROOT,
                              env=env,capture_output=True,text=True,timeout=12)

    def test_refuses_no_explicit_opt_in_before_psql(self):
        result=self.invoke({})
        self.assertEqual(result.returncode,2)
        self.assertIn("NOT_TESTED",result.stderr)

    def test_refuses_supabase_database_even_with_opt_in(self):
        result=self.invoke({
            "H75_ALLOW_EPHEMERAL_DDL":FLAG,
            "H75_PG_DSN":"postgresql://postgres@db.production.supabase.co:5432/postgres",
        })
        self.assertEqual(result.returncode,2)
        self.assertIn("refused external",result.stderr)

    def test_refuses_localhost_database_with_wrong_identity(self):
        result=self.invoke({
            "H75_ALLOW_EPHEMERAL_DDL":FLAG,
            "H75_PG_DSN":"postgresql://postgres@127.0.0.1:5432/postgres",
        })
        self.assertEqual(result.returncode,2)

    def test_refuses_correct_dsn_without_exact_opt_in(self):
        result=self.invoke({"H75_PG_DSN":EXPECTED_DSN})
        self.assertEqual(result.returncode,2)

    def test_rollback_never_runs_legacy_h71_reset_to_broad_grants(self):
        code=SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("DROP OWNED BY r19_h70_executor",code)
        self.assertNotIn("h71_ci_cutover.py",code)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY",code)
        self.assertIn("has_table_privilege('service_role'",code)
        self.assertIn("forward-safe rollback disables feature",code)
        self.assertIn("review_writes_enabled=false",code)

    def test_failed_migration_is_bounded_to_synthetic_database(self):
        code=SCRIPT.read_text(encoding="utf-8")
        self.assertIn("h69_ci_bootstrap.sql",code)
        self.assertIn("001_h70_least_privilege_staging_review.sql",code)
        self.assertIn("H70_ROLE_ALREADY_EXISTS_REVIEW_MANUALLY",code)
        self.assertIn("H75_FORCED_ABORT",code)
        self.assertIn("H75 DISPOSABLE PG16 10/10 PASS",code)

    def test_commit_gates_do_not_approve_release_without_staging(self):
        workflow=(ROOT/".github/workflows/h75-forward-only-rollback-ci.yml").read_text(encoding="utf-8")
        self.assertIn("H75_ALLOW_EPHEMERAL_DDL: YES_DISPOSABLE_LOCAL_PG16_ONLY",workflow)
        self.assertIn("H75_PG_DSN: "+EXPECTED_DSN,workflow)
        self.assertIn("H71_STAGING_EVIDENCE_TEMPLATE.json",workflow)
        self.assertIn("NO_GO",workflow)

    def test_read_only_catalog_does_not_contain_mutation_statements(self):
        sql=(ROOT/"sql/h74_dba_catalog_READ_ONLY.sql").read_text(encoding="utf-8")
        filtered="\n".join(line for line in sql.splitlines()
                            if not line.strip().startswith(("--","\\")))
        self.assertIsNone(re.search(
            r"(?im)^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|"
            r"DO|CALL|TRUNCATE|COPY)\b",filtered))

if __name__=="__main__":
    unittest.main()
