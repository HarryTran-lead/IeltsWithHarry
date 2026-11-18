/** M25D draft-only Grammar Context & Multi-error Detective. No mastery's derived from formative attempts. */
export type Level='A1'|'A2'|'B1'|'B2'|'C1'|'C2';
export type Q={id:string;type:string;prompt_vi:string;options_en:[string,string,string];correct_index:number;
 rationales_vi:[string,string,string];formative_only:true;teacher_review_required:true};
export type ErrorSlot={type:string;wrong:string;correct:string;explanation_vi:string;requires_teacher_review:true};
export type OpenTask={id:string;type:string;prompt_vi:string;rubric_vi:string[];draft_en?:string;
 reference_en?:string;error_slots?:ErrorSlot[];reference_error_slots?:ErrorSlot[];auto_grade:false;grade_state:'NEEDS_REVIEW'};
export type Case={id:string;revision:'M25D.1';level:Level;lesson_id:string;lesson_title:string;
 source_checkpoint_id:string;genre:string;concept_id:string;passage_en:string;questions:[Q,Q,Q];
 editing:OpenTask;diagnosis:OpenTask;transfer:OpenTask;editorial_status:string;
 teacher_approved:boolean;publishable:boolean;counts_for_mastery:false;can_unlock_level:false;formative_only:true};
export type Approval={id:string;sha256:string;reviewerId:string;reviewedAt:string};
export type Evidence={curriculumReview:boolean;semanticReview:boolean;questionReview:boolean;
 rlsVerified:boolean;stagingE2EVerified:boolean;teacherSignoffId:string};
export const M25D_POLICY={draftOnly:true,noMastery:true,noLevelUnlock:true,noCEFRCertification:true} as const;
const ID=/^M25D-GIC-(A1|A2|B1|B2|C1|C2)-\d{3}$/;
const QID=/^M25D-GIC-(A1|A2|B1|B2|C1|C2)-\d{3}-Q[1-6]$/;
/** Public allowlist: passage and corrupted draft, but never reference corrections or keys. */
export function publicCase(c:Case){return {id:c.id,level:c.level,lessonId:c.lesson_id,
 lessonTitle:c.lesson_title,genre:c.genre,passageEn:c.passage_en,
 questions:c.questions.map(q=>({id:q.id,type:q.type,promptVi:q.prompt_vi,optionsEn:q.options_en})),
 editing:{id:c.editing.id,promptVi:c.editing.prompt_vi,draftEn:c.editing.draft_en},
 diagnosis:{id:c.diagnosis.id,promptVi:c.diagnosis.prompt_vi},
 transfer:{id:c.transfer.id,promptVi:c.transfer.prompt_vi},
 grading:'FORMATIVE_ONLY',countsForMastery:false,canUnlockLevel:false};}
