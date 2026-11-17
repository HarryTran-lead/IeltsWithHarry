# IELTS Speaking S6 — M10-L34 Editorial Coverage & Remediation

**Project:** IeltsWithHarry, private S6 Band 6.5 self-study curriculum (44 lessons).
**Work branch:** `codex/speaking-s6-m10-l14-staging` only.
**Release:** S6 STAGING_REVIEW_REQUIRED, S7 LOCKED; production unchanged.
**Verified baseline:** M10-L33 CI PASS, commit `ad42605852438e82905bcb78936b098e20d76bf8` ([GitHub Actions](https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44070346440)).
**Current source evidence:** 44/44 original private lesson packages are absent from the public repository. Editorial review manifest still 44 `NOT_REVIEWED`; real E2E is 0/50, devices 0/11. No actual source content was graded or rewritten here.

## 1. Deliverables

1. `tests/speaking-s6/m10-l34-editorial-backlog.json`: 44 prepopulated redacted, `NOT_SCANNED` lesson records, arranged in four 11-lesson rounds. All finding arrays are EMPTY because actual private packages have not been inspected. The zero findings are **unknown**, NOT "defect-free."
2. `scripts/speaking-s6-l34-editorial-remediation.mjs`: 22 fixed, named structural failure types mapped to a risk tier, pedagogical area, and actionable revision instruction. Reconciles L34 with the existing L33 teacher metadata. Can optionally derive an **in-memory suggested queue** from authorized local original 44 packages using the L33 private batch reader.
3. `tests/speaking-s6-l34-editorial-remediation.test.mjs`: 16 synthetic regression tests, including unsafe hash/source claims, privacy leakage, untested revisions, priority ordering, four batches and fully unreviewed content.
4. `.github/workflows/quality.yml`: runs the L34 tool with **no** private-package argument and no credentials, keeping ordinary CI safe.

The system does not create or approve a revision, mutate the source lessons, import private banks, score a real learner, run Supabase queries, or automatically sign teacher QA.

## 2. Backlog lifecycle and protection

| State | Meaning | Required next action |
|---|---|---|
| `NOT_SCANNED` | Original content not inspected | Request authorized original lesson and private bank; do NOT make up findings |
| `STRUCTURE_FLAGGED` | L33 offline checker found a specific technical issue | Verify original issue with a teacher and create a scoped remediation plan |
| `REVISION_PENDING_RESCAN` | Author proposes an ADD-ONLY replacement revision | Recompute both student/private hashes and rerun structural + teacher QA; DO NOT close automatically |
| `STRUCTURE_PASSED` | Pinned revision passed the *structural* checklist | Independent teacher still evaluates its pedagogical quality and 90/100 internal threshold |

A scanned row must have the exact revision, **real** student/private SHA-256 values, redacted `ev:` proof reference, and valid known finding codes. An unscanned row must have NULL revision/hash/evidence and ZERO findings. A proposed revision must have a distinct new ID, author and independent rescan. Teacher reviews are stored separately in the L33 manifest; L34 may not self-approve lessons.

**Import-schema regression identified during L34:** the previous L33 structural inspector could accept a superficially complete package even when required fields were absent from the real Zod importer. The inspector now additionally checks Guided `model_ref` and matching private `question_en`, and strict Independent/Mastery stubs with `prompt_ref`, `followup_delivery`, `mode`, `activity_id` and `no_answer_key_on_student`. The synthetic teacher and batch test packages were corrected to follow the real import shape. Missing required fields create a P1 `import_contract_field_alignment` finding, not a false ready-to-import result.

The L34 checker also compares a previously assessed L33 review record's revision and **both** SHA-256 values with its L34 structural scan. If these differ, it returns a blocking source-drift error: a teacher cannot approve one revision while the backlog quietly refers to another. A suggested 44-package preview is considered structurally complete only when all 44 validated lesson reports are present, no failures/duplicates remain and the L33 inspector explicitly reports clean coverage. Even then it is **only a human-review candidate**.

**Important:** Local structural pass means neither IELTS 6.5 suitability nor lesson originality, copyright, pronunciation quality or human signoff. It is only `READY_FOR_INDEPENDENT_TEACHER_REVIEW`.

## 3. Triaging detected weaknesses

| Tier | Meaning | Fixed examples |
|---|---|---|
| **P0** | Leakage, integrity or release-safety risk; never publish | Public Mastery follow-up, unseen Independent prompt, private teacher answer, bad student/private hash, wrong bank/activity alignment, student revision marked published |
| **P1** | Major instructional completeness issue | Missing 10-step sequence, one of 4 Guided / 3 Independent / 2 Mastery activities, missing models/follow-ups, exact duplicated question within/across lessons |
| **P2** | Teachability, explanation and retention gap | Missing EN/VI step instruction, hollow teaching content, repeated hints, missing model translation/teacher reasoning, wrong spaced-review 2/7/21 |

**P0 remediation:** Resolve data exposure FIRST in a new isolated, private-only revision. Recheck public API/Storage boundary and the existing 50-case E2E security gate. Never fix a leak by moving hidden teacher answers into learner hints.

**P1 remediation:** Preserve the 4+3+2 activity blueprint, restore missing teacher models, vary actual communicative demand and check whether the difficulty is appropriate for a progression toward 6.5.

**P2 remediation:** Make instruction usable without a human tutor. Add concise examples, EN–VI explanations, three *distinct* hint levels and deliberate review that requires retrieval, rather than mere checkbox completion.

