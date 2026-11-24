# Dictation QA: not just article scraping

## Required quality gates
- Source rights: VOA-owned speech/text confirmed, third-party material excluded.
- Audio quality: actual human voice; decoder opens; contains English speech; no excessive noise/music, no TTS substituted.
- Transcript: **audio aligned to transcript** by listening, not just HTML text. News articles sometimes include titles/bylines/text that speaker never reads; remove them.
- Segment duration: Verify start_ms/end_ms against playback (all spoken words in range, no cut consonants). Manual alignment first; optional forced aligner may propose timings, never mark verified without QA.
- CEFR: machine suggestion not authoritative, teacher/editor reviews.
- Content type: dialogue, sentence, news, story, academic; review age suitability.
- Publish only after `source_rights_ok`, `audio_decoded_ok`, `transcript_verified`, `timings_verified`, `cefr_reviewed`.
- Store only verified speech (not third-party music intro) if original includes mixed audio; if segmenting derivative media, document rights and changes.

## MVP admin workflow
`discovered -> needs_review -> approved -> downloaded -> media_verified -> timings_verified -> ready -> published`.

A draft imported from VOA that lacks MP3 or transcript stays visible in **Admin**, not students.

## Listen & Type
Play `[startMs, endMs]`; limit replay only if user chooses. Compare input by word-level edit distance; show correct, omitted, added, substituted, spelling. Allow optional case and punctuation strictness but never accept synonyms for verbatim Dictation.

## Listen & Read
Same audio, highlight text segments with synchronized timestamps. Do not fake per-word timecodes by evenly splitting a segment; only highlight at sentence/turn granularity unless alignment actually exists.

## Other modes
Gap Fill, number/spelling drills can derive from reviewed transcripts; avoid low-quality forced random blanks. Save results to existing Progress / Mistake Bank / Streak without double counting.
