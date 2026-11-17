"""H74/M02 preflight refusal tests: never contact a live service in CI."""
import os
import base64
import json
import time
from pathlib import Path
import re
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/h74_staging_two_user_readonly.mjs"
PRODUCTION=re.search(
    r'const PRODUCTION_SUPABASE_REF = "([a-z0-9]{10,32})";',
    (ROOT/"src/lib/deployment-environment.ts").read_text(encoding="utf-8")
).group(1)
FAKE_REF="abcdefghijklmnopqrst"
FAKE={
    "H74_ALLOW_READONLY_STAGING":"YES_AUTHORIZED_STAGING_TWO_USER_READONLY",
    "H74_STAGING_PROJECT_REF":FAKE_REF,
    "H74_STAGING_URL":f"https://{FAKE_REF}.supabase.co/",
    "H74_STAGING_PUBLISHABLE_KEY":"fake_publishable_key_not_a_secret",
    "H74_STAGING_USER_A_JWT":"fake.header.signatureA",
    "H74_STAGING_USER_B_JWT":"fake.header.signatureB",
    "H74_STAGING_USER_A_ATTEMPT_ID":"11111111-1111-4111-8111-111111111111",
    "H74_STAGING_USER_B_ATTEMPT_ID":"22222222-2222-4222-8222-222222222222",
}
def jwt(*, role="authenticated", ref=FAKE_REF, sub="11111111-1111-4111-8111-111111111111",
        expires=None, issuer=None):
    payload={
        "role":role,"sub":sub,
        "exp": int(time.time())+3600 if expires is None else expires,
        "iss":f"https://{ref}.supabase.co/auth/v1" if issuer is None else issuer,
        "aud":"authenticated",
        "ref":ref,
    }
    encoded=base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return "eyJhbGciOiJIUzI1NiJ9."+encoded+".signature"

def valid_looking():
    return {
        **FAKE,
        "H74_STAGING_PUBLISHABLE_KEY":"sb_publishable_this_is_just_a_mock_key",
        "H74_STAGING_USER_A_JWT":jwt(),
        "H74_STAGING_USER_B_JWT":jwt(sub="22222222-2222-4222-8222-222222222222"),
    }

