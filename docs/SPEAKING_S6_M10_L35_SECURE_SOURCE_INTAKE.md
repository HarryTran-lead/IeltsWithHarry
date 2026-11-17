# IELTS Speaking S6 — M10-L35: Secure Source Intake & Pedagogical Revision

**Repository:** `HarryTran-lead/IeltsWithHarry`
**Branch:** `codex/speaking-s6-m10-l14-staging`, NOT production.
**Previous verification:** M10-L34 final GitHub Actions run `44073045399` passed all jobs at commit `63b23ef8375b48f475572e9e9dc15d1f007ef6db`.
**Current original-source status:** 0/44 source packages received in this run; 44/44 NOT_RECEIVED. Independent teacher reviews 0/44. Real Supabase E2E 0/50, actual mobile tests 0/11.
**Release:** S6 = STAGING_REVIEW_REQUIRED/HOLD; S7 = LOCKED. These remain unchanged.

## 1. Purpose and deliverables

M10-L34 added a 44-lesson editorial remediation backlog and 22 structural error codes. M10-L35 supplies a privacy-conscious **source intake and lexical-overlap review** without copying private material to the repository.

- `tests/speaking-s6/m10-l35-source-intake.json` — exactly 44 original lesson IDs, all `NOT_RECEIVED`. The file holds only future redacted metadata (revision, source-bank hashes, restricted evidence pointers, source-rights review state). No questions, model answers, prompts, JWTs, learner audio or private paths.
- `scripts/speaking-s6-l35-source-intake.mjs` — safe default reviews manifest metadata OFFLINE; optional local-only read of exactly 44 private source packages with `--inspect-private-local-dir`. Reuses the L33 signed structural scanner and checks 5-key import-package root, revision, hash fields, ID coverage and cross-lesson lexical similarity for prompts and Mastery follow-ups.
- `tests/speaking-s6-l35-source-intake.test.mjs` — 15 synthetic checks of source provenance, quarantine, 44 lessons, hash drift, input shape, near-duplicate lexical detection, truncation/privacy and strictly non-authoritative results.
- `.github/workflows/quality.yml` — runs the safe no-private-source mode; CI never receives service-role keys, student answers, copied lesson files or original private bank.

**No source imports, editorial rewrites, Supabase queries, learner data edits or production changes occurred in M10-L35.**

## 2. Secure source intake contract

The authorized operator supplies the original student/private import payloads **in a secure local directory** as:

`S6-001.json`, `S6-002.json`, ..., `S6-044.json`.

Each JSON payload should retain the exact approved five top-level keys:
`revision`, `hash`, `privateHash`, `lesson`, `privateLesson`.

The L33 reader refuses symlinks, missing/extra JSON files and files over 2 MiB; its structural inspection checks canonical SHA-256 of student/private content and 4 Guided, 3 Independent, 2 Mastery tasks with protected prompts and bilingual learning support.

The source intake metadata for each lesson has these states:

| State | Meaning | Release implication |
|---|---|---|
| `NOT_RECEIVED` | No original signed source was inspected | Keep HOLD; hashes, reviewers and finding codes must remain empty |
| `QUARANTINED` | Operator observed a source integrity or ownership concern | Require a specific restricted-evidence reference and issue code; no teacher approval |
| `STRUCTURE_SCANNED_PENDING_RIGHTS` | Signed structure reviewed and matches L34 pinned revision/hash, but rights evidence absent | Hold for authorized source/rights reviewer |
| `RIGHTS_CHECKED_PENDING_TEACHER` | Operator claims ownership or explicit license with redacted evidence, hashes and L34 scan matching | Human teacher still must review the actual content; metadata is not legal or teacher certification |

**Rights evidence:** `source_rights_basis` can only be `ORIGINAL_AUTHOR` or `LICENSED_PERMISSION`. The tool does NOT inspect a license agreement or verify the claim of ownership. A public-domain argument or fair-use assertion must be independently evaluated under the relevant laws; do not enter an unsupported rights status.

**Cross-manifest integrity:** a scanned lesson's `source_revision`, `student_sha256` and `private_sha256` must match its L34 scan. If L33 already records a teacher review, those revision and hashes must also match. A teacher review for a different revision cannot transfer its approval to newly changed content.

## 3. Lexical near-duplicate detection (advisory)

For the original 44 privately stored packages, the local inspector compares the textual shape of:

