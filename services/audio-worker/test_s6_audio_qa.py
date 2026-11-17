"""Synthetic, non-user audio tests; none proves human speech or IELTS band."""
import math
import subprocess
import tempfile
import unittest
from pathlib import Path

import imageio_ffmpeg
import numpy as np

from s6_audio_qa import SAMPLE_RATE, evaluate_decoded_pcm, inspect_local_audio


class S6AudioQATests(unittest.TestCase):
    def test_silence_is_not_construed_as_audio_evidence(self):
        x = np.zeros(2 * SAMPLE_RATE, dtype=np.float32)
        result = evaluate_decoded_pcm(x)
        self.assertEqual(result["status"], "NO_MEASURABLE_SIGNAL")
        self.assertFalse(result["speech_verified"])

    def test_tone_is_measurable_but_not_a_verified_human_voice(self):
        t = np.arange(2 * SAMPLE_RATE) / SAMPLE_RATE
        tone = (0.08 * np.sin(2 * math.pi * 440 * t)).astype(np.float32)
        result = evaluate_decoded_pcm(tone)
        self.assertEqual(result["status"], "PASS_TECHNICAL")
        self.assertTrue(result["technical_pass"])
        self.assertFalse(result["speech_verified"])

    def test_duration_out_of_range(self):
        x = np.ones(SAMPLE_RATE // 2, dtype=np.float32) * 0.08
        self.assertEqual(evaluate_decoded_pcm(x)["status"], "DURATION_OUT_OF_RANGE")

    def test_clipping_is_flagged(self):
        x = np.ones(2 * SAMPLE_RATE, dtype=np.float32)
        self.assertEqual(evaluate_decoded_pcm(x)["status"], "POSSIBLE_CLIPPING")

    def test_unsupported_extension_refused(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / "not-audio.txt"
            file.write_bytes(b"x" * 500)
            self.assertEqual(inspect_local_audio(file)["status"], "UNSUPPORTED_INPUT")

    def test_real_ffmpeg_ogg_decoding_of_synthetic_tone(self):
        # This is genuine container decoding, but NOT real microphone testing.
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / "fixture.ogg"
            result = subprocess.run(
                [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin",
                 "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                 "-c:a", "libopus", "-y", str(output)],
                capture_output=True, timeout=20, check=False
            )
            if result.returncode:
                self.skipTest("Bundled ffmpeg lacks synthetic Opus encoder")
            report = inspect_local_audio(output, ffmpeg_executable=ffmpeg)
            self.assertEqual(report["status"], "PASS_TECHNICAL")
            self.assertGreaterEqual(report["duration_seconds"], 1.9)
            self.assertFalse(report["speech_verified"])


if __name__ == "__main__":
    unittest.main()
