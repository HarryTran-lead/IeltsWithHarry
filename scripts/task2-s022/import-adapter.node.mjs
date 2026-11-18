import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {FEEDS,canonical,assertExternalBundle,validateBundle,assertStage,assertRls,importStaging} from './import-adapter.mjs';
const h=x=>createHash('sha256').update(x).digest('hex');
const baseline={tables_with_rls_force:3,policies_count:0,anon_schema_usage:false,authenticated_schema_usage:false,anon_table_select:false,authenticated_table_select:false};
const tmp=mkdtempSync(join(tmpdir(),'task2-s022-'));
const out=join(tmp,'private');mkdirSync(out);mkdirSync(join(out,'feeds'));
const source='R01/learner_guided/mini.json';
const payload={text:'Original Việt and English text'};
const sourceBytes=Buffer.from(JSON.stringify({items:[payload]}));
mkdirSync(join(out,'canonical_flat_data','R01','learner_guided'),{recursive:true});
writeFileSync(join(out,'canonical_flat_data',source),sourceBytes);
const sourceRow={source_path:source,file_sha256:h(sourceBytes),logical_dataset_key:'task2_rewrite_v2:R01:mini'};
writeFileSync(join(out,'feeds','DATASET_INDEX.json'),JSON.stringify([sourceRow]));
const record={record_key:sourceRow.logical_dataset_key+':one',namespace:'task2_rewrite_v2',milestone:'R01',logical_dataset_key:sourceRow.logical_dataset_key,visibility:'learner_guided',source_path:source,source_sha256:h(sourceBytes),row_id:'one',payload_sha256:h(Buffer.from(canonical(payload))),payload};
for(const name of Object.keys(FEEDS))writeFileSync(join(out,'feeds',name+'_records.jsonl'),name==='learner_guided'?JSON.stringify(record)+'\n':'');
const expected={learner_guided:1,server_only:0,shared:0,docs:0};
const read=()=>validateBundle(out,expected,1);
const mutate=(name,val)=>writeFileSync(join(out,'feeds',name),val);
test.after(()=>rmSync(tmp,{recursive:true,force:true}));
for(const [title,fn] of [
 ['valid private synthetic bundle',()=>{const r=read();assert.equal(r.rows.length,1);assert.equal(r.sourceCount,1)}],
 ['reject absolute checkout directory',()=>assert.throws(()=>assertExternalBundle(out,tmp),/INSIDE_PUBLIC_REPOSITORY/)],
 ['require absolute path',()=>assert.throws(()=>assertExternalBundle('relative',tmp),/ABSOLUTE/)],
 ['reject missing source file',()=>assert.throws(()=>validateBundle(join(tmp,'none'),expected,1))],
 ['reject wrong expected feed count',()=>assert.throws(()=>validateBundle(out,{...expected,learner_guided:2},1),/FEED_COUNT/)],
 ['reject wrong source count',()=>assert.throws(()=>validateBundle(out,expected,82),/SOURCE_INDEX_COUNT/)],
 ['canonical keys sorted',()=>assert.equal(canonical({z:2,a:1}),'{"a":1,"z":2}')],
 ['stage authorization works with distinct staging project',()=>assert.doesNotThrow(()=>assertStage({url:'https://stagingref123.supabase.co/',ref:'stagingref123',productionRef:'productionref123',env:'staging',confirmation:'IMPORT_TASK2_REWRITE_V2_TO_STAGING'}))],
 ['reject staging = production',()=>assert.throws(()=>assertStage({url:'https://stagingref123.supabase.co/',ref:'stagingref123',productionRef:'stagingref123',env:'staging',confirmation:'IMPORT_TASK2_REWRITE_V2_TO_STAGING'}),/PROJECT_REF/)],
 ['reject prod runtime',()=>assert.throws(()=>assertStage({url:'https://stagingref123.supabase.co/',ref:'stagingref123',productionRef:'productionref123',env:'staging',confirmation:'IMPORT_TASK2_REWRITE_V2_TO_STAGING',vercelEnv:'production'}),/STAGING_APPROVAL/)],
 ['reject production URL',()=>assert.throws(()=>assertStage({url:'https://productionref123.supabase.co/',ref:'stagingref123',productionRef:'productionref123',env:'staging',confirmation:'IMPORT_TASK2_REWRITE_V2_TO_STAGING'}),/STAGING_URL/)],
 ['accept strict RLS proof',()=>assert.doesNotThrow(()=>assertRls(baseline))],
 ['reject missing FORCE RLS',()=>assert.throws(()=>assertRls({...baseline,tables_with_rls_force:2}),/RLS_NOT_PROVEN/)],
 ['reject authenticated read',()=>assert.throws(()=>assertRls({...baseline,authenticated_table_select:true}),/RLS_NOT_PROVEN/)],
 ['reject policies installed',()=>assert.throws(()=>assertRls({...baseline,policies_count:1}),/RLS_NOT_PROVEN/)],
])test(title,fn);
for(const [name,modify] of [
 ['reject tampered payload',r=>{r.payload.text='tampered'}],
 ['reject changed hash',r=>{r.payload_sha256='a'.repeat(64)}],
 ['reject duplicate record',r=>{}],
 ['reject wrong namespace',r=>{r.namespace='wrong'}],
 ['reject visibility mismatch',r=>{r.visibility='server_only'}],
 ['reject row key mismatch',r=>{r.row_id='altered'}],
 ['reject bad source sha',r=>{r.source_sha256='b'.repeat(64)}],
])test(name,()=>{const r=structuredClone(record);modify(r);mutate('learner_guided_records.jsonl',JSON.stringify(r)+'\n'+(name==='reject duplicate record'?JSON.stringify(r)+'\n':''));assert.throws(()=>read());mutate('learner_guided_records.jsonl',JSON.stringify(record)+'\n')});
function rpcMock({collision=false,unsafe=false,applyFailure=false}={}){const calls=[],state=new Map();return {calls,rpc:async(name,args)=>{calls.push(name);if(name==='task2_rewrite_v2_security_status')return {data:unsafe?{...baseline,anon_table_select:true}:baseline};if(name==='task2_rewrite_v2_preflight'){let inserted=0,unchanged=0,collisions=[];for(const r of args.p_records){if(collision)collisions.push(r.record_key);else if(state.get(r.record_key)===r.payload_sha256)unchanged++;else inserted++;}return {data:{inserted,unchanged,collisions}};}if(name==='task2_rewrite_v2_import_batch'){if(applyFailure)return {error:{message:'staging failure'}};let inserted=0,unchanged=0;for(const r of args.p_records){if(state.has(r.record_key))unchanged++;else{inserted++;state.set(r.record_key,r.payload_sha256)}}return {data:{inserted,unchanged}};}throw Error('unexpected RPC')},state}}
test('read-only preflight NEVER writes',async()=>{const m=rpcMock();const out=await importStaging({rpc:m.rpc,rows:[record],bundleSha256:'a'.repeat(64)});assert.equal(out.preview.inserted,1);assert(!m.calls.includes('task2_rewrite_v2_import_batch'))});
test('apply then replay idempotent using mock RPC',async()=>{const m=rpcMock();const p={rpc:m.rpc,rows:[record],bundleSha256:'a'.repeat(64),apply:true};assert.equal((await importStaging(p)).applied.inserted,1);assert.equal((await importStaging(p)).applied.unchanged,1)});
test('collision blocks apply',async()=>{const m=rpcMock({collision:true});await assert.rejects(importStaging({rpc:m.rpc,rows:[record],bundleSha256:'a'.repeat(64),apply:true}),/COLLISIONS/);assert(!m.calls.includes('task2_rewrite_v2_import_batch'))});
test('unsafe RLS blocks all writes',async()=>{const m=rpcMock({unsafe:true});await assert.rejects(importStaging({rpc:m.rpc,rows:[record],bundleSha256:'a'.repeat(64),apply:true}),/RLS_NOT_PROVEN/);assert.deepEqual(m.calls,['task2_rewrite_v2_security_status'])});
test('partial failure marked unknown',async()=>{const m=rpcMock({applyFailure:true});await assert.rejects(importStaging({rpc:m.rpc,rows:[record],bundleSha256:'a'.repeat(64),apply:true}),/PARTIAL_OR_UNKNOWN/)});
test('batch-size limit 1-50',async()=>{const m=rpcMock();await assert.rejects(importStaging({rpc:m.rpc,rows:[record],bundleSha256:'a',batchSize:51}),/BATCH_INVALID/)});
test('CLI refuses bundle inside checkout',()=>{const r=spawnSync(process.execPath,[resolve(import.meta.dirname,'import-cli.mjs'),'--bundle',out],{cwd:tmp,encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/PRIVATE_BUNDLE_INSIDE_PUBLIC_REPOSITORY/)});
