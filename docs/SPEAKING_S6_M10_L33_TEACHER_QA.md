# IELTS Speaking S6 — M10-L33: Teacher & Pedagogical Quality Audit

**Repository:** HarryTran-lead/IeltsWithHarry
**Branch:** `codex/speaking-s6-m10-l14-staging`
**Scope:** S6, 44 original lessons, staged private prompts, self-study goal toward Band 6.5.
**Previous CI:** M10-L32 commit `d0db7de02a436b908eed02020aa1dd7c13dd5366`, PASS:
https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44055803888

**Current editorial status:** 0/44 human-reviewed; teacher-only verdict: HOLD.
**Real Supabase E2E:** 0/50; **real device cases:** 0/11. S6 release HOLD, S7 LOCKED.

## 1. Critical source limitation

The repository contains the S6 import contract and endpoint with a plan for
44 distinct S6 lesson IDs, but **not the 44 complete raw lesson JSON packages
and matching server-only private banks**. The L14 staging document explicitly
says no 44 import payloads are committed. Consequently, we **did not
inspect, score, rewrite or certify any of the actual 44 lessons**.

Do not synthesize positive teacher scores based on a contract, a model
evaluation, a synthetic fixture, GitHub CI or a claim that a curriculum was
previously written in a conversation. No private question/answer text,
audio, student responses or authenticated data should be uploaded to GitHub.

## 2. New M10-L33 deliverables

- `tests/speaking-s6/m10-l33-teacher-review.json`: 44 unique lesson review
  placeholders S6-001 to S6-044, all `NOT_REVIEWED`; does not contain
  private bank content, answer keys, audio or PII.
- `scripts/speaking-s6-l33-teacher-review.mjs`: offline fail-closed metadata
  audit of every lesson and optional **local-only** import package technical
  inspection. No HTTP calls, database writes, file mutations or publication.
- `tests/speaking-s6-l33-teacher-review.test.mjs`: 19 synthetic regression
  tests for missing score rubric, invalid signatures, low critical-quality
  scores, separate reviewers, copy/duplicate questions, hash tampering,
  incomplete Guided hints, missing Mastery follow-ups and leaks.
- `.github/workflows/quality.yml`: adds the offline L33 metadata validation
  step with no private package, credentials or teacher self-signoff.

## 3. Pedagogical rubric — 100 total points

A qualified teacher scores **each actual lesson independently** after
reading the original, privately stored student content and instructor
question/model bank. The required scored categories are:

| Criterion key | Max | What the reviewer must observe |
|---|---:|---|
| `learning_sequence` | 16 | Clear teach → guided practice → independent practice → mastery sequence; teach-before-assess |
| `scaffold_progression` | 14 | Three genuinely progressive, actionable hints; not three paraphrases of the answer |
| `guided_examples` | 12 | Four varied Guided prompts; useful models, evidence and why answers work |
| `independent_transfer` | 12 | Three Independent attempts that remove hints and assess transfer, not rote copying |
| `mastery_authenticity` | 12 | Two unseen Mastery prompts with suitable follow-ups, plausible speaking difficulty and cognitive demand |
| `bilingual_feedback` | 12 | Specific explanations in English and Vietnamese; mistakes and improvements explained rather than simply displaying an answer |
| `grammar_pronunciation_vocabulary` | 10 | Target structures, pronunciation awareness, and topic-relevant collocations for self-study |
| `spaced_review` | 6 | Day 2/7/21 retrievability and no premature unlock |
| `privacy_and_accessibility` | 6 | No student-facing answer leaks, clear consent and mobile accessibility; no false band-certification promise |
| **Total** | **100** | Not an IELTS candidate band score |

An `APPROVED` lesson needs a teacher-entered total of at least **90/100**,
plus minimum scores on crucial categories:
- learning_sequence ≥12/16
- scaffold_progression ≥10/14
- independent_transfer ≥9/12
- mastery_authenticity ≥9/12
- bilingual_feedback ≥9/12
- privacy_and_accessibility 6/6

These thresholds are **internal editorial gates**, not official IELTS
requirements or a Cambridge/IELTS endorsement. High scores alone do not
prove an actual lesson is authentic: independent teacher evidence is still
mandatory.

