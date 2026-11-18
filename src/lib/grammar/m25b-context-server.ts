import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import data from '@/data/grammar-context-private/m25b-bank.json';
import approvals from '@/data/grammar-context-private/m25b-approvals.json';
import {m25bEligible,M25B_POLICY} from './m25b-context';
import type {M25BCase,M25BApproval,M25BEvidence} from './m25b-context';
const cases=data.cases as M25BCase[];
function canon(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
  .map(([k,x])=>JSON.stringify(k)+':'+canon(x)).join(',')+'}';
 return JSON.stringify(v);
}
export function m25bFingerprint(c:M25BCase){
 return createHash('sha256').update(canon(c),'utf8').digest('hex');
}
/** Always null until the editorial release process deliberately updates the policy. */
export function m25bLiveCase(id:string):M25BCase|null{
 if(grammarDraftPreview)return cases.find(x=>x.id===id)??null;
 if(M25B_POLICY.draftOnly||process.env.GRAMMAR_M25B_ENABLE_CONTEXT!=='true')return null;
 const c=cases.find(x=>x.id===id);if(!c)return null;
 const a=(approvals.approvals as M25BApproval[]).find(x=>x.id===id);
 return m25bEligible(c,a,approvals.releaseEvidence as M25BEvidence|null,m25bFingerprint(c))?c:null;
}
