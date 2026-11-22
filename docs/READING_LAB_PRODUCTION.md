# Reading Skill Lab M08 production release

The Reading Lab route is `/app/reading/lab`. The production API reads only published `manual` exams whose external IDs are `reading-lab-m08-*`. It loads answer keys on the server, redacts them before submission, scores on the server, and saves submitted attempts. The 35 raster assets are static files under `public/reading-lab/assets`; 23 are referenced by questions. The full private candidate JSON remains outside Git.

## Source and approval

- Source: `IELTS_Reading_Codex_Staging_S04_1_FULL_PRIVATE_Handoff.zip`, SHA-256 `1f441cfee2b4ec2ee8aa6cf126813a4195090b8933cb7cf40543073c5efd2da2`.
- On 2026-11-22, the project owner confirmed publication rights and content/answer review for all 36 exams, plus commercial-use and modification/translation rights for the text and 35 images.
- The record of those statements is stored privately at `rights-evidence/reading-lab-m08/owner-approval-2026-11-22.txt`. The database rights entries point to that record and the source hash.
- This release uses the owner's confirmation as the approval; it does not claim an independent third-party review or IELTS endorsement.

## Import and publication

`scripts/import-reading-lab-m08.ts` audits all source exams before any write. With `--write-drafts`, it imports only unpublished versions. With `--publish`, it requires a private rights document, an admin reviewer ID, the source archive SHA-256, and explicit confirmation of commercial and modification rights. The script is idempotent for versions already published at the expected hash.

Keep `READING_LAB_S03_DATA_DIR` and service credentials outside Git. The S04.1 archive can be extracted with `scripts/install-reading-lab-preview.py`. The production `manual` source, rights evidence, and existing `ielts_exams` / `ielts_exam_versions` tables require no new migration.

Verification before release: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, the dry-run importer (36 exams, 1,120 questions, 1,412 evidence offsets, 23 referenced images), then CI and live API checks. The original handoff's editorial caveats, including blank `wordClass` guidance, should remain visible in internal review records.
