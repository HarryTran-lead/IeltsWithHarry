import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import bank from '@/data/grammar-contrast-private/m23-contrast-bank.json';
import approvals from '@/data/grammar-contrast-private/m23-approvals.json';
import {m23LiveEligible,signedM23Content,M23_POLICY} from './m23-contrast';
import type {M23Unit,M23Approval,M23ReleaseEvidence} from './m23-contrast';
export const m23DraftUnits=bank.units as M23Unit[]; // server-only; NEVER import in client module.
export function m23Fingerprint(unit:M23Unit){return createHash('sha256').update(signedM23Content(unit)).digest('hex');}
export function m23LiveUnit(id:string):M23Unit|null{
  if(grammarDraftPreview)return m23DraftUnits.find(x=>x.id===id)??null;
  if(M23_POLICY.pilotOnly || process.env.GRAMMAR_M23_ENABLE_CONTRAST!=='true')return null;
  const unit=m23DraftUnits.find(x=>x.id===id);if(!unit)return null;
  const a=(approvals.approved as M23Approval[]).find(x=>x.id===id);
  // Explicit false-by-default release gate: technical + educational signoff needed.
  return m23LiveEligible(unit,a,new Set(approvals.approvedContrastIds as string[]),
     approvals.releaseEvidence as M23ReleaseEvidence|null,m23Fingerprint(unit))?unit:null;
}
