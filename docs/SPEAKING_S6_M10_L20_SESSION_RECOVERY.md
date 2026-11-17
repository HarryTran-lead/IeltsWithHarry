# M10-L20 — Speaking S6 session resilience (staging branch)

## Code improvements
- use-local-recording.ts: an epoch invalidates asynchronous callbacks after cancel, reset, navigation or unmount; stale audio no longer overwrites new takes.
- recording-policy.ts: validates MIME, 10 MiB size ceiling, and owner/attempt UUID for optional private upload.
- Session API action=status: returns only the original question for the authenticated attempt owner and valid lesson revision, never Mastery follow-up or Guided answer.
- Session API action=submit: identical retry returns HTTP 200 with alreadySubmitted, conflicting retry returns HTTP 409, and racing writes recheck the stored response.
- UI stores only an attempt ID in sessionStorage, not answers, audio, or unseen prompts. Reload requires a server ownership check.
- Guided feedback may be retrieved again after a successful submit; users can delete their attempts and request removal of stored audio.

## Known limitation
A previously uploaded audio Blob cannot be recovered locally after reload. Resuming an unsubmitted attempt requires recording again. If the previous recording was already uploaded, delete the old attempt and start a fresh one to avoid file duplication. Never silently replace the existing stored audio.

## Validation and safety
- Pure tests cover MIME variants, max bytes, unsafe paths and discarded stale callback epochs.
- Mock session API tests cover recovery, ownership, Mastery prompt isolation and idempotent retries.
- GitHub Actions runs typecheck, lint, tests and build. This is not a real Supabase staging or mobile device test.
- No R11 private answers are committed to public GitHub.
- No production database changes, release-gate toggles, S6 unlock or S7 unlock occur.
- All 38 real E2E scenarios stay NOT_RUN unless evidence from an isolated staging project and device tests is recorded.

## Follow-up
1. Confirm this commit passes GitHub Actions.
2. Validate in a disposable Supabase staging project with learner A, learner B and an admin.
3. Test real iOS Safari and Android Chrome recording, MIME, abort and refresh.
4. Simulate network drop after submit and retry exact/different content.
5. Verify deleting an attempt removes the audio object, and repeat across two accounts.
6. Keep five release gates false until an independent reviewer signs off.
