import unittest
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import numpy as np

from worker import inspect_audio, main, normalize, render_job, word_error_rate


class AudioQualityTests(unittest.TestCase):
    def test_clean_mono_audio_passes(self):
        seconds = np.arange(24000 * 2) / 24000
        sample = (0.4 * np.sin(2 * np.pi * 220 * seconds)).astype(np.float32)
        self.assertTrue(inspect_audio(sample, 24000)["passed"])

    def test_clipping_and_long_silence_fail(self):
        clipped = np.ones(24000, dtype=np.float32)
        self.assertFalse(inspect_audio(clipped, 24000)["passed"])
        silence = np.concatenate([np.ones(24000, dtype=np.float32) * 0.3, np.zeros(24000 * 4, dtype=np.float32)])
        self.assertFalse(inspect_audio(silence, 24000)["passed"])

    def test_invalid_script_rejected(self):
        with self.assertRaises(ValueError):
            normalize("<script>bad</script>")

    def test_word_error_rate(self):
        self.assertEqual(word_error_rate("The river is clear.", "The river is clear"), 0.0)
        self.assertEqual(word_error_rate("The river is clear", "The river clear"), 0.25)

    def test_four_sections_render_and_checkpoint_as_one_review_job(self):
        class Provider:
            def list_voices(self):
                return ["bf_emma"]

            def synthesize_segment(self, text, voice, pace):
                seconds = np.arange(24000) / 24000
                return (0.4 * np.sin(2 * np.pi * 220 * seconds)).astype(np.float32)

            def validate_output(self, audio):
                return inspect_audio(audio, 24000)

        class Database:
            def __init__(self):
                self.uploads = {}
                self.tables = {}
                self.patches = []

            def rest(self, method, path, *, params=None):
                return [{"id": "bf_emma", "pace": 1.0}]

            def update(self, job, token, patch):
                self.patches.append(patch)

            def upload(self, path, data):
                self.uploads[path] = data

            def insert(self, table, rows):
                self.tables[table] = rows

        sections = []
        for part in range(1, 5):
            sections.append({"sectionId": f"part-{part}", "turns": [
                {"ordinal": ordinal, "speaker": "Teacher", "voice": "bf_emma", "text": f"Part {part} sentence {ordinal} for a clear recording."}
                for ordinal in range(2)
            ], "evidence": {f"q{(part - 1) * 10 + number}": [number % 2] for number in range(1, 11)}, "answerPhrases": []})
        database = Database()
        with TemporaryDirectory() as temporary, patch("worker.CACHE_DIR", Path(temporary)), patch("worker.asr_report", return_value={"status": "completed"}):
            render_job(database, Provider(), {"id": "job-1", "payload": {"sections": sections}}, "lease")
        self.assertEqual(len(database.uploads), 4)
        self.assertEqual(len(database.tables["ai_factory_segments"]), 8)
        self.assertTrue(database.tables["ai_factory_qa"]["passed"])
        self.assertEqual(len(database.tables["ai_factory_qa"]["answer_alignment"]["sections"]), 4)
        paths = json.loads(database.patches[-1]["artifact_path"])
        self.assertEqual(set(paths), {"part-1", "part-2", "part-3", "part-4"})
        self.assertEqual(database.patches[-1]["status"], "awaiting_review")

    @patch("worker.KokoroProvider")
    @patch("worker.Supabase")
    def test_scheduled_run_exits_without_loading_model_when_queue_empty(self, database, provider):
        database.return_value.claim.return_value = None
        with patch("worker.sys.argv", ["worker.py", "--once"]), patch.dict("worker.os.environ", {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "test"}):
            main()
        database.return_value.claim.assert_called_once()
        provider.assert_not_called()

    @patch("worker.render_job")
    @patch("worker.KokoroProvider")
    @patch("worker.Supabase")
    def test_scheduled_run_fails_and_records_job_error(self, database, provider, render):
        database.return_value.claim.return_value = {"id": "job-1"}
        render.side_effect = ValueError("Invalid audio")
        with patch("worker.sys.argv", ["worker.py", "--once"]), patch.dict("worker.os.environ", {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "test"}):
            with self.assertRaises(SystemExit) as result:
                main()
        self.assertEqual(result.exception.code, 1)
        self.assertEqual(database.return_value.update.call_args.args[2]["status"], "qa_failed")


if __name__ == "__main__":
    unittest.main()
