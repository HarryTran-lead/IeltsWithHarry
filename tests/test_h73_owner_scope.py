"""H73/M03 source-level regressions for privileged ownership predicates.

These are code assertions, NOT live authorization, RLS, JWT, or staging tests.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def source(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class H73OwnerScopeTests(unittest.TestCase):
    def test_attempt_submission_checks_ownership_on_read_and_write(self):
        code = source("src/lib/ielts-bank/server.ts")
        self.assertIn('.eq("id", attemptId).eq("user_id", userId).single();', code)
        self.assertIn('.eq("id", attemptId).eq("user_id", userId).eq("state", "in_progress").select("id").single();', code)

    def test_speaking_job_reads_and_retry_are_owned(self):
        code = source("src/app/api/ielts/bank/speaking-coaching/route.ts")
        self.assertIn('.eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();', code)
        self.assertIn('.select("id,status").eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();', code)
        self.assertIn('.select("id,status").eq("session_id", sessionId).eq("user_id", user.id).single();', code)
        self.assertIn('.eq("id", sessionId).eq("user_id", user.id).maybeSingle();', code)

    def test_writing_grading_looks_up_owned_job_and_result(self):
        code = source("src/app/api/ielts/bank/writing-grading/route.ts")
        self.assertIn('.eq("attempt_id", attemptId).eq("user_id", user.id).order("created_at"', code)
        self.assertIn('.eq("job_id", job.id).eq("user_id", user.id).maybeSingle();', code)
        self.assertIn('.eq("attempt_id", body.attemptId).eq("user_id", user.id).order("created_at"', code)

    def test_writing_insights_reports_and_failure_cleanup_are_owned(self):
        code = source("src/app/api/ielts/bank/writing-insights/route.ts")
        self.assertIn('.eq("job_id", job.id).eq("user_id", user.id).maybeSingle();', code)
        self.assertIn('.eq("job_id", job.id).eq("user_id", user.id).single();', code)
        self.assertIn('.eq("job_id", job.id).eq("user_id", user.id).eq("lease_token", lease.token)', code)
        self.assertIn('lease = { jobId: job.id, userId: user.id, token: String(token) };', code)
        self.assertIn('.eq("job_id", lease.jobId).eq("user_id", lease.userId).eq("lease_token", lease.token);', code)

    def test_writing_queue_idempotency_and_retry_are_owned(self):
        code = source("src/lib/writing-grading/server.ts")
        phrase = '.eq("attempt_id", attemptId).eq("user_id", userId).eq("pipeline_version", versionId)'
        self.assertEqual(code.count(phrase), 2)

    def test_public_share_urls_still_require_active_token_and_submitted_attempt(self):
        reading = source("src/app/(public)/reading/share/[token]/page.tsx")
        notebook = source("src/app/(public)/notebook/share/[token]/page.tsx")
        self.assertIn('reading_share_token: token, reading_share_enabled: "true"', reading)
        self.assertIn('.in("state", ["submitted", "expired"]).maybeSingle();', reading)
        self.assertIn('.eq("token", token).eq("enabled", true).maybeSingle();', notebook)
        self.assertIn('.eq("id", share.notebook_id).eq("user_id", share.user_id)', notebook)

    def test_admin_routes_verify_admin_before_using_privileged_client(self):
        for route in (
            "src/app/api/ielts/bank/admin/route.ts",
            "src/app/api/admin/ai-content-factory/route.ts",
            "src/app/api/ielts/bank/writing-review/route.ts",
            "src/app/api/admin/users/route.ts",
        ):
            code = source(route)
            self.assertIn('await viewer(true)', code, route)
            self.assertIn('bankClient()', code, route)


if __name__ == "__main__":
    unittest.main()
