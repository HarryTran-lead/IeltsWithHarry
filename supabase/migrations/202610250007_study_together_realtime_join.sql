-- Realtime checks broadcast read permission when a private channel joins,
-- even if this room uses Postgres Changes for messages and Presence for peers.
drop policy study_together_presence_read on realtime.messages;
create policy study_together_channel_read on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'study-together' and extension in ('broadcast', 'presence'));
