import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import data from '@/data/grammar-context-private/m25d-bank.json';
import approvals from '@/data/grammar-context-private/m25d-approvals.json';
import type {Case,Approval,Evidence} from './m25d-context';
import {eligible,M25D_POLICY} from './m25d-context';
const cases=data.cases as unknown as Case[];
function canon(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([k,x])=>JSON.stringify(k)+':'+canon(x)).join(',')+'}';
 return JSON.stringify(v);
}
export function fingerprint(c:Case){return createHash('sha256').update(canon(c),'utf8').digest('hex');}
/** Fail closed: no draft visible until separate teacher approval and staging gate update. */
export function liveCase(id:string):Case|null{
 if(grammarDraftPreview)return cases.find(x=>x.id===id)??null;
 if(M25D_POLICY.draftOnly||process.env.GRAMMAR_M25D_ENABLE_CONTEXT!=='true')return null;
 const c=cases.find(x=>x.id===id);if(!c)return null;
 const a=(approvals.approvals as Approval[]).find(x=>x.id===id);
 return eligible(c,a,approvals.releaseEvidence as Evidence|null,fingerprint(c))?c:null;
}
