-- H70 DRAFT / DBA REVIEW ONLY. Never auto-run on production.
-- Migrate AFTER approved staging snapshot and preflight; route H70 must deploy
-- before enabling the existing H68 write gate. SQL kill switch remains OFF.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('r19_h58.probes') IS NULL OR to_regclass('r19_h68.release_controls') IS NULL THEN
   RAISE EXCEPTION 'H70_H58_H68_MISSING';
 END IF;
 IF EXISTS (SELECT 1 FROM r19_h68.release_controls WHERE singleton=1 AND review_writes_enabled) THEN
   RAISE EXCEPTION 'H70_DB_GATE_MUST_BE_DISABLED' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='r19_h70_executor') THEN
   RAISE EXCEPTION 'H70_ROLE_ALREADY_EXISTS_REVIEW_MANUALLY';
 END IF;
END $preflight$;
CREATE ROLE r19_h70_executor NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA auth, r19_h58, r19_h68 TO r19_h70_executor;
GRANT EXECUTE ON FUNCTION auth.uid() TO r19_h70_executor;

-- Private table and column privileges for the no-login definer.
GRANT SELECT(user_id,role) ON r19_h58.actors TO r19_h70_executor;
GRANT SELECT(probe_id,source_vi,answer_en,fingerprint,split) ON r19_h58.probes TO r19_h70_executor;
GRANT SELECT(probe_id,reviewer_id) ON r19_h58.assignments TO r19_h70_executor;
GRANT INSERT ON r19_h58.reviews TO r19_h70_executor;
GRANT INSERT ON r19_h58.audit TO r19_h70_executor;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA r19_h58 TO r19_h70_executor;

GRANT SELECT ON r19_h68.release_controls TO r19_h70_executor;
GRANT SELECT,INSERT ON r19_h68.review_idempotency TO r19_h70_executor;
GRANT SELECT,INSERT,UPDATE(attempts) ON r19_h68.rate_windows TO r19_h70_executor;
GRANT SELECT,UPDATE(last_hash) ON r19_h68.audit_head TO r19_h70_executor;

-- H58 tables have ENABLE + FORCE ROW LEVEL SECURITY.
CREATE POLICY h70_read_actors ON r19_h58.actors FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_read_probes ON r19_h58.probes FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_read_assignments ON r19_h58.assignments FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_insert_reviews ON r19_h58.reviews FOR INSERT TO r19_h70_executor WITH CHECK (true);
CREATE POLICY h70_insert_audit ON r19_h58.audit FOR INSERT TO r19_h70_executor WITH CHECK (true);
CREATE POLICY h70_read_release ON r19_h68.release_controls FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_read_idem ON r19_h68.review_idempotency FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_insert_idem ON r19_h68.review_idempotency FOR INSERT TO r19_h70_executor WITH CHECK (true);
CREATE POLICY h70_read_rate ON r19_h68.rate_windows FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_insert_rate ON r19_h68.rate_windows FOR INSERT TO r19_h70_executor WITH CHECK (true);
CREATE POLICY h70_update_rate ON r19_h68.rate_windows FOR UPDATE TO r19_h70_executor USING (true) WITH CHECK (true);
CREATE POLICY h70_read_audit_head ON r19_h68.audit_head FOR SELECT TO r19_h70_executor USING (true);
CREATE POLICY h70_update_audit_head ON r19_h68.audit_head FOR UPDATE TO r19_h70_executor USING (true) WITH CHECK (true);

