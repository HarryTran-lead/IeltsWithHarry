/** M24 Sentence Transformation: fail-closed, formative-only, answer-safe types and algorithms. */
export type M24Level='A1'|'A2'|'B1'|'B2'|'C1'|'C2';
export type M24Risk='EXACT_MEANING_TARGET'|'CONTEXT_EQUIVALENCE_CHECK'|'RHYTHM_EMPHASIS_CHECK'|
  'REGISTER_STYLE_CHECK'|'EMPHASIS_NUANCE_CHECK'|'LOGICAL_SCOPE_REVIEW';
export type M24Item={id:string;revision:'M24.1';level:M24Level;family_id:string;
  source_lesson_id:string;source_concept_id:string;instruction_vi:string;
  source_sentence_en:string;rewrite_cue:string;reference_answers_en:string[];
  explanation_vi:string;meaning_integrity_targets:string[];semantic_risk:M24Risk;
  editorial_status:string;formative_only:true;counts_for_mastery:false;
  can_unlock_level:false;auto_grade_policy:'EXACT_REFERENCE_ONLY_OTHERWISE_REVIEW';
  teacher_approved:boolean;source:string};
export type M24Approval={id:string;fingerprint:string;reviewerId:string;reviewedAt:string};
export type M24Evidence={curriculumReview:boolean;independentSemanticReview:boolean;
  versionVerified:boolean;rlsVerified:boolean;stagingE2EVerified:boolean;teacherSignoffId:string};
export const M24_POLICY={version:'M24.1',pilotOnly:true,formativeOnly:true,
  countsForMastery:false,canUnlockLevel:false,noCefrCertification:true} as const;
const VALID=/^M24-ST-(A1|A2|B1|B2|C1|C2)-[A-Z0-9_]+-(0[1-9]|1[0-9]|20)$/;
/** Key details intentionally omitted. Never import private bank into browser code. */
export function m24PublicItem(item:M24Item){return {
 id:item.id,level:item.level,sourceLessonId:item.source_lesson_id,
 familyId:item.family_id,cue:item.rewrite_cue,instructionVi:item.instruction_vi,
 sourceSentenceEn:item.source_sentence_en,formativeOnly:true,masteryImpact:false,
 canUnlockLevel:false,referenceAnswerHidden:true,
};}
/** Conservative normalization: do not alter vocabulary, tense, number, word order or negation. */
export function m24Normalise(text:string):string{
 return text.normalize('NFKC').replace(/[\u2018\u2019]/g,"'")
   .trim().replace(/\s+/g,' ').replace(/[.!?]+$/g,'').trim().toLocaleLowerCase('en');
}
export function m24Grade(item:M24Item,response:unknown){
 if(typeof response!=='string'||response.trim()===''||response.length>600)return null;
 const clean=m24Normalise(response);
 const matched=item.reference_answers_en.some(a=>m24Normalise(a)===clean);
 return {
  itemId:item.id,status:matched?'MATCHED_REFERENCE':'NEEDS_REVIEW',
  messageVi:matched?
   'Câu của bạn khớp một đáp án mẫu. Đây chỉ là phản hồi luyện tập, chưa chứng nhận thành thạo.':
   'Câu của bạn chưa khớp các mẫu đã lưu; điều này KHÔNG có nghĩa câu sai. Hãy so sánh nghĩa hoặc nhờ giáo viên đối chiếu.',
  explanationVi:item.explanation_vi,
  referenceAnswerEn:item.reference_answers_en[0],
  semanticRisk:item.semantic_risk,
  formativeOnly:true,masteryImpact:false,canUnlockLevel:false,
 } as const;
}
export function m24Eligible(item:M24Item,approval:M24Approval|undefined,
 evidence:M24Evidence|null,fingerprint:string):boolean{
 return Boolean(VALID.test(item.id)&&item.editorial_status==='PUBLISHED'&&item.teacher_approved&&
 approval?.id===item.id&&approval.fingerprint===fingerprint&&/^[a-f0-9]{64}$/.test(fingerprint)&&
 approval.reviewerId?.trim()&&approval.reviewedAt&&Number.isFinite(Date.parse(approval.reviewedAt))&&
 evidence?.curriculumReview&&evidence?.independentSemanticReview&&evidence?.versionVerified&&
 evidence?.rlsVerified&&evidence?.stagingE2EVerified&&evidence?.teacherSignoffId?.trim());
}
export function m24Validate(items:readonly M24Item[],lessons:ReadonlySet<string>):string[]{
 const errors:string[]=[],ids=new Set<string>(),sources=new Set<string>(),targets=new Set<string>();
 for(const q of items){
  if(!VALID.test(q.id)||ids.has(q.id))errors.push('BAD_ID:'+q.id);ids.add(q.id);
  if(!lessons.has(q.source_lesson_id)||q.source_concept_id!=='GC-'+q.source_lesson_id||
    q.level!==q.source_lesson_id.split('-')[0])errors.push('BAD_LINK:'+q.id);
  if(q.reference_answers_en.length===0||!q.reference_answers_en.every(x=>x.length>=15)||
    q.instruction_vi.length<20||q.explanation_vi.length<45||q.source_sentence_en.length<15)
    errors.push('BAD_TEACHING_CONTENT:'+q.id);
  if(q.source_sentence_en===q.reference_answers_en[0])errors.push('NO_REWRITE:'+q.id);
  if(sources.has(q.source_sentence_en.toLowerCase())||targets.has(q.reference_answers_en[0].toLowerCase()))
    errors.push('DUPLICATE_SENTENCE:'+q.id);
  sources.add(q.source_sentence_en.toLowerCase());targets.add(q.reference_answers_en[0].toLowerCase());
  if(q.editorial_status!=='DRAFT_REQUIRES_TEACHER_REVIEW'||q.teacher_approved||
    !q.formative_only||q.counts_for_mastery!==false||q.can_unlock_level!==false||
    q.auto_grade_policy!=='EXACT_REFERENCE_ONLY_OTHERWISE_REVIEW')errors.push('UNSAFE_RELEASE:'+q.id);
 }
 return errors;
}
