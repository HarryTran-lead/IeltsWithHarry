import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import draft from '@/data/grammar-context-private/m25-bank.json';
import approvals from '@/data/grammar-context-private/m25-approvals.json';
import {m25Eligible,M25_POLICY} from './m25-context';
import type {M25Case,M25Approval,M25Evidence} from './m25-context';
const cases=draft.cases as M25Case[];
function canon(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([k,x])=>JSON.stringify(k)+':'+canon(x)).join(',')+'}';
 return JSON.stringify(v);
}
export function m25Fingerprint(c:M25Case):string{
 return createHash('sha256').update(canon(c),'utf8').digest('hex');
}
export function m25LiveCase(id:string):M25Case|null{
 // Explicitly fail closed until policy revision plus external evidence and approvals.
 if(grammarDraftPreview)return cases.find(x=>x.id===id)??null;
 if(M25_POLICY.pilotOnly||process.env.GRAMMAR_M25_ENABLE_CONTEXT!=='true')return null;
 const c=cases.find(x=>x.id===id);if(!c)return null;
 const approval=(approvals.approvals as M25Approval[]).find(a=>a.id===id);
 return m25Eligible(c,approval,approvals.releaseEvidence as M25Evidence|null,m25Fingerprint(c))?c:null;
}
