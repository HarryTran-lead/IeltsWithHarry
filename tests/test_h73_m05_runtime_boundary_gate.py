import sys
import tempfile
from pathlib import Path
import unittest

SCRIPTS=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(SCRIPTS))
import h73_m05_runtime_boundary_gate as gate

SHA="b"*40

def fixture(root):
    for rel in gate.EXPECTED_RUNTIME_FILES:
        path=root/rel
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text("test source",encoding="utf-8")
    for rel,phrases in gate.SOURCE_CONTRACTS.items():
        (root/rel).write_text("\n".join(phrases),encoding="utf-8")
    (root/"services/audio-worker/compose.yaml").write_text(
        "services:\n  audio-worker:\n    env_file: .env\n    read_only: true\n"
        "    security_opt:\n      - no-new-privileges:true\n",encoding="utf-8")
    for rel,expected in gate.WORKER_CONFIGS.items():
        path=root/rel
        path.parent.mkdir(parents=True,exist_ok=True)
        cron=('[triggers]\ncrons = ["*/2 * * * *"]\n' if expected["cron"] else "")
        path.write_text('name = "'+expected["name"]+'"\nmain = "src/index.js"\nworkers_dev = true\n'
                        '[ai]\nbinding = "AI"\n'+cron,encoding="utf-8")
    (root/"vercel.json").write_text('{"regions":["icn1"]}',encoding="utf-8")

class H73M05RuntimeBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        fixture(self.root)

    def check(self):
        return gate.evaluate(self.root,SHA)

    def test_known_config_and_source_contract_matches_no_runtime_attestation(self):
        result=self.check()
        self.assertEqual(result["status"],"STATIC_BOUNDARY_MATCH")
        self.assertEqual(result["issues"],[])
        self.assertEqual(result["release_gate"],"NO_GO")
        self.assertFalse(result["supabase_staging_verified"])
        self.assertFalse(result["deployment_verified"])

    def test_new_worker_config_requires_review(self):
        p=self.root/"services/new-worker/wrangler.toml"
        p.parent.mkdir(parents=True)
        p.write_text('name="extra"',encoding="utf-8")
        self.assertIn("UNREVIEWED_NEW_WRANGLER_CONFIG",
                      [x["code"] for x in self.check()["issues"]])

    def test_speaking_cron_change_requires_review(self):
        p=self.root/"services/speaking-cloudflare-worker/wrangler.toml"
        p.write_text(p.read_text().replace("*/2 * * * *","* * * * *"),encoding="utf-8")
        self.assertIn("WORKER_TRIGGER_OR_ENTRYPOINT_DRIFT",
                      [x["code"] for x in self.check()["issues"]])

    def test_new_vercel_cron_is_not_silently_accepted(self):
        (self.root/"vercel.json").write_text(
            '{"crons":[{"path":"/api/ielts/bank/scheduled","schedule":"0 * * * *"}]}',
            encoding="utf-8")
        self.assertIn("UNREVIEWED_VERCEL_CRON",[x["code"] for x in self.check()["issues"]])

    def test_privileged_or_exposed_audio_container_detected(self):
        p=self.root/"services/audio-worker/compose.yaml"
        p.write_text(p.read_text()+"    ports:\n      - '9000:9000'\n",encoding="utf-8")
        self.assertIn("AUDIO_WORKER_EXPOSED_OR_PRIVILEGED",
                      [x["code"] for x in self.check()["issues"]])

    def test_missing_authentication_marker_fails_boundary(self):
        p=self.root/"services/writing-cloudflare-proxy/src/index.js"
        p.write_text("env.AI.run(model, input);",encoding="utf-8")
        self.assertIn("MISSING_SOURCE_BOUNDARY_MARKER",
                      [x["code"] for x in self.check()["issues"]])

    def test_missing_private_worker_file_rejected(self):
        (self.root/"scripts/writing-grading-worker.ts").unlink()
        self.assertIn("MISSING_EXPECTED_RUNTIME_FILE",[x["code"] for x in self.check()["issues"]])
        self.assertEqual(self.check()["release_gate"],"NO_GO")

    def test_missing_worker_configuration_detected(self):
        (self.root/"services/speaking-cloudflare-worker/wrangler.toml").unlink()
        self.assertIn("MISSING_OR_SYMLINK_SOURCE",
                      [x["code"] for x in self.check()["issues"]])

    def test_invalid_toml_detected(self):
        (self.root/"services/speaking-cloudflare-worker/wrangler.toml").write_text(
            "not [valid",encoding="utf-8")
        self.assertIn("INVALID_WRANGLER_TOML",
                      [x["code"] for x in self.check()["issues"]])

if __name__=="__main__":
    unittest.main()
