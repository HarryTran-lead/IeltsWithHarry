import unittest
import numpy as np

from worker import inspect_audio, normalize, word_error_rate


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


if __name__ == "__main__":
    unittest.main()
