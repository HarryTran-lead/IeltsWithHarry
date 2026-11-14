/** M25C: private-bank, formative-only context practice. No client-side answer keys. */
export type M25CLevel='A1'|'A2'|'B1'|'B2'|'C1'|'C2';
export type M25CCheckType='READING_EVIDENCE'|'CONTEXT_GRAMMAR'|'MULTI_ERROR_DIAGNOSIS';
export type M25CQuestion={id:string;type:M25CCheckType;prompt_vi:string;
 options_en:[string,string,string];correct_index:number;rationales_vi:[string,string,string];
 formative_only:true;teacher_review_required:true};
export type M25COpen={id:string;type:'MULTI_ERROR_EDIT'|'OPEN_TRANSFER';
 prompt_vi?:string;draft_en?:string;reference_en?:string;editor_note_vi?:string;error_slots?:{type:string;wrong:string;correct:string}[];
 rubric_vi:string[];auto_grade:false;grade_state:'NEEDS_REVIEW'};
export type M25CCase={id:string;revision:'M25C.1';source_checkpoint_id?:string;level:M25CLevel;lesson_id:string;
 lesson_title:string;concept_id:string;genre:string;source_type:'ORIGINAL_AUTHORED_DRAFT';
 passage_en:string;questions:M25CQuestion[];editing:M25COpen;transfer:M25COpen;
 editorial_status:string;teacher_approved:boolean;publishable:boolean;
 counts_for_mastery:false;can_unlock_level:false;formative_only:true;
 grading_policy:string;risk_flag:string};
export type M25CApproval={id:string;sha256:string;reviewerId:string;reviewedAt:string};
export type M25CEvidence={curriculumReview:boolean;semanticReview:boolean;
 questionReview:boolean;rlsVerified:boolean;stagingE2EVerified:boolean;teacherSignoffId:string};
export const M25C_POLICY={draftOnly:true,formativeOnly:true,noMastery:true,
 noLevelUnlock:true,noCEFRCertification:true} as const;
const CASE=/^M25C-GIC-(A1|A2|B1|B2|C1|C2)-\d{3}$/;
const CHECK=/^M25C-GIC-(A1|A2|B1|B2|C1|C2)-\d{3}-Q[1-3]$/;
/** Public allowlist returns the error draft but never the corrected reference or explanation. */
export function m25cPublic(c:M25CCase){return {id:c.id,level:c.level,
 lessonId:c.lesson_id,lessonTitle:c.lesson_title,genre:c.genre,passageEn:c.passage_en,
 questions:c.questions.map(q=>({id:q.id,type:q.type,promptVi:q.prompt_vi,
 optionsEn:q.options_en})),
 editing:{id:c.editing.id,promptVi:c.editing.prompt_vi,draftEn:c.editing.draft_en},
 transfer:{id:c.transfer.id,promptVi:c.transfer.prompt_vi},
 assessment:'FORMATIVE_ONLY' as const,canUnlockLevel:false};}
/** Exact multiple-choice key must stay server-side. */
export function m25cGradeChoice(c:M25CCase,qid:unknown,answer:unknown){
 if(typeof qid!=='string'||!CHECK.test(qid)||typeof answer!=='number'||
  !Number.isInteger(answer))return null;
 const q=c.questions.find(x=>x.id===qid);
 if(!q||answer<0||answer>2)return null;
 return {caseId:c.id,questionId:q.id,status:answer===q.correct_index?'MATCHED_TARGET':'NOT_TARGET',
   rationaleVi:q.rationales_vi[answer],correctOption:q.options_en[q.correct_index],
   explanationForCorrectVi:q.rationales_vi[q.correct_index],formativeOnly:true,
   masteryImpact:false,canUnlockLevel:false};
}
/** Do not treat other grammatical alternatives as incorrect. */
export function m25cGradeOpen(c:M25CCase,qid:unknown,answer:unknown){
 const item=qid===c.editing.id?c.editing:qid===c.transfer.id?c.transfer:null;
 if(!item||typeof answer!=='string'||answer.trim().length<12||answer.length>3000)return null;
 const exact=typeof item.reference_en==='string' &&
  answer.trim().replace(/\s+/g,' ').toLowerCase()===item.reference_en.trim().replace(/\s+/g,' ').toLowerCase();
 return {caseId:c.id,questionId:item.id,status:'NEEDS_REVIEW' as const,
  matchedReferenceFormatting:Boolean(exact),
  feedbackVi:exact?'Bản sửa khớp câu tham khảo. Đây không phải điểm Mastery.':
    'Đã nhận câu viết. Cần đối chiếu thêm, không kết luận sai chỉ vì khác mẫu.',
  rubricVi:item.rubric_vi,referenceEn:item.reference_en || null,
  noteVi:item.editor_note_vi||null,formativeOnly:true,masteryImpact:false,canUnlockLevel:false};
}
export function m25cEligible(c:M25CCase,approval:M25CApproval|undefined,
 evidence:M25CEvidence|null,sha:string){
 return Boolean(CASE.test(c.id)&&c.teacher_approved&&c.publishable&&
 c.editorial_status==='PUBLISHED'&&approval?.id===c.id&&approval.sha256===sha&&
 /^[a-f0-9]{64}$/.test(sha)&&approval.reviewerId?.trim()&&
 Number.isFinite(Date.parse(approval.reviewedAt))&&evidence?.curriculumReview&&
 evidence.semanticReview&&evidence.questionReview&&evidence.rlsVerified&&
 evidence.stagingE2EVerified&&evidence.teacherSignoffId?.trim());
}
export function m25cValidate(cases:readonly M25CCase[]):string[]{
 const errors:string[]=[],ids=new Set<string>(),passages=new Set<string>();
 for(const c of cases){
  if(!CASE.test(c.id)||ids.has(c.id))errors.push('BAD_ID:'+c.id);ids.add(c.id);
  if(c.lesson_id.split('-')[0]!==c.level||c.concept_id!=='GC-'+c.lesson_id)
   errors.push('BAD_LESSON:'+c.id);
  if(c.passage_en.length<220||passages.has(c.passage_en))errors.push('BAD_PASSAGE:'+c.id);
  passages.add(c.passage_en);
  if(c.questions.length!==3||c.editing.id!==c.id+'-Q4'||c.transfer.id!==c.id+'-Q5'||
    !c.editing.draft_en||!c.editing.reference_en||c.editing.draft_en===c.editing.reference_en||
    !c.editing.error_slots||c.editing.error_slots.length!==2||
    c.editing.auto_grade!==false||c.transfer.auto_grade!==false)errors.push('BAD_TASKS:'+c.id);
  if(c.editing.error_slots?.some(slot=>!c.editing.draft_en?.includes(slot.wrong)||!c.editing.reference_en?.includes(slot.correct)))
    errors.push('BAD_EDITOR_EVIDENCE:'+c.id);
  c.questions.forEach((q,i)=>{
   if(q.id!==c.id+'-Q'+(i+1)||q.options_en.length!==3||
    new Set(q.options_en).size!==3||q.rationales_vi.length!==3||
    !Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>2||
    !q.rationales_vi.every(x=>x.trim().length>45))errors.push('BAD_CHECK:'+q.id);
  });
  if(c.teacher_approved||c.publishable||c.editorial_status!=='DRAFT_REQUIRES_TEACHER_REVIEW'||
    c.counts_for_mastery!==false||c.can_unlock_level!==false||c.formative_only!==true)
   errors.push('BAD_RELEASE:'+c.id);
 }
 return errors;
}
