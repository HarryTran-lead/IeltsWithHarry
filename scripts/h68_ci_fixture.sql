\set ON_ERROR_STOP on
-- Dedicated PostgreSQL 16 test database only. No real auth.users, learner data or secrets.
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$fn$;
CREATE SCHEMA r19_h58;
CREATE TABLE r19_h58.actors(user_id uuid PRIMARY KEY,role text NOT NULL);
CREATE TABLE r19_h58.probes(
 probe_id text PRIMARY KEY,source_vi text NOT NULL,answer_en text NOT NULL,
 fingerprint char(64) NOT NULL,split text NOT NULL CHECK(split IN ('development','holdout'))
);
CREATE TABLE r19_h58.assignments(
 probe_id text NOT NULL REFERENCES r19_h58.probes(probe_id),
 reviewer_id uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 PRIMARY KEY(probe_id,reviewer_id)
);
CREATE TABLE r19_h58.reviews(
 probe_id text NOT NULL,reviewer_id uuid NOT NULL,
 fingerprint char(64) NOT NULL,meaning text NOT NULL,grammar text NOT NULL,
 evidence_quote text NOT NULL,reason text NOT NULL,uncertainty_reason text NOT NULL,
 PRIMARY KEY(probe_id,reviewer_id),
 FOREIGN KEY(probe_id,reviewer_id) REFERENCES r19_h58.assignments(probe_id,reviewer_id)
);
CREATE TABLE r19_h58.audit(
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL,operation text NOT NULL,probe_id text,
 payload_digest char(64) NOT NULL,previous_hash char(64) NOT NULL,
 event_hash char(64) NOT NULL
);
REVOKE ALL ON SCHEMA r19_h58 FROM PUBLIC,authenticated,anon;
REVOKE ALL ON ALL TABLES IN SCHEMA r19_h58 FROM PUBLIC,authenticated,anon;
INSERT INTO r19_h58.actors(user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','TEACHER'),
 ('22222222-2222-4222-8222-222222222222','TEACHER'),
 ('33333333-3333-4333-8333-333333333333','OWNER');
INSERT INTO r19_h58.probes(probe_id,source_vi,answer_en,fingerprint,split) VALUES
 ('p1','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('a',64),'development'),
 ('p2','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('b',64),'development'),
 ('p3','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('c',64),'development'),
 ('holdout-p4','Giáo viên giúp học sinh.','The teacher helped the student.',repeat('d',64),'holdout');
INSERT INTO r19_h58.assignments(probe_id,reviewer_id) VALUES
 ('p1','11111111-1111-4111-8111-111111111111'),
 ('p2','11111111-1111-4111-8111-111111111111'),
 ('p3','11111111-1111-4111-8111-111111111111'),
 ('holdout-p4','11111111-1111-4111-8111-111111111111');
\ir ../sql/001_h68_review_staging_create_only.sql