export function gradeChoice(c:Case,id:unknown,answer:unknown){
 if(typeof id!=='string'||!QID.test(id)||!Number.isInteger(answer)||typeof answer!=='number'||answer<0||answer>2)return null;
 const q=c.questions.find(x=>x.id===id);if(!q)return null;
 return {caseId:c.id,questionId:q.id,status:answer===q.correct_index?'MATCHED_TARGET':'NOT_TARGET',
 selectedRationaleVi:q.rationales_vi[answer],referenceChoice:q.options_en[q.correct_index],
 correctRationaleVi:q.rationales_vi[q.correct_index],formativeOnly:true,masteryImpact:false,canUnlockLevel:false};
}
export function gradeOpen(c:Case,id:unknown,answer:unknown){
 const task=id===c.editing.id?c.editing:id===c.diagnosis.id?c.diagnosis:id===c.transfer.id?c.transfer:null;
 if(!task||typeof answer!=='string'||answer.trim().length<16||answer.length>5000)return null;
 const matched=typeof task.reference_en==='string'&&
  answer.trim().replace(/\s+/g,' ').toLowerCase()===task.reference_en.trim().replace(/\s+/g,' ').toLowerCase();
 return {caseId:c.id,questionId:task.id,status:'NEEDS_REVIEW' as const,matchedReferenceFormatting:Boolean(matched),
 feedbackVi:'Đã nhận câu viết. Cần đối chiếu từng thay đổi với đoạn nguồn; khác câu mẫu chưa chắc sai.',
 rubricVi:task.rubric_vi,referenceEn:task.reference_en??null,
 teacherErrorSlots:task.error_slots??task.reference_error_slots??[],
 formativeOnly:true,masteryImpact:false,canUnlockLevel:false};
}
export function eligible(c:Case,a:Approval|undefined,e:Evidence|null,sha:string){
 return Boolean(ID.test(c.id)&&c.teacher_approved&&c.publishable&&
 c.editorial_status==='PUBLISHED'&&a?.id===c.id&&a.sha256===sha&&
 /^[a-f0-9]{64}$/.test(sha)&&a.reviewerId?.trim()&&
 Number.isFinite(Date.parse(a.reviewedAt))&&e?.curriculumReview&&e.semanticReview&&
 e.questionReview&&e.rlsVerified&&e.stagingE2EVerified&&e.teacherSignoffId?.trim());
}
export function validate(all:readonly Case[]):string[]{
 const errors:string[]=[],ids=new Set<string>(),passages=new Set<string>(),qids=new Set<string>();
 const expected:{[k:string]:number}={A1:3,A2:3,B1:4,B2:4,C1:5,C2:5};
 for(const c of all){
  if(!ID.test(c.id)||ids.has(c.id))errors.push('BAD_ID:'+c.id);ids.add(c.id);
  if(c.lesson_id.split('-')[0]!==c.level||c.concept_id!=='GC-'+c.lesson_id)errors.push('BAD_LESSON:'+c.id);
  if(passages.has(c.passage_en)||c.passage_en.trim().length<450)errors.push('BAD_PASSAGE:'+c.id);
  passages.add(c.passage_en);
  const count=expected[c.level];
  if(c.questions.length!==3||c.editing.id!==c.id+'-Q4'||c.diagnosis.id!==c.id+'-Q5'||
   c.transfer.id!==c.id+'-Q6'||!c.editing.draft_en||!c.editing.reference_en||
   c.editing.draft_en===c.editing.reference_en||c.editing.error_slots?.length!==count)
   errors.push('BAD_TASKS:'+c.id);
  if(c.editing.auto_grade!==false||c.diagnosis.auto_grade!==false||c.transfer.auto_grade!==false||
    c.editing.grade_state!=='NEEDS_REVIEW'||c.diagnosis.grade_state!=='NEEDS_REVIEW'||
    c.transfer.grade_state!=='NEEDS_REVIEW')errors.push('BAD_OPEN_POLICY:'+c.id);
  if(c.editing.reference_en!==c.passage_en)errors.push('BAD_REFERENCE:'+c.id);
  const slots=c.editing.error_slots??[];
  if(new Set(slots.map(x=>x.type)).size!==count)errors.push('DUP_ERROR_TYPE:'+c.id);
  for(const s of slots){if(c.editing.draft_en?.split(s.wrong).length!==2||
     c.editing.reference_en?.split(s.correct).length!==2||!s.explanation_vi.trim()||!s.requires_teacher_review)
    errors.push('BAD_ERROR_SLOT:'+c.id+':'+s.type);}
  for(let i=0;i<3;i++){
   const q=c.questions[i];if(!q||q.id!==c.id+'-Q'+(i+1)||qids.has(q.id)||!QID.test(q.id)||
    q.options_en.length!==3||new Set(q.options_en).size!==3||q.rationales_vi.length!==3||
    !Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>2||
    q.rationales_vi.some(r=>r.trim().length<40))errors.push('BAD_CHECK:'+c.id+':'+i);
   qids.add(q?.id);
  }
  if(c.teacher_approved!==false||c.publishable!==false||c.editorial_status!=='DRAFT_REQUIRES_TEACHER_REVIEW'||
   c.counts_for_mastery!==false||c.can_unlock_level!==false||c.formative_only!==true)
   errors.push('BAD_RELEASE:'+c.id);
 }
 return errors;
}
