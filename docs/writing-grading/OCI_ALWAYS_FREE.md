# Oracle Always Free worker plan

This is a deployment plan for the private Writing inference worker, not evidence that live grading is ready. The current Supabase project stores attempts and can store jobs; the Ollama model must run on a separate compute instance. Do not enable `WRITING_AUTOGRADING_ENABLED` until the model, database migration, worker, and human evaluation gates in `DEPLOYMENT_RUNBOOK.md` pass.

## Account and VM

1. Sign up at <https://signup.oraclecloud.com>. The account owner completes email, phone, identity, and card verification. The home region cannot be changed. Use only an **Always Free-eligible** shape in that home region. Oracle's current Always Free A1 allocation is **2 OCPU and 12 GB RAM**. Capacity can be unavailable, and idle instances may be reclaimed. Sources: <https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm> and <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>.
2. Create one Ubuntu Arm VM with shape `VM.Standard.A1.Flex`, 2 OCPU, 12 GB RAM, and an Always Free-eligible boot volume. Add an SSH **public** key. Keep TCP 11434 closed in the VCN/security list; Ollama must listen only on `127.0.0.1`. Allow outbound HTTPS so the worker can reach the production Supabase project. Do not expose the service-role key to the browser or Git.
3. Install Node.js 22 for Linux Arm64, Ollama for Linux Arm64, and PostgreSQL client tools. Clone the reviewed repository revision and run `npm ci`. Pull a pinned model such as `qwen3:4b-instruct-2507-q4_K_M` for an internal smoke run. The Ollama catalog currently lists this artifact at about 2.5 GB; memory fit and CPU latency still require measurement. Source: <https://ollama.com/library/qwen3>.

## Database and secrets

1. Back up the development Supabase project and verify its ref is `bhactqaxcvusmpeooxwi`. Apply `202611100004_writing_grading_foundation.sql` there first. Run the authenticated submit/queue/result and RLS checks. Repeat backup and migration against production ref `vpkhriywprepuhrbarye` only after staging passes. Never reset either database.
2. Read the exact model digest from Ollama `GET http://127.0.0.1:11434/api/tags`. Put the model tag in `WRITING_LOCAL_MODEL_ID` and its full 64-character digest in `WRITING_LOCAL_MODEL_REVISION`. The worker now refuses a changed or missing digest at startup. Keep `WRITING_LOCAL_MODEL_URL=http://127.0.0.1:11434`.
3. Place `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a root-managed environment file readable only by the service account. Do not commit the file or paste the key into chat. Do not insert an `approved` registry row solely because the model downloaded; document weights and training-data rights and run independent teacher-labeled evaluation first.

## Smoke, supervision, and rollout

Run `npx tsx scripts/smoke-writing-local.ts` with the local model variables. It uses only a synthetic Task 2 essay, checks the pinned digest and output contract, and prints latency and validation counts. It does not save a learner result or prove IELTS band accuracy. The worker has a 15-minute lease and a 12-minute inference timeout for slow CPU hosts; benchmark actual latency before setting a cohort size.

After approval and migration, run `npx tsx scripts/writing-grading-worker.ts --once` with the private environment file, then supervise the continuous command with systemd. Keep Ollama on loopback. The app flag stays false until an authenticated development run verifies submit → queued → completed result, followed by a limited production rollout. If the model or worker fails, leave the flag false and preserve submissions; never show a made-up band.
