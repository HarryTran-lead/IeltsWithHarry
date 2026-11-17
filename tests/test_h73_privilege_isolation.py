"""H73: verify Grammar ticket signing cannot reuse privileged Supabase credentials.

Runtime tests execute the exact JavaScript implementation of secret() extracted
from the server-only TS module using synthetic environment values only.
No live Supabase/staging access occurs here.
"""
import os
from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "src/lib/grammar/placement.ts").read_text(encoding="utf-8")
ENV_TEMPLATE = (ROOT / ".env.example").read_text(encoding="utf-8")


def ticket_signing_key(*, grammar=None, service_role=None, demo=False):
    match = re.search(r"function secret\(\) \{[\s\S]*?\n\}", SOURCE)
    if not match:
        raise AssertionError("Grammar secret() implementation is missing")
    # Only extract the pure secret resolver; do not load the server-only TS module
    # or its other imports. This executes the actual function, not a reimplementation.
    js = match.group(0) + """
try { process.stdout.write(JSON.stringify({ ok: true, value: secret() })); }
catch (error) { process.stdout.write(JSON.stringify({ ok: false, code: error.message })); }
"""
    env = {"PATH": os.environ.get("PATH", ""), "NEXT_PUBLIC_DEMO_MODE": "true" if demo else "false"}
    if grammar is not None:
        env["GRAMMAR_ASSESSMENT_SECRET"] = grammar
    if service_role is not None:
        env["SUPABASE_SERVICE_ROLE_KEY"] = service_role
    result = subprocess.run(["node", "-e", js], capture_output=True, text=True, env=env, check=True, timeout=10)
    import json
    return json.loads(result.stdout)


class H73CredentialIsolationTests(unittest.TestCase):
    def test_dedicated_key_is_used_in_live_mode(self):
        self.assertEqual(ticket_signing_key(grammar="private-grammar-hmac-value", service_role="different-privileged-value"),
                         {"ok": True, "value": "private-grammar-hmac-value"})

    def test_missing_key_fails_closed_even_with_supabase_role_available(self):
        result = ticket_signing_key(service_role="synthetic-supabase-service-role")
        self.assertFalse(result["ok"])
        self.assertIn("not configured", result["code"])

    def test_whitespace_key_does_not_allow_service_role_fallback(self):
        result = ticket_signing_key(grammar="   ", service_role="synthetic-supabase-service-role")
        self.assertFalse(result["ok"])

    def test_demo_mode_keeps_only_explicit_fixed_demo_key(self):
        self.assertEqual(ticket_signing_key(service_role="synthetic-supabase-service-role", demo=True),
                         {"ok": True, "value": "local-demo-grammar-assessment-only"})

    def test_no_privileged_credential_names_in_ticket_signing_function(self):
        match = re.search(r"function secret\(\) \{[\s\S]*?\n\}", SOURCE)
        self.assertIsNotNone(match)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", match.group(0))

    def test_example_requires_dedicated_nonpublic_key(self):
        self.assertIn("\nGRAMMAR_ASSESSMENT_SECRET=\n", ENV_TEMPLATE)
        self.assertIn("Do NOT reuse Supabase service-role keys", ENV_TEMPLATE)


if __name__ == "__main__":
    unittest.main()