- All Guided prompts
- All unseen Independent prompts
- All Mastery initial questions
- All available Mastery follow-ups

For prompts of at least 8 tokens and comparable lengths, it combines
word-set overlap and ordered word-bigram similarity, with a conservative
default threshold of **0.77**. It reports only the associated lesson IDs,
activity IDs, sections, a rounded lexical-overlap fraction and the action
`HUMAN_PROMPT_VARIETY_REVIEW`. At most 80 pairs appear in the output, with
a separate total count to make truncation visible.

This is **NOT** a semantic similarity model, plagiarism detector, official
IELTS difficulty measure or quality score. A pair with high lexical overlap
may legitimately share topic vocabulary. Conversely two paraphrased
questions with different words can have the same meaning while this scanner
misses them. A human teacher must compare the **actual private texts**.

Always review diversity and difficulty before rewriting. Do not remove a
legitimate repeated skill practice just because a generic lexical alert
was emitted.

## 4. Pedagogical revision process

After the actual secure scan and source-rights verification:

1. Freeze original L33/L34 hashes, revisions and current student records.
2. Triage P0 security leakage and source-integrity issues first; repair
   private answer exposure before any editorial rewrite.
3. For P1 issues, verify whether Guided, Independent and Mastery actually
   require new reasoning and skill transfer. Check meaningful IELTS Part 1
   responses, Part 2 extended turns and Part 3 abstract follow-ups.
4. For P2 issues, teach explicitly before practice, add distinct IDEA →
   STRUCTURE → LANGUAGE scaffolds, English/Vietnamese model translations and
   explanations, common errors and 2/7/21-day retrieval exercises.
5. For every rewritten lesson, create a new **ADD-ONLY** revision with its
   own hashes and teacher assessment. Do not overwrite old import revisions,
   other data banks or any learner attempts.
6. A qualified independent reviewer reads the real content and checks
   grammatical accuracy, spoken naturalness, task authenticity, teaching
   clarity, pronunciation guidance, legitimate rights and topic progression.
   Use L33's 100-point editorial rubric; the internal 90/100 threshold is
   NOT an IELTS learner-band estimate.
7. Independently retest the new revision's private access, import hash,
   release lock and E2E cases on isolated staging; only afterward record
   reviewer-approved evidence.

## 5. Commands — intentionally default to safe HOLD

Run from the repository root:

```bash
# Public CI-safe mode: no network, no private local files, no imports or edits
node scripts/speaking-s6-l35-source-intake.mjs
npm test -- tests/speaking-s6-l35-source-intake.test.mjs

# Explicit authorized offline inspection, on a secure private machine ONLY:
node scripts/speaking-s6-l35-source-intake.mjs \
  --inspect-private-local-dir /SECURE_LOCAL_PRIVATE_S6_FILES
```

**Expected initial result:** `HOLD_SOURCE_INCOMPLETE`, 44 NOT_RECEIVED,
0 external provenance certified, 0 approved teacher lessons, S6 release
unauthorized and S7 locked.

The operator must never use production service-role credentials in these
commands, copy private audio or training assets to public GitHub, or commit
local source packages, imported answers, signed URLs or the raw inspection
data. The local output includes only redacted lesson/activity IDs, checks
and advisory lexical overlaps.

A `READY_FOR_RIGHTS_AND_INDEPENDENT_TEACHER_REVIEW` local report only means
the structural gates were satisfied and no lexical candidates were found at
the selected threshold. This is not proof of legal rights, pedagogical
quality, absence of semantic duplicates, or readiness to unlock.

## 6. What remains incomplete

- Actual 44 original private student/teacher source packages have not been
  inspected in the current environment. No genuine lesson-specific quality
  shortcomings or actual remediation drafts can be asserted.
- Human source-rights evidence and an independent teacher assessment remain
  pending. The 44 editorial L33 reviews still say NOT_REVIEWED.
- Real isolated Supabase E2E 0/50, physical iOS/Android device QA 0/11.
- Five release signoffs S5/teacher/audio/privacy/import are still missing.
- Production and S7 remain unchanged and locked.

**Next M10-L36:** correction-packaging and independent pedagogical review
handoff: new ADD-ONLY revision manifest, two-reviewer source provenance,
targeted prompt-difficulty human checklists and cross-version regression
traceability. Do not automatically author replacement private material in
absence of actual source.