The priority is fixed by rule code in source and cannot be downgraded through a free-text teacher comment. Rules are deterministic *structure indicators* only; near-duplicate paraphrases, misleading answer models and inauthentic tasks still require manual review.

## 4. Concrete teaching specification for each revised lesson

This is the **target design**, not a claim that the 44 original lessons currently meet it:

| Stage | Lesson content requirement | Teacher check |
|---|---|---|
| 1–2 | Explain the communicative purpose, meaning and 1–2 starter phrases in EN/VI | Student understands **why** the phrase is used |
| 3–4 | Demonstrate a short worked spoken answer with a reason and example | Model is natural, not a memorized essay paragraph |
| 5–6 | Highlight typical errors, grammar choice and pronunciation/stress | Corrective explanation is concrete and reusable |
| 7–8 | Guided practice with gradual removal of support | Hints lead from IDEA → STRUCTURE → LANGUAGE, without revealing full answers |
| 9 | Independent response from a new question | Student transfers skill, not copies the Guided model |
| 10 | Reflection, strategy for difficult prompts and spaced-review plan | Correct personal error and prepare for day 2/7/21 retrieval |

**Activity blueprint per lesson:** 4 Guided tasks, 3 Independent tasks and 2 Mastery tasks. Mastery prompts and their meaningful follow-ups remain server-only until the prescribed phase. Each Guided model is available only after submission, with model answer, Vietnamese translation, English teaching explanation and Vietnamese teacher reasoning.

### Illustration (new illustrative teaching content, NOT a private test-bank item)

**Skill:** giving a preference with a reason and an example.

**Step-by-step learner demonstration:**
- Idea: *I prefer studying somewhere quiet.*
- Reason: *This is mainly because I can concentrate more easily.*
- Example: *For instance, I often review vocabulary at the library.*
- Natural combined response: *I prefer studying somewhere quiet because it helps me focus. For example, I usually review new words at the library.*

**Three progressive hints in a Guided exercise:**
- Hint 1 — Idea: chọn địa điểm em thích và nói một lợi ích thực tế.
- Hint 2 — Structure: `I prefer ... because ...`; add a specific reason.
- Hint 3 — Vocabulary: `concentrate`, `avoid distractions`, `a quiet environment`.

**Teacher response after student submission:** show one natural model, translate its meaning, explain why the conjunction *because* connects preference and reason, and explain in Vietnamese how to replace repetitive *good* with a clearer idea such as *helps me focus*. Do not promise or assign a real IELTS band from this answer alone.

## 5. Four production-review rounds — plan, NOT executed

| Round | Lessons | Primary objective |
|---|---|---|
| A | S6-001 to S6-011 | Teach-before-assess, clear EN/VI steps, four varied Guided tasks and graduated hints |
| B | S6-012 to S6-022 | Independent transfer: reduce scaffolds; natural grammar, collocation, pronunciation feedback |
| C | S6-023 to S6-033 | Mastery difficulty, genuinely unseen questions and reasoning-based Part 3-style follow-ups |
| D | S6-034 to S6-044 | Across-lesson progression, prompt variety, meaningful days 2/7/21 review and 6.5 readiness |

Each source lesson needs a **secure inspection** and **qualified human review**. Prioritize any P0 finding across all four rounds before processing P1 or P2 issues. Teachers should also assess IELTS Speaking fluency/coherence, lexical resource, grammar range/accuracy and pronunciation without conflating editorial scores with the official candidate band descriptors.

## 6. Safe commands

```bash
# Safe, no keys, no network and no private files.
node scripts/speaking-s6-l34-editorial-remediation.mjs

# On a secure operator-owned machine with exactly 44 authorized
# original signed lesson + private-bank JSON files:
node scripts/speaking-s6-l34-editorial-remediation.mjs \
  --inspect-private-local-dir /PRIVATE_DIR

# Run independent metadata and unit regression checks:
npm test -- tests/speaking-s6-l34-editorial-remediation.test.mjs
node scripts/speaking-s6-l33-teacher-review.mjs
node scripts/speaking-s6-l29-release-gate.mjs
npm run build
```

The private-directory invocation uses the existing L33 read-only file checks. It prints **only lesson IDs, issue codes, action instructions and counts**, never source paths, private questions, models or learner responses. It cannot update L34's repository manifest automatically: an operator must independently review and enter supported, redacted evidence.

**Default expected report:** `HOLD_MISSING_SOURCE_COVERAGE`, `NOT_SCANNED=44`, zero *reported* findings, zero certified teacher approvals. The empty register does **not** mean the curriculum is ready.

## 7. Revision / QA / release sequence

1. Obtain rights-cleared source and the corresponding server-only bank securely.
2. Run local L33 structural scan and L34 priority draft; preserve original revision, signatures and learner records.
3. For each real finding, request an editor-authored **ADD-ONLY** revision with new student/private hash values. Never overwrite published content or the 300 existing Dictation lessons unrelated to S6.
4. Run L33 + L34 structural scan again and get an independent qualified teacher to review the *actual content* against the 100-point rubric.
5. Record redacted evidence. Do not move a lesson to `APPROVED` if its hashes, author/reviewer separation or teacher checklist are incomplete.
6. Run 50/50 real Supabase E2E and 11/11 physical-device checks; obtain S5/teacher/audio/privacy/import signoffs. Keep all five gates false until authorization.

**M10-L34 decision:** code and procedural backlog preparation can be completed, but substantive review requires the absent source packages. S6 and S7 stay unreleased.

**Next milestone M10-L35:** secure source-package intake and prioritized teacher correction, including manual paraphrase/cross-topic difficulty review and actual verified 44-lesson evidence.
