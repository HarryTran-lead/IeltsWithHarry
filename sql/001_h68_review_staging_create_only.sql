-- H68 DRAFT: create-only staging migration. Requires previously DBA-reviewed r19_h58.
-- Do not run on production or a shared learner database without explicit approval.
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('r19_h58.actors') IS NULL OR to_regclass('r19_h58.probes') IS NULL
     OR to_regclass('r19_h58.assignments') IS NULL OR to_regclass('r19_h58.reviews') IS NULL
     OR to_regclass('r19_h58.audit') IS NULL THEN
    RAISE EXCEPTION 'H68_DEPENDENCY_H58_NOT_INSTALLED';
  END IF;
END $preflight$;
CREATE SCHEMA r19_h68;
REVOKE ALL ON SCHEMA r19_h68 FROM PUBLIC;
CREATE TABLE r19_h68.review_idempotency (
  reviewer_id uuid NOT NULL,
  key_hash char(64) NOT NULL,
  payload_hash char(64) NOT NULL,
  probe_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (reviewer_id, key_hash)
);
CREATE TABLE r19_h68.rate_windows (
  reviewer_id uuid NOT NULL,
  window_id bigint NOT NULL,
  attempts smallint NOT NULL CHECK (attempts BETWEEN 0 AND 11),
  PRIMARY KEY (reviewer_id, window_id)
);
CREATE TABLE r19_h68.audit_head (
  singleton integer PRIMARY KEY CHECK (singleton=1),
  last_hash char(64) NOT NULL
);
INSERT INTO r19_h68.audit_head(singleton,last_hash) VALUES (1, repeat('0',64));
-- Independent database kill switch; direct PostgREST calls cannot bypass the API flag.
CREATE TABLE r19_h68.release_controls (
 singleton integer PRIMARY KEY CHECK (singleton=1),
 review_writes_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO r19_h68.release_controls(singleton,review_writes_enabled) VALUES(1,false);
ALTER TABLE r19_h68.release_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE r19_h68.review_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE r19_h68.rate_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE r19_h68.audit_head ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA r19_h68 FROM PUBLIC;

-- Both RPCs obtain caller from auth.uid(), never from client parameters.
-- Exposed public RPC names remain inert to anon; table schemas stay private.
CREATE FUNCTION public.h68_rate_limit_review()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_actor uuid; v_bucket bigint; v_used smallint;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM r19_h68.release_controls WHERE singleton=1 AND review_writes_enabled) THEN
  RAISE EXCEPTION 'H68_DB_DISABLED' USING ERRCODE='42501';
 END IF;
 v_actor := auth.uid();
 IF v_actor IS NULL THEN RAISE EXCEPTION 'H68_AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM r19_h58.actors WHERE user_id=v_actor AND role='TEACHER') THEN
   RAISE EXCEPTION 'H68_TEACHER_REQUIRED' USING ERRCODE='42501';
 END IF;
 v_bucket := floor(extract(epoch from transaction_timestamp())/60)::bigint;
 INSERT INTO r19_h68.rate_windows(reviewer_id,window_id,attempts)
 VALUES(v_actor,v_bucket,1)
 ON CONFLICT(reviewer_id,window_id) DO UPDATE
 SET attempts=least(11,r19_h68.rate_windows.attempts+1)
 RETURNING attempts INTO v_used;
 RETURN v_used <= 10;
END $fn$;

CREATE FUNCTION public.h68_submit_review(
 p_probe_id text, p_fingerprint text, p_meaning text, p_grammar text,
 p_evidence_quote text, p_reason text, p_uncertainty_reason text,
 p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
 v_actor uuid; v_probe record; v_key_hash text; v_payload_hash text;
 v_existing record; v_prev_hash text; v_event_hash text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM r19_h68.release_controls WHERE singleton=1 AND review_writes_enabled) THEN
  RAISE EXCEPTION 'H68_DB_DISABLED' USING ERRCODE='42501';
 END IF;
 v_actor := auth.uid();
 IF v_actor IS NULL THEN RAISE EXCEPTION 'H68_AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 IF p_probe_id IS NULL OR length(p_probe_id) NOT BETWEEN 1 AND 120
 OR p_fingerprint IS NULL OR p_meaning IS NULL OR p_grammar IS NULL OR p_idempotency_key IS NULL
 OR p_fingerprint !~ '^[a-f0-9]{64}
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

REVOKE ALL ON FUNCTION public.h68_rate_limit_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.h68_rate_limit_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) TO authenticated;
COMMIT;

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

REVOKE ALL ON FUNCTION public.h68_rate_limit_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.h68_rate_limit_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.h68_submit_review(text,text,text,text,text,text,text,text) TO authenticated;
COMMIT;
