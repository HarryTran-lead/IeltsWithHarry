# M11-L89 Speaking Auth/RLS staging acceptance — DO NOT MERGE

## State
- Feature branch only, Draft PR only. Production **HOLD**; S6 **HOLD**; S7 **LOCKED**.
- No Supabase staging credentials have been provided to this task. The 46 cases inherited from L85/L86 remain **PENDING (0/46 accepted)**.
- Local unit tests and GitHub CI do not prove real Supabase RLS enforcement.

## Integration
- `speaking-mock.tsx` keeps the demo IndexedDB replay path unchanged.
- Cloud replay now calls `fetchPrivateAudio` with `auth.getUser()` before and after private Storage download.
- On 401: one `refreshSession()`, identity recheck, one download retry; never retry 403.
- The required storage path is `ownerUUID/sessionUUID/answerIndex.webm|mp4|ogg`, index 0–49.
- Account change and SIGNED_OUT invalidate requests, synchronously pause media, and clear local playback. They do **not** revoke tokens on other devices or already-issued signed URLs.
- No signed URL generation, new migration, service role or server-only answer data.

## Staging evidence requirements (must be genuinely run and reviewed)
1. Reviewer certifies **staging environment identity** (non-production Supabase URL/project), separate disposable A/B accounts, and zero genuine learner recordings.
2. A on device 1 uploads a synthetic recording. A on device 2 can read the same account's recording only where expected.
3. B cannot SELECT A's `speaking_mock_recordings` row, list A's Storage objects, download A's path or delete A's audio. Record actual HTTP status and sanitized Supabase DB/RLS evidence.
4. Expire A's token; 401 refresh succeeds once or fails closed; 403 does not retry. Test refresh/switch/signout during in-flight downloads and network interruptions.
5. Reviewer checks returned media MIME/size, no signed audio URL / token in logs, new tab playback, cleanup on logout and cross-device behavior.
6. Attach sanitized CI URL, branch HEAD SHA, browser context IDs, timestamps, 46-case matrix, and reviewer sign-off. Never report PASS from simulation alone.

## Gates
- CI must pass real `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` for this branch.
- Staging Auth/RLS and 46-case signoff are independent gates.
- No main modification, merge, migration or production deployment authorized in this milestone.