-- Remove the legacy split two-RPC quota flow. It is bypassable by direct
-- PostgREST review calls and otherwise double-counts accepted reviews.
REVOKE ALL ON FUNCTION public.h68_rate_limit_review() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.h68_submit_review(
 p_probe_id text, p_fingerprint text, p_meaning text, p_grammar text,
 p_evidence_quote text, p_reason text, p_uncertainty_reason text,
 p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
 v_actor uuid; v_probe record; v_key_hash text; v_payload_hash text;
 v_existing record; v_prev_hash text; v_event_hash text;
 v_bucket bigint; v_used smallint;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM r19_h68.release_controls WHERE singleton=1 AND review_writes_enabled) THEN
  RAISE EXCEPTION 'H68_DB_DISABLED' USING ERRCODE='42501';
 END IF;
 v_actor := auth.uid();
 IF v_actor IS NULL THEN RAISE EXCEPTION 'H68_AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 IF p_probe_id IS NULL OR length(p_probe_id) NOT BETWEEN 1 AND 120
 OR p_fingerprint IS NULL OR p_meaning IS NULL OR p_grammar IS NULL OR p_idempotency_key IS NULL
 OR p_fingerprint !~ '^[a-f0-9]{64}$'
 OR p_meaning NOT IN ('PRESERVES_MEANING','MEANING_DRIFT','UNCERTAIN')
 OR p_grammar NOT IN ('ACCEPTABLE','MINOR_FORM_ISSUE','MAJOR_FORM_ISSUE','NOT_RATED')
 OR p_evidence_quote IS NULL OR length(btrim(p_evidence_quote)) NOT BETWEEN 2 AND 240
 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 20 AND 2000
 OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
 OR (p_meaning='UNCERTAIN' AND length(btrim(coalesce(p_uncertainty_reason,''))) < 12)
 OR length(coalesce(p_uncertainty_reason,'')) > 1000 THEN
   RAISE EXCEPTION 'H68_INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM r19_h58.actors a WHERE a.user_id=v_actor AND a.role='TEACHER') THEN
  RAISE EXCEPTION 'H68_TEACHER_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Quota now enforced INSIDE the same SECURITY DEFINER function, so calling
 -- PostgREST RPC directly cannot skip the HTTP rate-limit middleware.
 v_bucket := floor(extract(epoch from transaction_timestamp())/60)::bigint;
 INSERT INTO r19_h68.rate_windows(reviewer_id,window_id,attempts)
 VALUES(v_actor,v_bucket,1)
 ON CONFLICT(reviewer_id,window_id) DO UPDATE
 SET attempts=least(11,r19_h68.rate_windows.attempts+1)
 RETURNING attempts INTO v_used;
 IF v_used > 10 THEN
   RETURN jsonb_build_object('status','RATE_LIMITED','release_gate','BLOCKED');
 END IF;
 SELECT p.source_vi,p.answer_en,p.fingerprint,p.split INTO v_probe
 FROM r19_h58.probes p
 JOIN r19_h58.assignments a ON a.probe_id=p.probe_id
 WHERE p.probe_id=p_probe_id AND a.reviewer_id=v_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'H68_UNASSIGNED_OR_MISSING' USING ERRCODE='42501'; END IF;
 IF v_probe.fingerprint <> p_fingerprint THEN
  RAISE EXCEPTION 'H68_SOURCE_CHANGED' USING ERRCODE='23514';
 END IF;
 IF strpos(lower(v_probe.source_vi),lower(btrim(p_evidence_quote)))=0
   AND strpos(lower(v_probe.answer_en),lower(btrim(p_evidence_quote)))=0 THEN
  RAISE EXCEPTION 'H68_QUOTE_NOT_ANCHORED' USING ERRCODE='22023';
 END IF;
 v_key_hash := encode(sha256(convert_to(v_actor::text||':'||p_idempotency_key,'UTF8')),'hex');
 v_payload_hash := encode(sha256(convert_to(jsonb_build_object(
   'probe_id',p_probe_id,'fingerprint',p_fingerprint,'meaning',p_meaning,
   'grammar',p_grammar,'quote',btrim(p_evidence_quote),'reason',btrim(p_reason),
   'uncertainty',coalesce(p_uncertainty_reason,''))::text,'UTF8')),'hex');
 -- Serializes same actor+key. Unique constraints independently ensure exactly once.
 PERFORM pg_advisory_xact_lock(68068, hashtext(v_key_hash));
 SELECT payload_hash,probe_id INTO v_existing FROM r19_h68.review_idempotency
 WHERE reviewer_id=v_actor AND key_hash=v_key_hash;
 IF FOUND THEN
   IF v_existing.payload_hash <> v_payload_hash OR v_existing.probe_id <> p_probe_id THEN
    RAISE EXCEPTION 'H68_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('status','REPLAY','release_gate','BLOCKED');
 END IF;
 INSERT INTO r19_h58.reviews(
  probe_id,reviewer_id,fingerprint,meaning,grammar,evidence_quote,reason,uncertainty_reason
 ) VALUES (
  p_probe_id,v_actor,p_fingerprint,p_meaning,p_grammar,btrim(p_evidence_quote),btrim(p_reason),coalesce(p_uncertainty_reason,'')
 );
 -- Lock the chain head in the same database transaction as the review.
 SELECT last_hash INTO v_prev_hash FROM r19_h68.audit_head WHERE singleton=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'H68_MISSING_AUDIT_HEAD'; END IF;
 v_event_hash := encode(sha256(convert_to(v_prev_hash||'|'||v_actor::text||'|'||p_probe_id||'|'||v_payload_hash,'UTF8')),'hex');
 INSERT INTO r19_h58.audit(actor_id,operation,probe_id,payload_digest,previous_hash,event_hash)
 VALUES (v_actor,'H68_REVIEW_SUBMITTED',p_probe_id,v_payload_hash,v_prev_hash,v_event_hash);
 UPDATE r19_h68.audit_head SET last_hash=v_event_hash WHERE singleton=1;
 INSERT INTO r19_h68.review_idempotency(reviewer_id,key_hash,payload_hash,probe_id)
 VALUES(v_actor,v_key_hash,v_payload_hash,p_probe_id);
 RETURN jsonb_build_object('status','SUBMITTED','release_gate','BLOCKED');
