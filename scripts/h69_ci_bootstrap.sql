\set ON_ERROR_STOP on
-- H69 isolated CI ONLY, never run against Supabase.
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$fn$;
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555'),
 ('66666666-6666-4666-8666-666666666666');
\ir ../sql/h69_ci_h58_blueprint.sql
INSERT INTO r19_h58.actors(user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','TEACHER'),
 ('22222222-2222-4222-8222-222222222222','TEACHER'),
 ('33333333-3333-4333-8333-333333333333','TEACHER'),
 ('44444444-4444-4444-8444-444444444444','OWNER'),
 ('66666666-6666-4666-8666-666666666666','COORDINATOR');
INSERT INTO r19_h58.probes(probe_id,source_vi,answer_en,source_sha256,fingerprint,split)
VALUES
 ('h69-dev-1','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('a',64),repeat('b',64),'development'),
 ('h69-holdout-2','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('c',64),repeat('d',64),'holdout'),
 ('h69-unassigned-3','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('e',64),repeat('f',64),'development');
INSERT INTO r19_h58.assignments(probe_id,slot,reviewer_id,assigned_by)
VALUES
 ('h69-dev-1','A','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444'),
 ('h69-dev-1','B','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'),
 ('h69-dev-1','C','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'),
 ('h69-holdout-2','A','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444');
\ir ../sql/001_h68_review_staging_create_only.sql
