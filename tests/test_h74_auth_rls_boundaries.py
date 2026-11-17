"""H74 technical-only auth/RLS/RPC CI guard tests.

These checks are source/fixture tests; they do not authenticate real JWTs or
contact the live Supabase project.
"""
from pathlib import Path
import json
import os
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/h74_ci_pg_auth_rls.sh"

class H74AuthRlsBoundaries(unittest.TestCase):
    def run_with(self, extra):
        env={k:v for k,v in os.environ.items()
             if k not in ("H74_ALLOW_EPHEMERAL_DDL","H74_PG_DSN")}
        env.update(extra)
        return subprocess.run(["bash",str(SCRIPT)],cwd=ROOT,env=env,
                              capture_output=True,text=True,timeout=15)

    def test_refuses_when_opt_in_missing_without_contacting_database(self):
        result=self.run_with({})
        self.assertEqual(result.returncode,2)
        self.assertIn("NOT_TESTED",result.stderr)

    def test_refuses_arbitrary_supabase_or_remote_dsn(self):
        result=self.run_with({
            "H74_ALLOW_EPHEMERAL_DDL":"YES_ISOLATED_PG16_CI_ONLY",
            "H74_PG_DSN":"postgresql://someone@remote.supabase.co:5432/postgres",
        })
        self.assertEqual(result.returncode,2)
        self.assertIn("isolated disposable",result.stderr)

    def test_refuses_correct_looking_dsn_without_exact_opt_in(self):
        result=self.run_with({
            "H74_ALLOW_EPHEMERAL_DDL":"YES_AUTHORIZED_STAGING",
            "H74_PG_DSN":"postgresql://h74_ci_runner:h74_ci_password_only@127.0.0.1:5432/h74_ci",
        })
        self.assertEqual(result.returncode,2)

    def test_script_does_not_import_real_supabase_credentials(self):
        source=SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY",source)
        self.assertNotIn("H69_SUPABASE_ANON_KEY",source)
        self.assertNotIn("NEXT_PUBLIC_SUPABASE_URL",source)
        self.assertIn("H74_ALLOW_EPHEMERAL_DDL",source)
        self.assertIn("H74_PG_DSN",source)

    def test_real_route_auth_boundary_uses_get_user_and_admin_rpc(self):
        source=(ROOT/"src/lib/ielts-bank/server.ts").read_text(encoding="utf-8")
        self.assertIn("client.auth.getUser()",source)
        self.assertIn('client.rpc("is_admin")',source)
        self.assertIn('if (adminError || admin !== true)',source)

    def test_privileged_write_and_job_reads_remain_owner_scoped(self):
        attempts=(ROOT/"src/lib/ielts-bank/server.ts").read_text(encoding="utf-8")
        speaking=(ROOT/"src/app/api/ielts/bank/speaking-coaching/route.ts").read_text(encoding="utf-8")
        writing=(ROOT/"src/app/api/ielts/bank/writing-grading/route.ts").read_text(encoding="utf-8")
        self.assertIn('.eq("id", attemptId).eq("user_id", userId).eq("state", "in_progress")',attempts)
        self.assertIn('.eq("session_id", sessionId).eq("user_id", user.id)',speaking)
        self.assertIn('.eq("job_id", job.id).eq("user_id", user.id)',writing)

    def test_staging_manifest_is_not_misreported_as_verified(self):
        doc=json.loads((ROOT/"evidence/H71_STAGING_EVIDENCE_TEMPLATE.json").read_text())
        self.assertEqual(len(doc["checks"]),18)
        self.assertEqual(sum(c["status"]=="NOT_TESTED" for c in doc["checks"]),18)
        self.assertEqual(doc["classification"],"NON_ATTESTED_TEMPLATE")
        self.assertEqual(doc["release_gate"],"NO_GO")

    def test_postgresql_script_keeps_gate_disabled_at_end(self):
        source=SCRIPT.read_text()
        self.assertIn("SET ROLE authenticated",source)
        self.assertIn("SET ROLE $role",source)
        self.assertIn("H74 ISOLATED PG16 10/10 PASS",source)
        self.assertIn("review_writes_enabled=false WHERE singleton=1",source)
        self.assertIn("JWT SIGNATURES NOT VERIFIED",source)

if __name__=="__main__":
    unittest.main()
