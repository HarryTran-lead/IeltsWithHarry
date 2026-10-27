# Kokoro audio engine

`services/audio-worker/worker.py` runs without an inbound HTTP listener. It polls `ai_factory_claim_job`, renders each turn with a fixed voice and pace, inserts pauses, normalizes the mix, encodes MP3 and checks decoding. Supported profiles are `bf_emma`, `bm_george`, `af_heart`, `am_michael`; British and American English only. The model weights are checked against SHA-256 `496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4` before inference. The weight file and Kokoro 0.9.4 are from [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) and [hexgrad/kokoro](https://github.com/hexgrad/kokoro), both Apache-2.0; verify voice and dependency terms again before deployment.

Technical checks include mono 24 kHz output, finite samples, amplitude, clipping, long silence, segment count, final MP3 decoding, storage size and evidence turn intervals. Faster Whisper `base.en` performs a local ASR pass and records the recognized transcript, word error rate and answer phrases it did not recognize. ASR disagreement triggers manual review; it is not proof of a TTS error. An admin must still listen and inspect every answer.

Local dry run after activating a Python 3.11 environment and installing `requirements.txt`:

```powershell
node scripts/export-ai-factory-pilot.mjs "$env:TEMP\ai-factory-pilot.json"
python services/audio-worker/worker.py --local-pilot "$env:TEMP\ai-factory-pilot.json" services/audio-worker/output
```

The resulting `pilot-part3.mp3`, `ai_factory_segments.json` and `ai_factory_qa.json` stay local. A local run is useful for technical verification but does not create an approved or student-visible exam.
