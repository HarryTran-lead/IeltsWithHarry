/** M25 context + detective: conservative assessment, drafts never certify grammar mastery. */
export type M25Level='A1'|'A2'|'B1'|'B2'|'C1'|'C2';
export type M25CheckType='CLOZE_CONTEXT'|'READING_EVIDENCE'|'GRAMMAR_DETECTIVE';
export type M25MCQ={id:string;type:M25CheckType;prompt_vi:string;options_en:[string,string,string];
 correct_index:number;rationales_vi:[string,string,string];teacher_review_required:true;formative_only:true};
export type M25Transfer={id:string;type:'OPEN_TRANSFER';instruction_vi:string;
 rubric_vi:string[];auto_grade:false;grade_state:'NEEDS_REVIEW'};
export type M25Case={id:string;revision:'M25.1';level:M25Level;lesson_id:string;
 concept_id:string;focus:string;genre:string;source_type:'ORIGINAL_AUTHORED_PILOT';
 passage_en:string;questions:M25MCQ[];transfer:M25Transfer;
 editorial_status:string;teacher_approved:boolean;publishable:boolean;
 counts_for_mastery:false;can_unlock_level:false;formative_only:true;
 grading_policy:'FIXED_CHOICES_ONLY_OPEN_TRANSFER_NEEDS_REVIEW';risk_flag:string};
export type M25Approval={id:string;sha256:string;reviewerId:string;reviewedAt:string};
export type M25Evidence={curriculumReview:boolean;independentSemanticReview:boolean;
 versionVerified:boolean;rlsVerified:boolean;stagingE2EVerified:boolean;teacherSignoffId:string};
export const M25_POLICY={revision:'M25.1',pilotOnly:true,formativeOnly:true,
 countsForMastery:false,canUnlockLevel:false,noCefrCertification:true} as const;
const ID=/^M25-GIC-(A1|A2|B1|B2|C1|C2)-\d{3}$/;
const QID=/^M25-GIC-(A1|A2|B1|B2|C1|C2)-\d{3}-Q[1-4]$/;
/** Removes answer keys, rationale and content approval metadata in one allowlisted projection. */
export function m25PublicCase(c:M25Case){return {
 id:c.id,level:c.level,lessonId:c.lesson_id,focus:c.focus,genre:c.genre,
 passageEn:c.passage_en,questions:c.questions.map(q=>({id:q.id,type:q.type,
  promptVi:q.prompt_vi,optionsEn:q.options_en})),
 transfer:{id:c.transfer.id,instructionVi:c.transfer.instruction_vi},
 formativeOnly:true,canUnlockLevel:false,referenceAnswersHidden:true,
};}
/** Server-side MCQ judgement; returns the rationale *for that chosen option*, never by name or guess. */
export function m25GradeChoice(c:M25Case,id:unknown,selection:unknown){
 if(typeof id!=='string'||!QID.test(id)||!Number.isInteger(selection)||typeof selection!=='number')return null;
 const q=c.questions.find(x=>x.id===id);
 if(!q||selection<0||selection>=q.options_en.length)return null;
 return {caseId:c.id,questionId:q.id,status:selection===q.correct_index?'MATCHED_TARGET':'NOT_TARGET',
  rationaleVi:q.rationales_vi[selection],correctOption:q.options_en[q.correct_index],
  explanationForCorrectVi:q.rationales_vi[q.correct_index],formativeOnly:true,
  masteryImpact:false,canUnlockLevel:false};
}
export function m25GradeTransfer(c:M25Case,questionId:unknown,text:unknown){
 if(questionId!==c.transfer.id||typeof text!=='string'||text.trim().length<10||text.length>1400)return null;
 return {caseId:c.id,questionId:c.transfer.id,status:'NEEDS_REVIEW',
  feedbackVi:'Đã ghi nhận bản nháp để tự đối chiếu. Chưa có công cụ chấm chính xác mọi cách viết hợp lệ.',
  rubricVi:c.transfer.rubric_vi,formativeOnly:true,masteryImpact:false,canUnlockLevel:false};
}
export function m25Eligible(c:M25Case,approval:M25Approval|undefined,evidence:M25Evidence|null,sha:string){
 return Boolean(ID.test(c.id)&&c.editorial_status==='PUBLISHED'&&c.teacher_approved&&c.publishable&&
  approval?.id===c.id&&approval.sha256===sha&&/^[a-f0-9]{64}$/.test(sha)&&
  approval.reviewerId?.trim()&&Number.isFinite(Date.parse(approval.reviewedAt))&&
  evidence?.curriculumReview&&evidence?.independentSemanticReview&&
  evidence?.versionVerified&&evidence?.rlsVerified&&evidence?.stagingE2EVerified&&
  evidence?.teacherSignoffId?.trim());
}
export function m25Validate(cases:readonly M25Case[]):string[]{
 const errors:string[]=[],ids=new Set<string>(),passages=new Set<string>();
 for(const c of cases){
  if(!ID.test(c.id)||ids.has(c.id))errors.push('BAD_ID:'+c.id);
  ids.add(c.id);
  if(c.level!==c.lesson_id.split('-')[0]||c.concept_id!=='GC-'+c.lesson_id)errors.push('BAD_SOURCE_LINK:'+c.id);
  if((c.passage_en.match(/\[GAP\]/g)||[]).length!==1||c.passage_en.length<110||passages.has(c.passage_en))errors.push('BAD_PASSAGE:'+c.id);
  passages.add(c.passage_en);
  if(c.questions.length!==3||c.transfer.id!==c.id+'-Q4'||c.transfer.auto_grade!==false)errors.push('BAD_ACTIVITY_COUNT:'+c.id);
  c.questions.forEach((q,i)=>{
   if(q.id!==c.id+'-Q'+(i+1)||q.options_en.length!==3||q.rationales_vi.length!==3||
     new Set(q.options_en).size!==3||!Number.isInteger(q.correct_index)||q.correct_index<0||q.correct_index>2)
    errors.push('BAD_CHECK:'+q.id);
  });
  if(c.editorial_status!=='DRAFT_REQUIRES_TEACHER_REVIEW'||c.publishable||c.teacher_approved||
    c.counts_for_mastery!==false||c.can_unlock_level!==false||!c.formative_only)
   errors.push('UNSAFE_RELEASE:'+c.id);
 }
 return errors;
}
