import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import bank from '@/data/grammar-transfer-private/m26-task-bank.json';
import approvals from '@/data/grammar-transfer-private/m26-approvals.json';
import type {Task,Approval,ReleaseEvidence} from './m26-transfer';
import {eligibleForPublication} from './m26-transfer';
const all=bank.tasks as Task[];
function canon(v:unknown):string{
 if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)
   .map(([k,x])=>JSON.stringify(k)+':'+canon(x)).join(',')+'}';
 return JSON.stringify(v);
}
export function fingerprint(t:Task){return createHash('sha256').update(canon(t),'utf8').digest('hex');}
export function teacherDraft(id:string):Task|null{return all.find(t=>t.id===id)??null;}
export function liveTask(id:string):Task|null{
 if(grammarDraftPreview)return teacherDraft(id);
 if(process.env.GRAMMAR_M26_ENABLE_TRANSFER!=='true'||approvals.enabled!==true)return null;
 const t=teacherDraft(id);if(!t)return null;
 const a=(approvals.approvals as Approval[]).find(x=>x.id===id);
 return eligibleForPublication(t,a,approvals.releaseEvidence as ReleaseEvidence|null,fingerprint(t))?t:null;
}
