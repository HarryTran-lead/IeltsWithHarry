-- Source-paired audio clips. Counts come from these inserted rows, not targets.
insert into public.dictation_clips (id,bank,source_id,title,source_url,source_dataset,license_url,attribution,audio_object_key,audio_sha256,audio_bytes,duration_ms,status,qa_note) values ('00e05e07-e58b-5f11-b218-90601fa569d8','quick','libritts:dev-clean:251_118436_000006_000001','Clip 606 · voice 251','https://www.openslr.org/60/','LibriTTS dev-clean','https://creativecommons.org/licenses/by/4.0/','LibriTTS · speaker 251 · CC BY 4.0','dictation/clips/quick/e81027d779fc14f8c156df0c19bba83798f8a69fca777665d3fee38e710cd83c.wav','e81027d779fc14f8c156df0c19bba83798f8a69fca777665d3fee38e710cd83c',243884,5080,'preview','Source-paired clip; listening QA pending') on conflict (source_id) do nothing;
insert into public.dictation_clip_answers(clip_id,reference_text) values ('00e05e07-e58b-5f11-b218-90601fa569d8','Through the hot, stifling night the temple gongs boomed and the conchs roared.') on conflict (clip_id) do nothing;
insert into public.dictation_clips (id,bank,source_id,title,source_url,source_dataset,license_url,attribution,audio_object_key,audio_sha256,audio_bytes,duration_ms,status,qa_note) values ('ccfe3ec4-02bf-54a9-a11c-1decb8f5f728','quick','libritts:dev-clean:251_118436_000022_000000','Clip 615 · voice 251','https://www.openslr.org/60/','LibriTTS dev-clean','https://creativecommons.org/licenses/by/4.0/','LibriTTS · speaker 251 · CC BY 4.0','dictation/clips/quick/831e6e6f566cb2f31c98372c78748a2b2b9062790c634d10e5e2cead133c5a60.wav','831e6e6f566cb2f31c98372c78748a2b2b9062790c634d10e5e2cead133c5a60',122924,2560,'preview','Source-paired clip; listening QA pending') on conflict (source_id) do nothing;
insert into public.dictation_clip_answers(clip_id,reference_text) values ('ccfe3ec4-02bf-54a9-a11c-1decb8f5f728','''Point of contact?'' inquired the other.') on conflict (clip_id) do nothing;
insert into public.dictation_clips (id,bank,source_id,title,source_url,source_dataset,license_url,attribution,audio_object_key,audio_sha256,audio_bytes,duration_ms,status,qa_note) values ('c2f0b647-0a69-58c9-afc4-87a442080521','quick','libritts:dev-clean:251_118436_000016_000001','Clip 620 · voice 251','https://www.openslr.org/60/','LibriTTS dev-clean','https://creativecommons.org/licenses/by/4.0/','LibriTTS · speaker 251 · CC BY 4.0','dictation/clips/quick/8355eee9a24f62ad4bb55747d5f61d24f1d18c35a09ab8b134e35df9efded6bd.wav','8355eee9a24f62ad4bb55747d5f61d24f1d18c35a09ab8b134e35df9efded6bd',187724,3910,'preview','Source-paired clip; listening QA pending') on conflict (source_id) do nothing;
insert into public.dictation_clip_answers(clip_id,reference_text) values ('c2f0b647-0a69-58c9-afc4-87a442080521','He was a tall man, compactly built, and richly clad.') on conflict (clip_id) do nothing;
do $$ begin if (select count(*) from (values ('libritts:dev-clean:251_118436_000006_000001','e81027d779fc14f8c156df0c19bba83798f8a69fca777665d3fee38e710cd83c'),('libritts:dev-clean:251_118436_000022_000000','831e6e6f566cb2f31c98372c78748a2b2b9062790c634d10e5e2cead133c5a60'),('libritts:dev-clean:251_118436_000016_000001','8355eee9a24f62ad4bb55747d5f61d24f1d18c35a09ab8b134e35df9efded6bd')) expected(source_id,sha) join public.dictation_clips c on c.source_id=expected.source_id and c.audio_sha256=expected.sha join public.dictation_clip_answers a on a.clip_id=c.id) <> 3 then raise exception 'Dictation clip seed mismatch'; end if; end $$;

-- Remove source introductions that are not useful dictation sentences.
update public.dictation_clips
set status = 'blocked', qa_note = 'Source introduction; excluded from learner catalog'
where source_id in (
  'libritts:dev-clean:2902_9006_000000_000001',
  'libritts:dev-clean:2902_9006_000006_000000',
  'libritts:dev-clean:2902_9006_000000_000000'
);

do $$ begin
  if (select count(*) from public.dictation_clips where bank = 'quick' and status in ('preview', 'published')) <> 800
    or (select count(*) from public.dictation_clips where bank = 'numbers' and status in ('preview', 'published')) <> 100
    or (select count(*) from public.dictation_clips where status = 'blocked' and source_id in (
      'libritts:dev-clean:2902_9006_000000_000001',
      'libritts:dev-clean:2902_9006_000006_000000',
      'libritts:dev-clean:2902_9006_000000_000000'
    )) <> 3
  then raise exception 'Dictation quality catalog count mismatch'; end if;
end $$;
