/** M26 learner transfer — reference implementation, NO_GO_PRODUCTION. */
export type Level='A1'|'A2'|'B1'|'B2'|'C1'|'C2';
export type Mode='WRITING'|'SPEAKING';
export type Stage='GUIDED_WRITING'|'GUIDED_SPEAKING'|'INDEPENDENT_TRANSFER';
export type Rubric={id:string;vi:string};
export type Task={id:string;revision:'M26.1';level:Level;lesson_id:string;title_vi:string;
 mode:Mode;stage:Stage;prompt_vi:string;source_context_en:string;source_case_id:string|null;
 source_genre_en:string|null;source_checkpoint_ids:string[];preparation_steps_vi:string[];
 target_vi:string;time_length_vi:string;rubric:Rubric[];reference_model_en:string;
 reference_origin:string;model_is_exact_answer:boolean;model_disclaimer_vi:string;
 open_answer_grading:'NEEDS_REVIEW';automatic_language_grade:false;audio_recording_implemented:false;
 teacher_approved:boolean;publishable:boolean;formative_only:true;counts_for_mastery:false;
 can_unlock_level:false;editorial_status:string};
export type Approval={id:string;sha256:string;reviewerId:string;reviewedAt:string};
export type ReleaseEvidence={rubricsReviewed:boolean;contentReviewed:boolean;modelsReviewed:boolean;
 rlsTested:boolean;stagingE2ETested:boolean;teacherSignoffId:string};
const ID=/^M26-GTS-(A1|A2|B1|B2|C1|C2)-\d{2}-(WG|SG|IT)$/;
const LEVELS=['A1','A2','B1','B2','C1','C2'] as const;
export const M26_POLICY={defaultOff:true,formativeOnly:true,noAutomaticEssayGrade:true,noPronunciationGrade:true,
 noMastery:true,noAutoLevelUnlock:true} as const;

/** Keep the M19 language model, keys, signoffs and editorial flags off public initial payloads. */
export function publicTask(t:Task){return {
 id:t.id,lessonId:t.lesson_id,level:t.level,mode:t.mode,stage:t.stage,titleVi:t.title_vi,
 promptVi:t.prompt_vi,sourceContextEn:t.source_context_en,sourceGenreEn:t.source_genre_en,
 preparationStepsVi:t.preparation_steps_vi,targetVi:t.target_vi,timeLengthVi:t.time_length_vi,
 rubric:t.rubric,formativeOnly:true,automaticGrading:false,canUnlockLevel:false,
 speechTranscriptInput:t.mode==='SPEAKING',audioRecordingImplemented:false
};}

/** Free-form outputs cannot be reliably marked grammatically correct by exact match. */
export function reviewSubmission(t:Task,answer:unknown){
 if(typeof answer!=='string'||answer.trim().length<15||answer.length>6000||/[\u0000-\u0008\u000b\u000e-\u001f]/.test(answer))return null;
 const norm=(x:string)=>x.normalize('NFKC').toLowerCase().replace(/[\s\u00a0]+/g,' ').trim();
 const exact=norm(answer)===norm(t.reference_model_en);
 return {taskId:t.id,status:'NEEDS_REVIEW' as const,formativeOnly:true,masteryImpact:false,
 levelUnlock:false,matchedReferenceText:exact,
 messageVi:exact?'Câu viết khớp mẫu nguồn; vẫn cần xem tính phù hợp trong ngữ cảnh.':
 'Đã nhận bài. Khác mẫu không đồng nghĩa sai; hãy tự đối chiếu tiêu chí và nhờ giáo viên xem khi cần.',
 rubric:t.rubric,referenceModelEn:t.reference_model_en,
 referenceCautionVi:t.model_disclaimer_vi,feedbackIsHumanVerified:false,
 pronunciationScored:false};
}
export function eligibleForPublication(t:Task,a:Approval|undefined,e:ReleaseEvidence|null,sha:string){
 return Boolean(ID.test(t.id)&&t.publishable===true&&t.teacher_approved===true&&
 t.editorial_status==='PUBLISHED'&&a?.id===t.id&&a.sha256===sha&&
 /^[a-f0-9]{64}$/.test(sha)&&a.reviewerId?.trim()&&Number.isFinite(Date.parse(a.reviewedAt))&&
 e?.rubricsReviewed&&e.contentReviewed&&e.modelsReviewed&&e.rlsTested&&
 e.stagingE2ETested&&e.teacherSignoffId?.trim());
}
export function validateTasks(tasks:readonly Task[]):string[]{
 const errors:string[]=[],ids=new Set<string>(),lessons=new Map<string,Set<string>>();
 for(const t of tasks){
  if(!ID.test(t.id)||ids.has(t.id))errors.push('BAD_ID:'+t.id);ids.add(t.id);
  if(t.lesson_id!==t.id.slice(8,13)||t.lesson_id.slice(0,2)!==t.level)
   errors.push('BAD_LESSON_LINK:'+t.id);
  if(!LEVELS.includes(t.level)||!t.source_checkpoint_ids.length||!t.reference_model_en.trim()||
   t.prompt_vi.length<70||t.preparation_steps_vi.length<4||t.rubric.length!==4)
   errors.push('MISSING_CONTENT:'+t.id);
  if((t.mode==='WRITING'&&t.id.endsWith('-SG'))||(t.mode==='SPEAKING'&&t.id.endsWith('-WG')))
   errors.push('BAD_STAGE_MODE:'+t.id);
  if(t.id.endsWith('-IT')&&!t.source_case_id)errors.push('NO_INDEPENDENT_CONTEXT:'+t.id);
  if(!t.id.endsWith('-WG')&&!t.source_context_en)errors.push('NO_CONTEXT:'+t.id);
  if(t.automatic_language_grade!==false||t.audio_recording_implemented!==false||
   t.counts_for_mastery!==false||t.can_unlock_level!==false||t.formative_only!==true||
   t.open_answer_grading!=='NEEDS_REVIEW')errors.push('UNSAFE_GRADING:'+t.id);
  if(t.teacher_approved||t.publishable||t.editorial_status!=='DRAFT_REQUIRES_TEACHER_REVIEW')
   errors.push('UNSAFE_RELEASE:'+t.id);
  if(!lessons.has(t.lesson_id))lessons.set(t.lesson_id,new Set());
  lessons.get(t.lesson_id)!.add(t.id.slice(-2));
 }
 for(const [id,stages] of lessons){if(stages.size!==3||!['WG','SG','IT'].every(s=>stages.has(s)))errors.push('INCOMPLETE_LESSON:'+id);}
 if(lessons.size!==180||tasks.length!==540)errors.push('INCOMPLETE_COVERAGE');
 return errors;
}
