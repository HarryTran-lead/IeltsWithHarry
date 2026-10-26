# Source licensing and attribution

Verified on 2026-10-27:

| Source | Supported source scope | License evidence | Attribution |
| --- | --- | --- | --- |
| [BandReady](https://github.com/Luxshan2000/ielts-prep) | `content/core-en/data/{reading_passages,listening_scripts,writing_prompts,speaking_cards}.jsonl` | [Pack documentation](https://github.com/Luxshan2000/ielts-prep/blob/main/content/README.md) states first-party `core-en` is CC0-1.0; [manifest](https://github.com/Luxshan2000/ielts-prep/blob/main/content/core-en/manifest.json) declares `CC0-1.0` | BandReady Core and original file URL |
| [IELTS AI Dataset](https://github.com/LuchoBazz/ielts-ai-dataset) | current `datasets/practice-drills` and `datasets/synthetic-official-mocks` JSON/manifest files | [LICENSE](https://github.com/LuchoBazz/ielts-ai-dataset/blob/main/LICENSE) is CC BY 4.0 | IELTS AI Dataset by LuchoBazz, original file URL, and explicit AI-generated label |

Each sync checks the upstream license at the pinned commit. A changed or missing license stops the job. The database stores the license URL and original source URL with each exam. AI-created content requires admin review and does not claim to be official IELTS material. The site does not imply affiliation with IELTS organizations.

Admin uploads require the uploader to confirm reuse and publication rights; the action, user, source URL and license are saved in `ielts_review_log`. A public website without redistribution permission must be stored as a link-only item in a future connector; this release does not scrape or republish such sites. BandReady's source Listening scripts have no licensed audio file in the selected pack, so those records stay in review with `audio_missing`.
