import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import bank from '@/data/grammar-transformation-private/m24-bank.json';
import approvals from '@/data/grammar-transformation-private/m24-approvals.json';
import {m24Eligible,M24_POLICY} from './m24-transformation';
import type {M24Item,M24Approval,M24Evidence} from './m24-transformation';
export const m24DraftItems=bank.items as M24Item[]; // Server only. NEVER ship JSON to frontend.
/** Cross-language canonical JSON: Python sort_keys=True, separators=(',', ':'), ensure_ascii=False. */
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)
   .map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function m24Fingerprint(item:M24Item):string{
 return createHash('sha256').update(canonical(item),'utf8').digest('hex');
}
export function m24LiveItem(id:string):M24Item|null{
 // Fail closed until an audited production release explicitly revises the pilot-only policy.
 if(grammarDraftPreview)return m24DraftItems.find(q=>q.id===id)??null;
 if(M24_POLICY.pilotOnly || process.env.GRAMMAR_M24_ENABLE_TRANSFORM!=='true')return null;
 const item=m24DraftItems.find(q=>q.id===id);if(!item)return null;
 const approval=(approvals.approvals as M24Approval[]).find(a=>a.id===id);
 return m24Eligible(item,approval,approvals.releaseEvidence as M24Evidence|null,m24Fingerprint(item))?item:null;
}