END $fn$;


-- SECURITY DEFINER now executes with a dedicated no-login, no-BYPASSRLS
-- role, not the original broad-privilege creator.
ALTER FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) OWNER TO r19_h70_executor;
ALTER FUNCTION public.h68_rate_limit_review() OWNER TO r19_h70_executor;
REVOKE ALL ON FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) TO authenticated;

-- Cut off direct legacy service_role table grants in the isolated H58 schema.
-- On a live shared database, require DBA impact analysis and backup first.
REVOKE ALL ON ALL TABLES IN SCHEMA r19_h58 FROM service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA r19_h58 FROM service_role;
REVOKE USAGE ON SCHEMA r19_h58 FROM service_role;

DO $assert$
DECLARE v_role record;
BEGIN
 SELECT rolcanlogin,rolbypassrls,rolsuper INTO v_role
 FROM pg_roles WHERE rolname='r19_h70_executor';
 IF v_role.rolcanlogin OR v_role.rolbypassrls OR v_role.rolsuper THEN
   RAISE EXCEPTION 'H70_EXECUTOR_ROLE_IS_OVERPRIVILEGED';
 END IF;
 IF has_table_privilege('service_role','r19_h58.probes','SELECT')
 OR has_table_privilege('service_role','r19_h58.reviews','SELECT') THEN
   RAISE EXCEPTION 'H70_SERVICE_ROLE_STILL_HAS_TABLE_READ';
 END IF;
 IF NOT EXISTS (
 SELECT 1 FROM pg_proc WHERE oid='public.h68_submit_review(text,text,text,text,text,text,text,text)'::regprocedure
 AND proowner=(SELECT oid FROM pg_roles WHERE rolname='r19_h70_executor')
 AND prosecdef
 ) THEN
   RAISE EXCEPTION 'H70_FUNCTION_OWNER_NOT_HARDENED';
 END IF;
END $assert$;
COMMIT;
