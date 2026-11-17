import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/"scripts/h71_acceptance_gate.py"
spec=importlib.util.spec_from_file_location("gate",SCRIPT)
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
SHA="a"*40; REF="h71stagingproject01"
def sample():return {"project_ref":REF,"commit_sha":SHA,
 "checks":[{"id":x,"status":"NOT_TESTED"} for x in gate.REQUIRED]}
class H71(unittest.TestCase):
 def test_zero_live_staging_stays_blocked(self):
  r=gate.inspect(sample(),Path("/tmp"))
  self.assertEqual(r["verdict"],"NO_GO_MISSING_STAGING_EVIDENCE");self.assertEqual(r["release_gate"],"NO_GO")
 def test_missing_check_invalid(self):
  x=sample();x["checks"].pop();self.assertEqual(gate.inspect(x,Path("/tmp"))["verdict"],"INVALID_EVIDENCE")
 def test_duplicate_check_invalid(self):
  x=sample();x["checks"][-1]["id"]=x["checks"][0]["id"];self.assertIn("missing_or_duplicate_checks",gate.inspect(x,Path("/tmp"))["issues"])
 def test_fake_pass_without_artifact_invalid(self):
  x=sample();x["checks"][0]["status"]="PASS";self.assertEqual(gate.inspect(x,Path("/tmp"))["verdict"],"INVALID_EVIDENCE")
 def test_sha_mismatch_detected(self):
  with tempfile.TemporaryDirectory() as d:
   x=sample();p=Path(d)/"proof.txt";p.write_bytes(b"truth")
   x["checks"][0].update({"status":"PASS","evidence_path":p.name,
    "evidence_sha256":"f"*64,"project_ref":REF,"commit_sha":SHA,"independent_verifier":"DBA"})
   self.assertIn("digest_mismatch_"+x["checks"][0]["id"],gate.inspect(x,Path(d))["issues"])
 def test_path_traversal_detected(self):
  with tempfile.TemporaryDirectory() as d:
   x=sample();x["checks"][0].update({"status":"PASS","evidence_path":"../outside",
    "evidence_sha256":"f"*64,"project_ref":REF,"commit_sha":SHA,"independent_verifier":"DBA"})
   self.assertTrue(any(z.startswith("unsafe_path") for z in gate.inspect(x,Path(d))["issues"]))
 def test_wrong_commit_context_detected(self):
  with tempfile.TemporaryDirectory() as d:
   x=sample();p=Path(d)/"proof.txt";p.write_bytes(b"truth")
   x["checks"][0].update({"status":"PASS","evidence_path":p.name,
    "evidence_sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
    "project_ref":REF,"commit_sha":"b"*40,"independent_verifier":"DBA"})
   self.assertTrue(any(z.startswith("context_mismatch") for z in gate.inspect(x,Path(d))["issues"]))
 def test_all_self_claimed_pass_is_not_go(self):
  with tempfile.TemporaryDirectory() as d:
   x=sample()
   for idx,e in enumerate(x["checks"]):
    p=Path(d)/f"{idx}.txt";p.write_text(f"proof-{idx}")
    e.update({"status":"PASS","evidence_path":p.name,
     "evidence_sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
     "project_ref":REF,"commit_sha":SHA,"independent_verifier":"self-claimed"})
   r=gate.inspect(x,Path(d))
   self.assertEqual(r["verdict"],"INDEPENDENT_REVIEW_REQUIRED")
   self.assertEqual(r["release_gate"],"NO_GO")
 def test_missing_project_id_invalid(self):
  x=sample();x["project_ref"]=None;self.assertEqual(gate.inspect(x,Path("/tmp"))["verdict"],"INVALID_EVIDENCE")
 def test_missing_git_sha_invalid(self):
  x=sample();x["commit_sha"]="x";self.assertEqual(gate.inspect(x,Path("/tmp"))["verdict"],"INVALID_EVIDENCE")
if __name__=="__main__":unittest.main()
