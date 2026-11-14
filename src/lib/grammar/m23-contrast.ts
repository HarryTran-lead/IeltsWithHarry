/** M23 Contrast Lab: pure, fail-closed formative logic. Not a CEFR certification. */
export type M23Check={id:string;prompt_vi:string;options_en:[string,string]|string[];
  correct_index:number;option_rationales_vi:string[];target_meaning:'A'|'B';source_scene:number;
  purpose:'APPLY_IN_CONTEXT'};
export type M23Step={kind:string;instruction_vi:string;content_vi?:string;examples_en?:string[];
  a_meaning_vi?:string;b_meaning_vi?:string;context_vi?:string;a_en?:string;b_en?:string;
  explanation_vi?:string;check_id?:string;self_review_vi?:string[];
  auto_gradable?:boolean;assessment?:string};
export type M23Unit={id:string;version:string;contrast_id:string;cefr:string;
  source_lesson_ids:string[];source_concept_ids:string[];title:string;topic_vi:string;
  status:string;teacher_approved:boolean;
  release_policy:{formative_only:true;counts_for_mastery:false;can_unlock_level:false;
    no_cefr_certification:true;teacher_signoff_required:true};steps:M23Step[];practice:M23Check[];
  diagnostic_link_status:string};
export type M23Approval={id:string;fingerprint:string;contrastId:string;reviewerId:string;reviewedAt:string};
export type M23ReleaseEvidence={sourceRevisionVerified:boolean;teacherReviewVerified:boolean;
  rlsVerified:boolean;serverTestsVerified:boolean;signatureId:string};
export const M23_POLICY={version:'M23.1',pilotOnly:true,formativeOnly:true,noMastery:true} as const;
const ID=/^M23-CL-C(?:0[1-9]|[1-4][0-9]|50)-0[1-3]$/;
export function signedM23Content(unit:M23Unit){return JSON.stringify(unit);}
export function m23LiveEligible(unit:M23Unit, approval:M23Approval|undefined,
  approvedContrastIds:ReadonlySet<string>,evidence:M23ReleaseEvidence|null,
  fingerprint:string):boolean{
  return Boolean(unit.status==='PUBLISHED' && unit.teacher_approved &&
    approval?.id===unit.id && approval.contrastId===unit.contrast_id &&
    approval.fingerprint===fingerprint && /^[a-f0-9]{64}$/.test(fingerprint) &&
    approval.reviewerId?.trim() && approval.reviewedAt && Number.isFinite(Date.parse(approval.reviewedAt)) &&
    approvedContrastIds.has(unit.contrast_id) && evidence?.sourceRevisionVerified &&
    evidence?.teacherReviewVerified && evidence?.rlsVerified && evidence?.serverTestsVerified &&
    evidence?.signatureId?.trim());
}
/** Never place keys or rationale indexes in the student's GET data. */
export function m23PublicUnit(unit:M23Unit){return {
  id:unit.id,contrastId:unit.contrast_id,cefr:unit.cefr,lessonIds:unit.source_lesson_ids,
  title:unit.title,topicVi:unit.topic_vi,steps:unit.steps,
  practice:unit.practice.map(x=>({id:x.id,promptVi:x.prompt_vi,optionsEn:x.options_en})),
  formativeOnly:true,masteryImpact:false,canUnlock:false,cefrCertified:false,
};}
/** The other option may also be grammatical: this is a best-fit contextual choice, NOT an absolute error. */
export function m23CheckChoice(unit:M23Unit,checkId:string,selection:number){
  if(!Number.isInteger(selection)||selection<0||selection>1)return null;
  const q=unit.practice.find(x=>x.id===checkId);if(!q)return null;
  return {checkId:q.id,matchTarget:selection===q.correct_index,
    feedbackVi:q.option_rationales_vi[selection],
    gradingInterpretation:'BEST_FIT_FOR_STATED_INTENTION_NOT_ABSOLUTE_GRAMMATICALITY' as const,
    formativeOnly:true,masteryImpact:false,cefrCertified:false};
}
export function validateM23Bank(units:readonly M23Unit[],existingLessonIds:ReadonlySet<string>){
  const issues:string[]=[];const ids=new Set<string>(),checkIds=new Set<string>();
  for(const u of units){
    if(ids.has(u.id)||!ID.test(u.id)||u.contrast_id!==u.id.split('-')[2])issues.push(`BAD_UNIT_ID:${u.id}`);
    ids.add(u.id);
    if(u.source_lesson_ids.length===0 || u.source_lesson_ids.some(x=>!existingLessonIds.has(x)) ||
       u.source_concept_ids.some((x,i)=>x!==`GC-${u.source_lesson_ids[i]}`))issues.push(`BAD_LESSON_LINK:${u.id}`);
    if(u.steps.length!==9 || u.practice.length!==2 || u.steps[5].check_id!==u.practice[0]?.id ||
       u.steps[6].check_id!==u.practice[1]?.id)issues.push(`BAD_STEPS:${u.id}`);
    if(u.steps[7].auto_gradable!==false || !u.release_policy.formative_only ||
       u.release_policy.counts_for_mastery!==false || u.release_policy.can_unlock_level!==false ||
       u.release_policy.no_cefr_certification!==true)issues.push(`UNSAFE_POLICY:${u.id}`);
    if(u.teacher_approved || u.status==='PUBLISHED')issues.push(`UNEXPECTED_PUBLISHED:${u.id}`);
    for(const q of u.practice){
      if(checkIds.has(q.id))issues.push(`DUPLICATE_CHECK:${q.id}`);checkIds.add(q.id);
      if(q.options_en.length!==2 || ![0,1].includes(q.correct_index)||
         new Set(q.options_en.map(s=>s.trim().toLowerCase())).size!==2 ||
         q.option_rationales_vi.length!==2 || q.option_rationales_vi.some(s=>s.length<50) ||
         q.prompt_vi.length<60)issues.push(`BAD_CHECK:${q.id}`);
    }
  }
  return issues;
}
