import 'server-only';
import {grammarDraftPreview} from './preview';
import {createHash} from 'node:crypto';
import clinicsSource from '@/data/grammar-clinic-private/m22-clinics.json';
import m22bClinicsSource from '@/data/grammar-clinic-private/m22b-clinics.json';
import approvalsSource from '@/data/grammar-clinic-private/m22-approvals.json';
import {M22_POLICY,isClinicLiveEligible,signedClinicFields} from './m22-clinic';
import type {M22Clinic,M22Approval,M22ReleaseEvidence} from './m22-clinic';
// M22B extends M22 by addition only. The 64 new clinics have NO M21 diagnostic evidence.
// Source bank remains private and all 100 clinics remain blocked by the existing release gate.
export const m22AllDraftClinics=[...clinicsSource.clinics,...m22bClinicsSource.clinics] as M22Clinic[]; // NEVER import in a client component
export function clinicFingerprint(c:M22Clinic){return createHash('sha256').update(signedClinicFields(c)).digest('hex');}
export function liveClinic(id:string){
  if(grammarDraftPreview)return m22AllDraftClinics.find(x=>x.id===id)??null;
  if(M22_POLICY.pilotOnly || process.env.GRAMMAR_M22_ENABLE_CLINIC!=='true')return null;
  const c=m22AllDraftClinics.find(x=>x.id===id);if(!c)return null;
  const a=(approvalsSource.approved as M22Approval[]).find(x=>x.id===id);
  return isClinicLiveEligible(c,a,new Set(approvalsSource.approvedConceptIds as string[]),
    approvalsSource.releaseEvidence as M22ReleaseEvidence|null,clinicFingerprint(c))?c:null;
}
