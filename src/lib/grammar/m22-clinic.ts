/** M22 Weakness Clinic: pure fail-closed state machine. No course unlocks or CEFR claims. */
import type {M21Result} from './m21-diagnostic';

export const M22_POLICY={version:'M22.1',pilotOnly:true,maxVisibleClinicsPerResult:5,
  minDistinctChecksForProvisionalRepair:3,minCorrectChecksForProvisionalRepair:3} as const;
export type M22PracticeCheck={id:string;source_checkpoint_id:string|null;source_kind:'M19_EXISTING_FORMATIVE_REUSE'|'M22_ORIGINAL_TRANSFER';
  prompt_vi:string;options_en:string[];correct_index:number;option_feedback_vi:string[];
  target:'GUIDED_REPAIR'|'UNSEEN_TRANSFER_RECHECK'};
export type M22Clinic={id:string;lesson_id:string;level:string;concept_id:string;source_diagnostic_ids:string[];
  micro_skill_target:string;title:string;status:string;teacher_approved:boolean;misconception_vi:string;context_vi:string;
  decision_rule_vi:string;guided_steps:Array<{kind:string;instruction_vi:string;content_vi?:string;
    problematic_en?:string;recommended_en?:string;explanation_vi?:string}>;
  practice:M22PracticeCheck[];independent_task:{prompt_vi:string;rubric_vi:string[];
    auto_gradable:false;teacher_or_self_review_only:true};
  assessment_policy:{formative_only:true;mastery_impact:false;cefr_certification:false;repair_status:'PROVISIONAL_ONLY';release_requires_teacher_signature:true}};
export type M22Approval={id:string;fingerprint:string;reviewerId:string;reviewedAt:string;concept_id:string};
export type M22ReleaseEvidence={source_revision_verified:boolean;security_signed_off:boolean;pedagogy_signed_off:boolean;signatureId:string};
export type M22Event={eventId:string;clinicId:string;checkId:string;correct:boolean;sourceKind:string;reviewedAt:string};
export type M22RepairStatus='PRACTICE_IN_PROGRESS'|'REPAIR_AGAIN'|'IMPROVING_PROVISIONAL';

