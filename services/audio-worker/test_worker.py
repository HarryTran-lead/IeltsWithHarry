import unittest
from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import base64
import io
import numpy as np
import soundfile as sf

from worker import GeminiProvider, GeminiUnavailable, cached_segment, confirmed_gemini_key, full_duration_report, inspect_audio, main, normalize, part_cues, render_job, render_preferred_job, word_error_rate


class AudioQualityTests(unittest.TestCase):
    def test_gemini_audio_request_preserves_transcript_and_decodes_wav(self):
        seconds = np.arange(24000 * 2) / 24000
        wave = (0.4 * np.sin(2 * np.pi * 220 * seconds)).astype(np.float32)
        output = io.BytesIO()
        sf.write(output, wave, 24000, format="WAV", subtype="PCM_16")
        class Response:
            ok = True
            def json(self):
                return {"steps": [{"content": [{"type": "audio", "data": base64.b64encode(output.getvalue()).decode()}]}]}
        provider = GeminiProvider("test-key")
        with patch.object(provider.session, "post", return_value=Response()) as post:
            audio = provider.synthesize_segment("Please check question one.", "bf_emma", 1.0)
        self.assertTrue(provider.validate_output(audio)["passed"])
        self.assertEqual(post.call_args.kwargs["json"]["input"][0]["content"][0]["text"], "Please check question one.")
        self.assertEqual(post.call_args.kwargs["json"]["generation_config"]["speech_config"][0]["voice"], "Kore")

    def test_quota_failure_falls_back_and_marks_regeneration(self):
        class Response:
            ok = False
            status_code = 429
        gemini = GeminiProvider("test-key")
        with patch.object(gemini.session, "post", return_value=Response()):
            with self.assertRaises(GeminiUnavailable):
                gemini.synthesize_segment("Please check question one.", "bf_emma", 1.0)
        with patch("worker.confirmed_gemini_key", return_value="test-key"), patch("worker.GeminiProvider", return_value=gemini), patch("worker.KokoroProvider") as kokoro, patch("worker.render_job", side_effect=[GeminiUnavailable("Gemini TTS HTTP 429"), None]) as render:
            render_preferred_job(object(), {"id": "job-1"}, "lease")
        self.assertEqual(render.call_count, 2)
        self.assertIs(render.call_args.args[1], kokoro.return_value)
        self.assertEqual(render.call_args.kwargs["fallback_reason"], "Gemini TTS HTTP 429")

    def test_gemini_requires_confirmed_free_tier_key(self):
        with patch.dict("worker.os.environ", {"AI_FACTORY_GEMINI_API_KEY": "test-key", "AI_FACTORY_FREE_TIER_ONLY": "true", "AI_FACTORY_FREE_TIER_CONFIRMED": "false"}):
            self.assertIsNone(confirmed_gemini_key())
        with patch.dict("worker.os.environ", {"AI_FACTORY_GEMINI_API_KEY": "test-key", "AI_FACTORY_FREE_TIER_ONLY": "true", "AI_FACTORY_FREE_TIER_CONFIRMED": "true"}):
            self.assertEqual(confirmed_gemini_key(), "test-key")

    def test_provider_cache_keys_do_not_mix_gemini_and_kokoro(self):
        class Provider:
            def __init__(self, version):
                self.cache_version = version
            def synthesize_segment(self, text, voice, pace):
                seconds = np.arange(24000) / 24000
                return (0.4 * np.sin(2 * np.pi * 220 * seconds)).astype(np.float32)
            def validate_output(self, audio):
                return inspect_audio(audio, 24000)
        with TemporaryDirectory() as temporary, patch("worker.CACHE_DIR", Path(temporary)):
            Path(temporary).mkdir(exist_ok=True)
            _, gemini_key = cached_segment(Provider("gemini"), "Hello world.", "bf_emma", 1.0)
            _, kokoro_key = cached_segment(Provider("kokoro"), "Hello world.", "bf_emma", 1.0)
        self.assertNotEqual(gemini_key, kokoro_key)

    def test_clean_mono_audio_passes(self):
        seconds = np.arange(24000 * 2) / 24000
        sample = (0.4 * np.sin(2 * np.pi * 220 * seconds)).astype(np.float32)
        self.assertTrue(inspect_audio(sample, 24000)["passed"])

    def test_clipping_and_long_silence_fail(self):
        clipped = np.ones(24000, dtype=np.float32)
        self.assertFalse(inspect_audio(clipped, 24000)["passed"])
        silence = np.concatenate([np.ones(24000, dtype=np.float32) * 0.3, np.zeros(24000 * 4, dtype=np.float32)])
        self.assertFalse(inspect_audio(silence, 24000)["passed"])

    def test_only_declared_reading_time_is_exempt_from_silence_check(self):
        tone = np.full(24000, 0.3, dtype=np.float32)
        audio = np.concatenate([tone, np.zeros(24000 * 30, dtype=np.float32), tone])
        self.assertTrue(inspect_audio(audio, 24000, [(24000, 24000 * 31)])["passed"])
        self.assertFalse(inspect_audio(audio, 24000)["passed"])
        damaged = np.concatenate([audio, np.zeros(24000 * 4, dtype=np.float32)])
        self.assertFalse(inspect_audio(damaged, 24000, [(24000, 24000 * 31)])["passed"])

    def test_part_cues_and_full_duration_gate(self):
        first, start, closing, review = part_cues("part-1", "two people booking a room", True)
        self.assertIn("questions one to ten", first)
        self.assertIn("hear two people booking a room", first)
        self.assertIn("Now listen carefully", start)
        self.assertEqual(review, 20)
        last, start, closing, review = part_cues("part-4", "a lecture", True)
        self.assertIn("questions thirty-one to forty", last)
        self.assertIn("two minutes", closing)
        self.assertEqual(review, 120)
        self.assertFalse(full_duration_report(24 * 60)["passed"])
        self.assertTrue(full_duration_report(30 * 60)["passed"])
        self.assertFalse(full_duration_report(36 * 60)["passed"])

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
        with TemporaryDirectory() as temporary, patch("worker.CACHE_DIR", Path(temporary)), patch("worker.asr_report", return_value={"status": "completed"}), patch("worker.QUESTION_PREVIEW_SECONDS", 0.5), patch("worker.PART_REVIEW_SECONDS", 0.5), patch("worker.FINAL_REVIEW_SECONDS", 0.5), patch("worker.FULL_MIN_SECONDS", 0):
            render_job(database, Provider(), {"id": "job-1", "payload": {"sections": sections}}, "lease")
        self.assertEqual(len(database.uploads), 4)
        self.assertEqual(len(database.tables["ai_factory_segments"]), 8)
        self.assertTrue(database.tables["ai_factory_qa"]["passed"])
        self.assertTrue(database.tables["ai_factory_qa"]["technical"]["full_duration"]["passed"])
        self.assertEqual(database.tables["ai_factory_qa"]["technical"]["generation"]["actual_provider"], "kokoro")
        self.assertTrue(database.tables["ai_factory_qa"]["technical"]["generation"]["needs_regeneration"])
        self.assertGreater(database.tables["ai_factory_qa"]["technical"]["sections"]["part-1"]["encoded_duration_seconds"], 0)
        self.assertGreater(database.tables["ai_factory_segments"][0]["start_ms"], 1000)
        self.assertEqual(len(database.tables["ai_factory_qa"]["answer_alignment"]["sections"]), 4)
        paths = json.loads(database.patches[-1]["artifact_path"])
        self.assertEqual(set(paths), {"part-1", "part-2", "part-3", "part-4"})
        self.assertEqual(database.patches[-1]["status"], "awaiting_review")
        self.assertEqual(database.patches[-1]["provider"], "kokoro")

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
