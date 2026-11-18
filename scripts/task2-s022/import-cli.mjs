#!/usr/bin/env node
// CLI only, never an HTTP route. Dataset must reside OUTSIDE the public checkout.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertExternalBundle,validateBundle,assertStage,importStaging } from './import-adapter.mjs';
const get=key=>{const i=process.argv.indexOf(key);return i===-1?null:process.argv[i+1]};
const flag=key=>process.argv.includes(key);
const error=msg=>{throw Error('TASK2_BLOCKED:'+msg)};
async function main(){
  const bundle=assertExternalBundle(get('--bundle'),process.cwd());
  const {rows,counts,sourceCount,bundleSha256}=validateBundle(bundle);
  const mode=flag('--apply-staging')?'apply':flag('--check-staging')?'preflight':'local';
  if(flag('--apply-staging')&&flag('--check-staging'))error('MODE_CONFLICT');
  const result={phase:'S02.2',mode,record_counts:counts,total:rows.length,sourceCount,bundleSha256,production:'HOLD'};
  if(mode==='local'){
    Object.assign(result,{status:'LOCAL_VALIDATED_NO_REMOTE_ACCESS',expected_first_insertions:rows.length,expected_second_unchanged:rows.length});
  }else{
    assertStage({url:process.env.SUPABASE_STAGING_URL,ref:process.env.TASK2_STAGING_PROJECT_REF,productionRef:process.env.TASK2_PRODUCTION_PROJECT_REF,env:process.env.TASK2_STAGE_ENV,confirmation:get('--confirm'),vercelEnv:process.env.VERCEL_ENV});
    if(!process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY)error('MISSING_STAGING_KEY');
    if(mode==='apply'&&(!/^staging-backup-[\w.-]{8,100}$/.test(get('--backup-ref')||'')||!get('--evidence')))error('BACKUP_AND_EVIDENCE_REQUIRED');
    const {createClient}=await import('@supabase/supabase-js');
    const client=createClient(process.env.SUPABASE_STAGING_URL,process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    Object.assign(result,await importStaging({rpc:(name,args)=>client.rpc(name,args),rows,bundleSha256,apply:mode==='apply'}));
  }
  if(get('--evidence')){
    const target=resolve(get('--evidence'));
    if(target.startsWith(resolve(process.cwd())+'/'))error('EVIDENCE_INSIDE_PUBLIC_REPO');
    writeFileSync(target,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  }
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