## 4. Four possible editorial states

| State | Interpretation |
|---|---|
| `NOT_REVIEWED` | No human teacher assessment; cannot count as coverage |
| `REQUIRES_REVISION` | Teacher found deficiencies; link restricted proof and revision notes; rewrite only in a separate authorized content source |
| `PENDING_INDEPENDENT_QA` | Author review passed technical checks, but independent teacher evidence is not yet sufficient |
| `APPROVED` | Meets every numerical and editorial rule, has pinned source revision and hashes, separate teacher reviewer, UTC timestamp and restricted evidence pointer; still requires manual external proof verification |

Every state other than `NOT_REVIEWED` must link a concrete source
revision, exact canonical student/private-bank SHA-256 values, human author
and restricted `ev:` evidence. `APPROVED` also requires an independent
teacher different from the author, all editorial checklist items TRUE, and
a valid UTC review timestamp. The reviewer must examine both public
learning content and the actual private models and follow-ups in a secure
authorized environment.

**Important:** The metadata script cannot authenticate a reviewer identity,
confirm that a private SHA-256 matches a live database revision, inspect a
restricted evidence object, or guarantee the teacher actually read the
content. Thus even 44/44 internally recorded `APPROVED` means only
`READY_FOR_INDEPENDENT_TEACHER_EVIDENCE_AUDIT` and
`teacher_review_certified_by_tool=0`. It never unlocks S6/S7.

## 5. Required editorial checks per lesson

The review record's `editorial_checks` must contain exactly 14 booleans
and each must be TRUE before an `APPROVED` decision:
`teach_before_assess`, `ten_step_guidance`,
`three_progressive_hints`, `guided_model_evidence`,
`independent_no_answer_leak`, `mastery_followup_private`,
`english_vietnamese_feedback`, `topic_and_question_variety`,
`realistic_speaking_prompts`, `spaced_review_2_7_21`,
`pronunciation_vocabulary_support`,
`audio_consent_and_mobile_accessibility`,
`source_rights_and_originality`,
`not_a_certified_band_score`.

A teacher must separately consider:
- IELTS Speaking Part 1 short responses vs Part 2 extended turn vs Part 3
  abstract discussion: appropriate time, language and progression.
- Avoidance of stock model answers as memorization targets and rote hints.
- Distinction among content fluency/coherence, lexical range, grammar
  control and pronunciation; never give an invented automated band.
- EN/VI examples, collocations and common errors explained at an actually
  teachable length, not huge unstructured theory dumps.
- Whether the Mastery follow-up actually deepens reasoning without simply
  rephrasing the initial question.
- Original, rights-cleared writing: do not copy proprietary exam prompts.

## 6. Optional technical inspection of ONE local private import package

The new inspector allows a human operator to use a locally exported,
**authorized, disposable content package** without sending it to GitHub:

```bash
node scripts/speaking-s6-l33-teacher-review.mjs

# Run only on your private machine/secure checkout, NEVER in public CI:
node scripts/speaking-s6-l33-teacher-review.mjs \
  --inspect-local-package /private/staging/S6-001-import.json \
  --require-local-structural-pass
```

The local inspection checks only **structural signals**:
- canonical student/private-bank hashes match the supplied snapshots;
- ten ordered steps with EN/VI instruction and substantive learning content;
- four Guided prompts with exactly three progressive, nonempty hints;
- a Guided model answer in each private entry;
- three Independent and two unseen Mastery stubs, with private Mastery
  follow-ups distinct from initial prompts;
- Day 2/7/21 spaced reviews, no identical prompt duplicates, and no Mastery
  initial question copied into student payload.

The inspector returns only check counts and **codes** for missing fields.
It never prints model answers, exact prompts, personal data, private JSON
or local file paths. This does NOT evaluate naturalness, grammar quality,
IELTS 6.5 authenticity, pronunciation, teaching effectiveness, copyright
or human reviewer credibility. A failed structural check is a review
blocker; a passed check is never a teacher quality approval.

The sample regression packages are **synthetic fixtures only** and are not
counted as inspected lessons.

## 7. Execution and QA order

