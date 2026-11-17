# M10-L17 — S6 staging RLS security fix & execution guide

## Verified
- Github Actions Quality was successful for L16 commit 5437484b.
- 44 R11 payloads have been validated offline; all files are under the 200 kB import API limit.
- A direct Supabase bypass risk was identified: L14 published lesson RLS checked global QA but not per-user S5.
- L17 migration closes the direct-table read bypass using auth.uid() and verified S5 evidence.

## Still NOT RUN
All 38 L16 E2E checks requiring a disposable Supabase staging database, learner A/B/admin sessions, Vercel preview deployment or iOS/Android devices. This is NOT a production security certification.

## Exact isolated staging sequence
1. Use a newly created disposable Supabase project, NOT production. Set five global S6 QA gates to false.
2. Run SQL migrations L14, L15, L17 IN ORDER. Record SQL errors and role privileges.
3. Create test accounts admin, learner A and learner B; give S5 signed evidence only to A.
4. Import a single private S6-001 R11 payload via authenticated admin preview; expect 201. Reimport -> 409; altered hash -> 422.
5. While global gates are false, anon/A/B must not view published or private content. Admin preview may access staging.
6. On isolated staging only, temporarily enable all QA gates and mark an isolated lesson published. Through direct Supabase PostgREST, learner A with S5 may select student_content; B without S5 must receive no rows. Neither can select private bank. Revoke S5 from A and confirm access disappears.
7. With two users, test ownership for progress, attempts and audio storage. Test guided feedback and Mastery follow-up before/after initial submit.
8. Test microphone permissions and MIME on iOS Safari and Android Chrome.
9. Return all gates to false; delete staging seed data and verify absence of test users/recordings/attempts.
10. Do not publish to production or unlock S7. Sign 38 E2E results with timestamp, expected vs actual, anonymized user role and evidence.

## Important
Do not put private R11 import files or session tokens into this public GitHub repo. Existing master-level answers are server-only.
