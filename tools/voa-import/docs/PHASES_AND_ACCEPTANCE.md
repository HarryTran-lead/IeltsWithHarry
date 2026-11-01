# Codex phased implementation, production acceptance

**P0: Audit**
- Inspect actual repo/framework, DB schema, auth/admin roles, existing Dictation features, storage, CI and deployment.
- Preserve UI shell/sidebar and existing features. Avoid duplicate modules and dependencies.
- Do not assume Supabase or Cloudflare is currently connected.

**P1: VOA metadata discovery**
- Build source-only admin page and worker/service based on included importer.
- Seed VOA L1 52 pages, L2 30 pages, official RSS category feeds; add approved historical manifests/sitemap pages where allowed.
- Idempotent sync, pagination, capped RSS, status counters, detailed error logs, export coverage report.
- Acceptance: re-run doesn't duplicate; `403/429` stops; published content unchanged.

**P2: rights & QA**
- Review page shows source URL, audio candidate, transcript, third-party warning.
- Admin confirms exact audio/text alignment, provenance and CEFR label.
- Acceptance: cannot publish without explicit rights + transcript + audio + segment QA; missing or blocked media remains draft.

**P3: media import**
- Upload reviewed media to R2 Standard via background jobs, not HTTP request handler; guard free-tier quotas.
- Play source audio from your own storage; signed/read-only URLs or audited public bucket; Content-Type audio/mpeg.
- Acceptance: MP3 play/pause/speed, file duplicate detection and human voice preserved; sample audio checked on laptop, iPad, mobile.

**P4: Dictation learning**
- Browse by A1–C1 and topic, audio player with per-sentence replay, Listen & Type, Listen & Read, Gap Fill, transcript reveal, word-diff, keyboard shortcuts, progress and Mistake Bank.
- Account/save lesson resume and accessibility (tab navigation, focus, screen reader labels, mobile/iPad).
- Acceptance: all core modes work with verified real-audio VOA lessons; 13-word edge cases covered (apostrophe, punctuation, missing word, repeat).

**P5: auto-sync**
- Daily VOA RSS metadata check only; historical archives on manual or lower frequency plan; never auto-publish.
- Retry transient network failures with a controlled backoff but never bypass blocks.
- Acceptance: no duplicate rows, track last success/failure, no unapproved uploads, no cost overruns.

**P6: production gate**
- End-to-end permissions, RLS, import logs, CDN CORS/range playback, reliable transcript/media, no unsupported source mirroring, secrets protected.
- If any QA missing: turn feature flag off for public production.

**Reports to user after Codex run:** scanned/discovered counts, audio candidate counts, approved/blocked/rejected, downloaded/verified/uploaded, DB bytes, storage bytes, failed sources and why, URLs available on website. Never claim full archive without independently proving completeness.
