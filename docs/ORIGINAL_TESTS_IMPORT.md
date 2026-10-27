# Owner-supplied original IELTS-style pilot tests

Source: `English_Skill_Lab_Source_10_Original_Tests.zip`, supplied on 27 October 2026. ZIP SHA-256: `f8cdcab564fd6775041cb4e39ba08563333437a5e687e33135205706b983f525`.

The ZIP contains five Academic Reading and five Listening papers, each with 40 questions. It contains scripts and answer keys, but **zero MP3 files**. Its own quality report labels the content a pilot, not publication-ready or band-calibrated. The Listening scripts are substantially shorter than a complete 30-minute recording. The dialogue and questions still need editorial review, and the owner-supplied rights assertion needs documentation before release. These are source facts, not instructions to run its bundled server or audio generator.

Independent checks on this ZIP found all 400 question numbers and answer keys present, all 400 supplied correct answers grade correctly, and no answer or transcript leaks through the learner payload. Every non-`NOT GIVEN` evidence quote appears in its passage or script. Content still needs human editing: across 540 Listening dialogue lines, only 397 are unique; one generic sentence repeats 30 times. One Reading paragraph repeats in six places. A structurally valid test is not yet a natural recording or a reliable IELTS-style assessment.

`scripts/import-original-tests.mts` reads only the ten JSON files from the ZIP; it never executes ZIP scripts. It validates IDs, 40 sequential questions, answer options and evidence, then maps the papers into the existing private IELTS bank. Answer keys stay in server-only exam versions. The import is idempotent and sets every paper to `needs_review` with explicit warnings. `reviewExam` blocks promotion of this pilot prefix until a later reviewed release process is built. **No paper is published by this import.**

Dry run:

```powershell
node --import tsx scripts/import-original-tests.mts --zip 'C:\path\English_Skill_Lab_Source_10_Original_Tests.zip'
```

Import to the isolated development database:

```powershell
node --env-file=.env.development.local --import tsx scripts/import-original-tests.mts --zip 'C:\path\English_Skill_Lab_Source_10_Original_Tests.zip' --target-ref bhactqaxcvusmpeooxwi --apply
```

The production database accepts **admin-only drafts** using `.env.production.local`, `--target-ref vpkhriywprepuhrbarye`, `--apply` and `--allow-production-drafts` after dev verification. The script checks the URL against the explicit project ref. Keep both environment files out of Git.

## Audio release gate

The requirement is a **human performance**, with consent or a suitable licence for site distribution. Do not substitute browser speech synthesis or generated voices for the missing MP3s. Record distinct speakers where the script is a dialogue; edit obvious unnatural lines first. For each of the 20 parts, check names, numbers, spelling, pace, accent consistency, pauses and question alignment by listening to the final MP3. Store reviewed files in the existing `ielts-audio` bucket and attach their URLs only after rights and editorial approval. Until then, Listening remains invisible to learners.

To prepare a hand-off for a human editor and performers, run:

```powershell
python scripts/build-original-recording-kit.py 'C:\path\English_Skill_Lab_Source_10_Original_Tests.zip' 'C:\path\IeltsWithHarry_Human_Recording_Kit.zip'
```

The resulting private ZIP has 20 editable actor scripts, 20 separate answer-cue review sheets, and a CSV recording plan. It removes 45 exact stock filler lines while checking that question evidence remains. **These scripts are working drafts, not approved copy.** A sample has incorrect speaker turns (the caller recites the library's rules while the clerk responds as the customer), and some repetitive correction exchanges. An editor must repair every dialogue and expand the short recordings before performers rehearse. The answer sheets must stay private, and a real listener must check each finished recording before any audio is attached to a test.

Reading also requires a question-by-question editor review. The package's structural validator and the import checks establish completeness, not exam validity, answer nuance, or an IELTS band score. Do not label the pilot official IELTS or use a score-to-band conversion.
