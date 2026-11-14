import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import data from '@/data/grammar-context-private/m25c-bank.json';
import approvals from '@/data/grammar-context-private/m25c-approvals.json';
import {m25cEligible,M25C_POLICY} from './m25c-context';
import type {M25CCase,M25CApproval,M25CEvidence} from './m25c-context';
const cases=data.cases as unknown as M25CCase[];
function canon(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([k,x])=>JSON.stringify(k)+':'+canon(x)).join(',')+'}';
 return JSON.stringify(v);
}
export function m25cFingerprint(c:M25CCase){
 return createHash('sha256').update(canon(c),'utf8').digest('hex');
}
/** Always null until the editorial release process deliberately updates the policy. */
export function m25cLiveCase(id:string):M25CCase|null{
 if(grammarDraftPreview)return cases.find(x=>x.id===id)??null;
 if(M25C_POLICY.draftOnly||process.env.GRAMMAR_M25C_ENABLE_CONTEXT!=='true')return null;
 const c=cases.find(x=>x.id===id);if(!c)return null;
 const a=(approvals.approvals as M25CApproval[]).find(x=>x.id===id);
 return m25cEligible(c,a,approvals.releaseEvidence as M25CEvidence|null,m25cFingerprint(c))?c:null;
}