1. Obtain the actual 44 source lesson packages and matching private banks
   through an authorized secure content export; do **not** copy them into the
   repository or commit them. If absent, retain all 44 `NOT_REVIEWED`.
2. Verify hashes/revision against the intended isolated staging import.
   Run the local structural check for each authorized lesson, and privately
   archive only aggregate check counts/codes.
3. Assign a qualified independent teacher to read each actual source
   package, practice the Guided/Independent/Mastery responses and score
   the 100-point rubric with per-criterion observations.
4. Deficient lessons enter `REQUIRES_REVISION` with restricted evidence.
   Author revisions are made in the authorized content source and treated
   as NEW ADD-ONLY revisions; never overwrite published or existing teacher
   bank/attempt data.
5. After reinspection/review, update only the redacted manifest metadata.
   A second qualified reviewer confirms teacher signoff independently.
6. Keep all five global S6 release gates FALSE and S7 locked.
   Teacher approval does **not** replace 50/50 real Supabase E2E, 11/11
   physical-device evidence, privacy, audio, import or S5 signoffs.

## 8. Commands and expected current results

```bash
npm ci
npm run typecheck
npm run lint
npm test -- tests/speaking-s6-l33-teacher-review.test.mjs
node scripts/speaking-s6-l33-teacher-review.mjs
node scripts/speaking-s6-l29-release-gate.mjs
node scripts/speaking-s6-l31-device-evidence.mjs
node scripts/speaking-s6-l32-defect-triage.mjs
npm run build
```

Expected initially:
- teacher metadata `44 NOT_REVIEWED`; `0 APPROVED`;
- `HOLD_TEACHER_CONTENT_NOT_REVIEWED`;
- 0 verified editor reviews, 0 authorized releases, S7 locked;
- 50/50 real E2E NOT_RUN and 11/11 mobile NOT_RUN.

The optional `--require-all-teacher-approved` flag exits nonzero until
44 review records meet metadata conditions. Do NOT add that strict
flag to ordinary CI while content and independent signoffs are absent.

## 9. M10-L33 expanded 44-package structural audit

Additional safety work on the same staging branch:

- `scripts/speaking-s6-l33-batch-audit.mjs` supports exactly 44 local original
  files, named `S6-001.json` through `S6-044.json`, max 2 MiB each;
  refuses symlinks, absent lessons, extra JSON files and mismatched lesson IDs.
  The **default** invocation reads no private files or network.
- `tests/speaking-s6-l33-batch-audit.test.mjs` adds five synthetic tests for
  complete coverage, missing packages, shifted IDs, exact cross-lesson
  prompt duplicates and incomplete bilingual reasoning.
- The single-package validator now checks all Guided model translations,
  English instructional explanations and Vietnamese teacher reasoning;
  distinct hints; exact activity/private-bank alignment; release-locked
  student status; no leaked Independent prompt, Mastery follow-up or
  private response fields in public lesson content. Student/private hashes
  remain mandatory. No question text is printed in the results.
- `.github/workflows/quality.yml` calls BOTH L33 tools with no private
  arguments. This is a safe structural/methodology check only.

Secure, operator-controlled use when the actual original source becomes
available (never commit source/private answers to GitHub):

```bash
node scripts/speaking-s6-l33-batch-audit.mjs
node scripts/speaking-s6-l33-batch-audit.mjs --inspect-private-local-dir /PRIVATE_DIR
```

A structural report of `READY_FOR_TEACHER_CONTENT_REVIEW` requires
44/44 uniquely identified import packages, matching student/private hash
values, no detected structural rule failures, and no **exact** duplicated
prompts across lessons. It is NOT a teacher approval, nor a demonstration
that two semantically similar paraphrased prompts are unique. All 44
human review records remain NOT_REVIEWED until real source assessment and
independent signed evidence exist.

## 10. Next milestone

**M10-L34 — S6 instructional content coverage and editorial remediation
backlog**. Compare actual authorized source contents with the rubric, map
missing bilingual teaching/hints/examples/reviews by lesson and prioritize
the highest-impact pedagogical fixes. Do not invent 44 approved lessons
without access to their real underlying JSON/private prompt banks.
