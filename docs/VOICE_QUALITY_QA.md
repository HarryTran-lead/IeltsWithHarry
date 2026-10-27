# Voice and audio QA protocol

For each draft, admin listens with headphones to the whole track while following the canonical transcript. Check all speaker changes, missing or repeated turns, pronunciation of answer words, numbers and negations, pace, pauses, clipping and abrupt ending. Replay the evidence interval of each of the ten questions and verify that the accepted answer is actually audible and alternatives do not accidentally fit.

The worker records exact segment start and end positions from rendered sample counts. Those intervals identify the turns containing answer evidence; they are not word-level forced alignment. A technical pass is necessary but insufficient. Local ASR checks transcript agreement and flags missing answer phrases, but can itself misrecognize speech. The explicit human checklist remains mandatory. Reject the draft with a note if any critical issue remains. Do not publish an unreviewed full mock or call AI-created content official IELTS material.

All QA records are versioned by job. An approval is bound to the exam revision generated from that job. A later revision requires a new review if its audio changes.
