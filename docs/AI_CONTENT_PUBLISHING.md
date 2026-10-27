# Review and publishing

1. Admin creates the pilot. The existing bank receives an `ai-factory` exam with `audio_missing` and `needs_review`.
2. The private worker creates a draft MP3 and QA records. The audio is accessible in Admin only through a short-lived signed URL.
3. Admin listens, checks the ten answers, enters a note, and approves or rejects. Approval requires passed technical QA. It copies the audio into the existing public media bucket and saves a new exam revision with the audio URL.
4. Admin reviews that revision in the bank, marks it ready, and publishes it. The bank requires a matching approved audio job for factory Listening content.
5. Student attempts pin the published version; changing or archiving a later revision does not rewrite previous attempts.

No automatic publishing is configured. A rejection or QA failure does not appear to students. Existing published exams and attempts are not modified by the factory migration.
