import unittest
from unittest.mock import patch
import numpy as np

from worker import inspect_audio, main, normalize, word_error_rate


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
