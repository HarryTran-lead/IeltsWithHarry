// Pure, code-only adapter. The 1,975-record dataset is NEVER committed to GitHub.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep, join } from 'node:path';
export const FEEDS = Object.freeze({learner_guided:1140,server_only:831,shared:3,docs:1});
export const NAMESPACE = 'task2_rewrite_v2';
const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : value && typeof value === 'object' ? '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}' : JSON.stringify(value);
const fail = message => { throw Error('TASK2_BLOCKED:'+message); };
export function assertExternalBundle(bundle, checkout) {
  if (!bundle || !bundle.startsWith('/')) fail('ABSOLUTE_BUNDLE_PATH_REQUIRED');
  const root = realpathSync(bundle), repo = realpathSync(checkout);
  if (root === repo || root.startsWith(repo+sep)) fail('PRIVATE_BUNDLE_INSIDE_PUBLIC_REPOSITORY');
  return root;
}
export function validateBundle(root, expected=FEEDS, expectedSources=82) {
  const files=JSON.parse(readFileSync(join(root,'feeds/DATASET_INDEX.json'),'utf8'));
  if(!Array.isArray(files) || files.length!==expectedSources)fail('SOURCE_INDEX_COUNT');
  const byPath=new Map();
  for (const item of files) {
    if(!/^R(0[1-9]|1[0-6])\/(learner_guided|server_only|shared|docs)\/[\w./-]+\.json$/.test(item.source_path)||item.source_path.includes('..')||byPath.has(item.source_path))fail('SOURCE_PATH');
    if(hash(readFileSync(join(root,'canonical_flat_data',item.source_path)))!==item.file_sha256)fail('SOURCE_HASH');
    byPath.set(item.source_path,item);
  }
  const rows=[],counts={},hashes={},seen=new Set();
  for(const [feed,want] of Object.entries(expected)){
    const bytes=readFileSync(join(root,'feeds',feed+'_records.jsonl'));
    hashes[feed]=hash(bytes);
    const lines=bytes.toString('utf8').split('\n').filter(Boolean);
    if(lines.length!==want)fail('FEED_COUNT:'+feed);
    counts[feed]=lines.length;
    for(const line of lines){
      let r;try{r=JSON.parse(line)}catch{fail('BAD_JSONL')}
      if(!r||Array.isArray(r)||typeof r!=='object'||r.namespace!==NAMESPACE||r.visibility!==feed||!/^R(0[1-9]|1[0-6])$/.test(r.milestone))fail('RECORD_SCOPE');
      if(!r.payload||Array.isArray(r.payload)||typeof r.payload!=='object'||r.record_key!==r.logical_dataset_key+':'+r.row_id||seen.has(r.record_key))fail('RECORD_KEY');
      if(typeof r.logical_dataset_key!=='string'||!r.logical_dataset_key.startsWith(NAMESPACE+':'+r.milestone+':'))fail('DATASET_KEY');
      const src=byPath.get(r.source_path);
      if(!src||r.source_path.split('/')[1]!==feed||r.source_path.split('/')[0]!==r.milestone||r.source_sha256!==src.file_sha256||r.logical_dataset_key!==src.logical_dataset_key)fail('SOURCE_LINK');
      if(!/^[a-f0-9]{64}$/.test(r.payload_sha256)||hash(Buffer.from(canonical(r.payload),'utf8'))!==r.payload_sha256)fail('PAYLOAD_HASH');
      if(feed==='docs'&&r.payload.not_for_production_seed!==true)fail('DOCS_NOT_PUBLIC');
      if(feed==='learner_guided'&&/FINAL_LOCKED|SERVER_ONLY/i.test(r.source_path))fail('HIDDEN_PROMPT_LEAK');
      seen.add(r.record_key);rows.push(r);
    }
  }
  const fingerprint=Object.keys(FEEDS).map(name=>name+'_records.jsonl:'+hashes[name]).join('\n')+'\n';
  return {rows,counts,sourceCount:byPath.size,bundleSha256:hash(Buffer.from(fingerprint))};
}
export function assertStage({url,ref,productionRef,env,confirmation,vercelEnv}){
  if(vercelEnv==='production'||env!=='staging'||confirmation!=='IMPORT_TASK2_REWRITE_V2_TO_STAGING')fail('STAGING_APPROVAL_REQUIRED');
  if(!/^[a-z0-9]{8,32}$/.test(ref||'')||!/^[a-z0-9]{8,32}$/.test(productionRef||'')||ref===productionRef)fail('PROJECT_REF_PROOF_REQUIRED');
  let parsed;try{parsed=new URL(url)}catch{fail('STAGING_URL_INVALID')}
  if(parsed.protocol!=='https:'||parsed.host!==ref+'.supabase.co'||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)fail('STAGING_URL_REF_MISMATCH');
}
export function assertRls(s){if(!s||s.tables_with_rls_force!==3||s.policies_count!==0||s.anon_schema_usage!==false||s.authenticated_schema_usage!==false||s.anon_table_select!==false||s.authenticated_table_select!==false)fail('RLS_NOT_PROVEN')}
export async function importStaging({rpc,rows,bundleSha256,apply=false,batchSize=25,runId=randomUUID()}){
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>50||!Array.isArray(rows)||!rows.length)fail('BATCH_INVALID');
  const call=async(name,args)=>{const x=await rpc(name,args);if(x?.error)fail('RPC_'+name+':'+x.error.message);return x?.data};
  assertRls(await call('task2_rewrite_v2_security_status',{}));
  const batches=[];for(let i=0;i<rows.length;i+=batchSize)batches.push(rows.slice(i,i+batchSize));
  const preview={inserted:0,unchanged:0,collisions:0};
  for(const batch of batches){const d=await call('task2_rewrite_v2_preflight',{p_bundle_sha256:bundleSha256,p_records:batch});
    if(!Number.isInteger(d?.inserted)||!Number.isInteger(d?.unchanged)||!Array.isArray(d?.collisions)||d.inserted+d.unchanged+d.collisions.length!==batch.length)fail('BAD_PREFLIGHT_RESPONSE');
    preview.inserted+=d.inserted;preview.unchanged+=d.unchanged;preview.collisions+=d.collisions.length;
  }
  if(preview.collisions)fail('IMMUTABLE_COLLISIONS:'+preview.collisions);
  if(!apply)return {status:'REMOTE_READ_ONLY_PREFLIGHT',preview,applied:null};
  const applied={inserted:0,unchanged:0,batches:0};
  try{for(const batch of batches){const d=await call('task2_rewrite_v2_import_batch',{p_bundle_sha256:bundleSha256,p_import_run_id:runId,p_records:batch});
      if(!Number.isInteger(d?.inserted)||!Number.isInteger(d?.unchanged)||d.inserted+d.unchanged!==batch.length)fail('BAD_APPLY_RESPONSE');
      applied.inserted+=d.inserted;applied.unchanged+=d.unchanged;applied.batches++;
  }}catch(e){fail('PARTIAL_OR_UNKNOWN:'+applied.batches+':'+e.message)}
  return {status:'APPLIED_STAGING_NOT_UAT',preview,applied,runId};
}
