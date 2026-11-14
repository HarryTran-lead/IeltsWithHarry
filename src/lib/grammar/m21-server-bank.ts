import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import type {M21Item,M21Approval,M21Level} from './m21-diagnostic';
import {computeLiveCoverage,isEligibleLive,signedContentFields,M21_POLICY} from './m21-diagnostic';
import bank from '@/data/grammar-assessment-private/m21-bank.json';
import approvals from '@/data/grammar-assessment-private/m21-approvals.json';
import concepts from '@/data/grammar-knowledge/m20/concepts.json';

export const assessmentBank=bank.questions as M21Item[];
export function fingerprint(item:M21Item):string{return createHash('sha256').update(signedContentFields(item),'utf8').digest('hex');}
export function liveDiagnosticBank(level:M21Level){
  // Hard default off. Publishing needs independent teacher review and staging tests.
  if(grammarDraftPreview)return {ready:true,items:assessmentBank.filter(item=>item.level===level),reason:'DRAFT_PREVIEW'};
  if(M21_POLICY.pilotOnly || process.env.GRAMMAR_M21_ENABLE_DIAGNOSTIC!=='true')return {ready:false,items:[],reason:'ASSESSMENT_NOT_RELEASED'};
  const records=new Map((approvals.approved as M21Approval[]).map(x=>[x.id,x]));
  const reviewEvidence=approvals.releaseEvidence ?? null;
  const approvedConceptIds=new Set(approvals.approvedConceptIds as string[]);
  const items=assessmentBank.filter(item=>item.level===level &&
    isEligibleLive(item,records,approvedConceptIds,reviewEvidence,fingerprint(item)));
  const allConceptIds=concepts.filter(c=>c.cefr===level).map(c=>c.id);
  const coverage=computeLiveCoverage(level,allConceptIds,items);
  return {ready:coverage.ready,items,coverage,reason:coverage.ready?'READY':'INSUFFICIENT_APPROVED_COVERAGE'};
}