class H74StagingPreflightTests(unittest.TestCase):
    def run_script(self, config):
        env={k:v for k,v in os.environ.items() if not k.startswith("H74_")}
        env.update(config)
        return subprocess.run(["node",str(SCRIPT)],cwd=ROOT,env=env,
                              text=True,capture_output=True,timeout=10)

    def test_no_opt_in_never_connects(self):
        output=self.run_script({})
        self.assertEqual(output.returncode,2)
        self.assertIn("EXPLICIT_STAGING_AUTHORIZATION_REQUIRED",output.stdout)

    def test_missing_credentials_never_connects(self):
        output=self.run_script({"H74_ALLOW_READONLY_STAGING":"YES_AUTHORIZED_STAGING_TWO_USER_READONLY"})
        self.assertEqual(output.returncode,2)
        self.assertIn("DEDICATED_STAGING_TEST_CREDENTIALS_MISSING",output.stdout)

    def test_production_project_is_rejected_even_with_complete_fake_credentials(self):
        config={**FAKE,"H74_STAGING_PROJECT_REF":PRODUCTION,
                "H74_STAGING_URL":f"https://{PRODUCTION}.supabase.co/"}
        output=self.run_script(config)
        self.assertEqual(output.returncode,2)
        self.assertIn("STAGING_PROJECT_IDENTITY_OR_TEST_IDS_UNVERIFIED",output.stdout)
        self.assertNotIn(PRODUCTION,output.stdout)

    def test_mismatch_between_stage_ref_and_hostname_rejected(self):
        config={**FAKE,"H74_STAGING_URL":"https://another-tenant.supabase.co/"}
        output=self.run_script(config)
        self.assertEqual(output.returncode,2)
        self.assertIn("STAGING_PROJECT_IDENTITY_OR_TEST_IDS_UNVERIFIED",output.stdout)

    def test_staging_url_with_path_or_query_rejected(self):
        config={**FAKE,"H74_STAGING_URL":FAKE["H74_STAGING_URL"]+"rest/v1"}
        output=self.run_script(config)
        self.assertEqual(output.returncode,2)
        self.assertIn("STAGING_PROJECT_IDENTITY_OR_TEST_IDS_UNVERIFIED",output.stdout)

    def test_identical_tokens_and_attempt_ids_rejected(self):
        config={**FAKE,"H74_STAGING_USER_B_JWT":FAKE["H74_STAGING_USER_A_JWT"]}
        output=self.run_script(config)
        self.assertEqual(output.returncode,2)
        config2={**FAKE,"H74_STAGING_USER_B_ATTEMPT_ID":FAKE["H74_STAGING_USER_A_ATTEMPT_ID"]}
        self.assertEqual(self.run_script(config2).returncode,2)

    def test_rejects_service_role_jwt_as_publishable_key_before_network(self):
        config={**valid_looking(),"H74_STAGING_PUBLISHABLE_KEY":jwt(role="service_role")}
        out=self.run_script(config)
        self.assertEqual(out.returncode,2)
        self.assertIn("STAGING_PROJECT_IDENTITY_OR_TEST_IDS_UNVERIFIED",out.stdout)

    def test_rejects_secret_supabase_api_key_before_network(self):
        config={**valid_looking(),"H74_STAGING_PUBLISHABLE_KEY":"sb_secret_restricted_unsafe"}
        self.assertEqual(self.run_script(config).returncode,2)

    def test_rejects_legacy_anon_api_key_from_another_project(self):
        config={**valid_looking(),"H74_STAGING_PUBLISHABLE_KEY":jwt(role="anon",ref="wrongstagingref12345")}
        self.assertEqual(self.run_script(config).returncode,2)

    def test_rejects_service_role_user_jwt_before_network(self):
        config={**valid_looking(),"H74_STAGING_USER_A_JWT":jwt(role="service_role")}
        self.assertEqual(self.run_script(config).returncode,2)

    def test_rejects_expired_user_jwt_before_network(self):
        config={**valid_looking(),"H74_STAGING_USER_A_JWT":jwt(expires=1)}
        self.assertEqual(self.run_script(config).returncode,2)

    def test_rejects_cross_project_user_jwt_before_network(self):
        config={**valid_looking(),"H74_STAGING_USER_A_JWT":jwt(ref="wrongstagingref12345")}
        self.assertEqual(self.run_script(config).returncode,2)

    def test_rejects_missing_or_anonymous_user_claims(self):
        config={**valid_looking(),"H74_STAGING_USER_A_JWT":jwt(role="anon")}
        self.assertEqual(self.run_script(config).returncode,2)
        config["H74_STAGING_USER_A_JWT"]="invalid.jwt.parts"
        self.assertEqual(self.run_script(config).returncode,2)

    def mock_probe(self, scenario):
        env={k:v for k,v in os.environ.items() if not k.startswith("H74_")}
        return subprocess.run(
            ["node",str(ROOT/"tests/h74_staging_probe_mock.mjs"),scenario],
            cwd=ROOT,env=env,text=True,capture_output=True,timeout=12,
        )

    def test_mock_success_exercises_all_five_read_only_access_checks(self):
        out=self.mock_probe("success")
        self.assertEqual(out.returncode,0,out.stderr[-500:])
        report=json.loads(out.stdout)
        self.assertEqual(report["status"],"PASS")
        self.assertEqual(report["release_gate"],"NO_GO")
        self.assertEqual(report["h71_live_checks_approved"],0)
        self.assertEqual(report["checks"],[
            "GETUSER_A_B_DISTINCT",
            "A_AND_B_OWN_ATTEMPTS_VISIBLE",
            "CROSS_USER_ATTEMPTS_DENIED",
            "ANON_B_ATTEMPT_DENIED",
            "INVALID_JWT_DENIED",
        ])

    def test_mock_cross_account_exposure_is_rejected(self):
        out=self.mock_probe("cross-exposed")
        self.assertEqual(out.returncode,1)
        report=json.loads(out.stdout)
        self.assertEqual(report["status"],"FAIL")
        self.assertEqual(report["reason"],"CROSS_ACCOUNT_ATTEMPT_EXPOSED")

    def test_mock_missing_own_fixture_fails_not_false_pass(self):
        out=self.mock_probe("own-missing")
        self.assertEqual(out.returncode,1)
        report=json.loads(out.stdout)
        self.assertEqual(report["reason"],"OWN_ATTEMPT_INVISIBLE_OR_WRONG_OWNER")

    def test_mock_anonymous_data_exposure_is_rejected(self):
        out=self.mock_probe("anonymous-exposed")
        self.assertEqual(out.returncode,1)
        report=json.loads(out.stdout)
        self.assertEqual(report["reason"],"CROSS_ACCOUNT_ATTEMPT_EXPOSED")

    def test_mock_invalid_jwt_accepted_is_rejected(self):
        out=self.mock_probe("invalid-jwt-accepted")
        self.assertEqual(out.returncode,1)
        report=json.loads(out.stdout)
        self.assertEqual(report["reason"],"INVALID_JWT_NOT_REJECTED")

    def test_no_service_role_or_mutating_http_methods_in_probe(self):
        code=SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY",code)
        for method in ("POST","PUT","PATCH","DELETE"):
            self.assertNotIn(f'method: "{method}"',code)
        self.assertIn('method: "GET"',code)
        self.assertIn("h71_live_checks_approved: 0",code)
        self.assertIn('release_gate: "NO_GO"',code)

if __name__=="__main__":
    unittest.main()
