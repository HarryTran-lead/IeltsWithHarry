-- H69 test fixture: verbatim structural baseline from H58 R14. NEVER use this CI file as a staging migration.
-- Supabase roles and auth.users must be created by scripts/h69_ci_bootstrap.sql in isolated CI only.
BEGIN;
CREATE SCHEMA r19_h58;
REVOKE ALL ON SCHEMA r19_h58 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA r19_h58 TO service_role;
CREATE TABLE r19_h58.actors (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 role text NOT NULL CHECK (role IN ('TEACHER','COORDINATOR','ADJUDICATOR','OWNER')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE r19_h58.probes (
 probe_id text PRIMARY KEY, source_vi text NOT NULL, answer_en text NOT NULL,
 source_sha256 char(64) NOT NULL, fingerprint char(64) UNIQUE NOT NULL,
 split text NOT NULL CHECK (split IN ('development','holdout')),
 provenance text NOT NULL DEFAULT 'ORIGINAL_EDITORIAL_UNVERIFIED',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE r19_h58.assignments (
 probe_id text NOT NULL REFERENCES r19_h58.probes(probe_id),
 slot char(1) NOT NULL CHECK (slot IN ('A','B','C')),
 reviewer_id uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 assigned_by uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(probe_id,slot), UNIQUE(probe_id,reviewer_id)
);
CREATE TABLE r19_h58.reviews (
 probe_id text NOT NULL, reviewer_id uuid NOT NULL, fingerprint char(64) NOT NULL,
 meaning text NOT NULL CHECK(meaning IN ('PRESERVES_MEANING','MEANING_DRIFT','UNCERTAIN')),
 grammar text NOT NULL CHECK(grammar IN ('ACCEPTABLE','MINOR_FORM_ISSUE','MAJOR_FORM_ISSUE','NOT_RATED')),
 evidence_quote text NOT NULL, reason text NOT NULL,
 uncertainty_reason text NOT NULL DEFAULT '',
 submitted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(probe_id,reviewer_id),
 FOREIGN KEY(probe_id,reviewer_id) REFERENCES r19_h58.assignments(probe_id,reviewer_id)
);
CREATE TABLE r19_h58.adjudications (
 probe_id text PRIMARY KEY REFERENCES r19_h58.probes(probe_id),
 adjudicator_id uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 decision text NOT NULL CHECK(decision IN ('PRESERVES_MEANING','MEANING_DRIFT','DEFER')),
 evidence_quote text NOT NULL, rationale text NOT NULL,
 decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE r19_h58.rights_attestations (
 probe_id text PRIMARY KEY REFERENCES r19_h58.probes(probe_id),
 owner_id uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 evidence_note text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE r19_h58.approvals (
 probe_id text PRIMARY KEY REFERENCES r19_h58.probes(probe_id),
 owner_id uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 approved_label text NOT NULL CHECK(approved_label IN ('PRESERVES_MEANING','MEANING_DRIFT')),
 rationale text NOT NULL, fingerprint char(64) NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 release_scope text NOT NULL DEFAULT 'EVAL_ONLY' CHECK (release_scope='EVAL_ONLY')
);
CREATE TABLE r19_h58.audit (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES r19_h58.actors(user_id),
 operation text NOT NULL, probe_id text, payload_digest char(64) NOT NULL,
 previous_hash char(64) NOT NULL, event_hash char(64) NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE table_name text;
BEGIN
 FOR table_name IN SELECT unnest(ARRAY['actors','probes','assignments','reviews','adjudications','rights_attestations','approvals','audit']) LOOP
  EXECUTE format('ALTER TABLE r19_h58.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE r19_h58.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON r19_h58.%I FROM PUBLIC, anon, authenticated',table_name);
  EXECUTE format('GRANT ALL ON r19_h58.%I TO service_role',table_name);
 END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA r19_h58 TO service_role;
CREATE FUNCTION r19_h58.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'IMMUTABLE_LEDGER';
END $$;
DO $$
DECLARE table_name text;
BEGIN
 FOR table_name IN SELECT unnest(ARRAY['probes','assignments','reviews','adjudications','rights_attestations','approvals','audit']) LOOP
  EXECUTE format('CREATE TRIGGER immutable_%I BEFORE UPDATE OR DELETE ON r19_h58.%I FOR EACH ROW EXECUTE FUNCTION r19_h58.reject_mutation()',table_name,table_name);
 END LOOP;
END $$;
COMMIT;