/** Keep source/status/fingerprinted material byte-stable during approval. */
export function signedClinicFields(clinic:M22Clinic):string{return JSON.stringify(clinic);}
export function isClinicLiveEligible(clinic:M22Clinic,approval:M22Approval|undefined,
    approvedConceptIds:ReadonlySet<string>,evidence:M22ReleaseEvidence|null,fingerprint:string):boolean{
  return Boolean(clinic.status==='PUBLISHED' && clinic.teacher_approved &&
    approval?.id===clinic.id && approval.concept_id===clinic.concept_id &&
    approval.fingerprint===fingerprint && /^[a-f0-9]{64}$/.test(fingerprint) &&
    approval.reviewerId?.trim() && Number.isFinite(Date.parse(approval.reviewedAt)) &&
    approvedConceptIds.has(clinic.concept_id) && evidence?.source_revision_verified &&
    evidence?.security_signed_off && evidence?.pedagogy_signed_off && evidence.signatureId?.trim());
}
export function publicClinic(clinic:M22Clinic){return {
  id:clinic.id,lessonId:clinic.lesson_id,level:clinic.level,conceptId:clinic.concept_id,
  title:clinic.title,misconceptionVi:clinic.misconception_vi,
  contextVi:clinic.context_vi,decisionRuleVi:clinic.decision_rule_vi,
  guidedSteps:clinic.guided_steps,independentTask:clinic.independent_task,
  practice:clinic.practice.map(q=>({id:q.id,promptVi:q.prompt_vi,optionsEn:q.options_en,
    target:q.target})),formativeOnly:true,masteryImpact:false,cefrCertified:false,
};}
export function checkClinicAnswer(clinic:M22Clinic,checkId:string,selection:number){
  if(!Number.isInteger(selection)||selection<0||selection>2)return null;
  const q=clinic.practice.find(x=>x.id===checkId);
  if(!q)return null;
  return {checkId,correct:selection===q.correct_index,feedbackVi:q.option_feedback_vi[selection],
    correctIndex:q.correct_index,sourceKind:q.source_kind,formativeOnly:true,masteryImpact:false,cefrCertified:false};
}
export function validateM22ClinicBank(clinics:readonly M22Clinic[],availableConcepts:ReadonlySet<string>,
    diagnosticItems:Readonly<{id:string;concept_id:string}>[]):string[]{
  const issues:string[]=[];const ids=new Set<string>();const checks=new Set<string>();
  const diagByConcept=new Map<string,Set<string>>();
  for(const q of diagnosticItems){const set=diagByConcept.get(q.concept_id)||new Set<string>();set.add(q.id);diagByConcept.set(q.concept_id,set);}
  for(const c of clinics){
    if(ids.has(c.id))issues.push(`DUPLICATE_CLINIC:${c.id}`);ids.add(c.id);
    if(c.id!==`M22-CL-${c.lesson_id}` || c.concept_id!==`GC-${c.lesson_id}` || !availableConcepts.has(c.concept_id))issues.push(`BAD_CONCEPT:${c.id}`);
    if(!diagByConcept.has(c.concept_id) || c.source_diagnostic_ids.length!==2 ||
      c.source_diagnostic_ids.some(id=>!diagByConcept.get(c.concept_id)?.has(id)))issues.push(`BAD_DIAG_LINK:${c.id}`);
    if(c.guided_steps.length<7 || c.practice.length<3 || c.practice.some(x=>x.target==='UNSEEN_TRANSFER_RECHECK')===false)issues.push(`TOO_SHALLOW:${c.id}`);
    if(c.independent_task.auto_gradable || !c.independent_task.teacher_or_self_review_only)issues.push(`UNSAFE_TRANSFER_GRADING:${c.id}`);
    if(c.assessment_policy.mastery_impact || c.assessment_policy.cefr_certification)issues.push(`UNSAFE_MASTERY:${c.id}`);
    if(c.status==='PUBLISHED' && !c.teacher_approved)issues.push(`PUBLISHED_WITHOUT_REVIEW:${c.id}`);
    for(const q of c.practice){
      if(checks.has(q.id))issues.push(`DUPLICATE_CHECK:${q.id}`);checks.add(q.id);
      if(q.options_en.length!==3 || new Set(q.options_en.map(x=>x.trim().toLowerCase())).size!==3 ||
        q.option_feedback_vi.length!==3 || q.option_feedback_vi.some(x=>x.length<18) ||
        !Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>2)issues.push(`BAD_CHECK:${q.id}`);
      if(diagByConcept.get(c.concept_id)?.has(q.id))issues.push(`ASSESSMENT_LEAK:${q.id}`);
    }
  }
  return issues;
}
/** Provisional recommendations, only where M21 actually observed a difficult concept. */
export function recommendWeaknessClinics(result:M21Result,clinics:readonly M22Clinic[],openLevels:ReadonlySet<string>){
  const map=new Map(clinics.map(x=>[x.concept_id,x]));
  return result.conceptResults.filter(x=>x.status==='REVIEW_PRIORITY'||x.status==='MIXED')
    .sort((a,b)=>a.correct/a.total-b.correct/b.total || a.conceptId.localeCompare(b.conceptId))
    .slice(0,M22_POLICY.maxVisibleClinicsPerResult)
    .map(x=>{const clinic=map.get(x.conceptId);const level=clinic?.level||result.level;
      return {conceptId:x.conceptId,lessonId:clinic?.lesson_id??null,clinicId:clinic?.id??null,
        evidence:x.status,available:!!clinic && (level==='A1'||openLevels.has(level)),
        reasonVi:'Tín hiệu điểm yếu từ bài chẩn đoán ngắn, cần thử thêm; không phải kết luận về trình độ.'};
    });
}
/** No matter how good, a clinic never outputs MASTERED, CEFR or unlock. */
export function evaluateClinicEvidence(clinic:M22Clinic,events:readonly M22Event[]):{status:M22RepairStatus;reliableForMastery:false;nextStepVi:string;distinctChecks:number;correctChecks:number}{
  // For each check, last submitted event wins; clock ties are explicitly deterministic using eventId.
  const last=new Map<string,M22Event>();const valid=new Set(clinic.practice.map(x=>x.id));
  for(const event of [...events].sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)||a.eventId.localeCompare(b.eventId))){
    if(event.clinicId===clinic.id && valid.has(event.checkId))last.set(event.checkId,event);
  }
  const scores=[...last.values()],correct=scores.filter(x=>x.correct).length;
  const transfer=clinic.practice.find(x=>x.target==='UNSEEN_TRANSFER_RECHECK');
  const evidenceEnough=scores.length>=M22_POLICY.minDistinctChecksForProvisionalRepair &&
    correct>=M22_POLICY.minCorrectChecksForProvisionalRepair &&
    !!transfer && !!last.get(transfer.id)?.correct;
  const status:M22RepairStatus=evidenceEnough?'IMPROVING_PROVISIONAL':
    scores.length>=M22_POLICY.minDistinctChecksForProvisionalRepair?'REPAIR_AGAIN':'PRACTICE_IN_PROGRESS';
  return {status,reliableForMastery:false,distinctChecks:scores.length,correctChecks:correct,
    nextStepVi:evidenceEnough?'Thử lại bằng tình huống chưa gặp sau 1–3 ngày; chưa kết luận đã thành thạo.':
      'Xem lại lời giải đúng lỗi mình chọn, rồi luyện câu khác trước khi thử lại.'};
}
