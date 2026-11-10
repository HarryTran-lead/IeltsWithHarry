# Open issues before live auto-grading

1. **P0 — No approved, pinned local scoring model or private inference host.** The new registry has no approved model rows. No real Task 1/2 model inference has run. The feature flag remains off; the API returns unavailable, never a fabricated band.
2. **P0 — No teacher-labeled independent Gold set or calibration.** JSON/evidence validation does not establish IELTS band agreement. Assess bias and abstention separately by task before a student rollout.
3. **P0 — Task 1 facts require manual verification.** Admin fact API exists, but there is no fact-editor UI, typed chart ontology, image/OCR verification or automated value checker. The worker refuses Task 1 without verified facts.
4. **P1 — Admin workflow is basic.** A Writing QA tab shows the queue, essay, model criteria, review inputs and source-fact form. Separate teacher roles, second rater/adjudication, metrics and dataset review are pending.
5. **P1 — Queue and privacy hardening.** Per-day limit is checked in application code, not atomically in Postgres. Add multi-worker load/lease tests, retention/deletion workflow, health metrics and alerting before enabling. The dataset manifest defaults to quarantined/no training; any export also needs a reviewed opt-in flow.
6. **P1 — Model output quality.** Local prompt asks for bilingual feedback, argument coverage and revision, but those semantics require human evaluation. No LanguageTool, independent task-2 encoder, chart claim parser or calibration ensemble is deployed.
7. **P1 — Staging migration and authenticated E2E.** The migration is committed but has not been applied to development or production. No student account has completed a live worker run.
8. **P2 — Student comparison history.** Existing attempt history remains available, but the new UI shows the latest grading job for one attempt. A version-aware comparison across regrades and rubric/model changes is pending.
