/** M21 diagnostic engine. PURE functions, no hidden time/DB. Assessment never grants CEFR or course unlock. */
export type M21Level = 'A1'|'A2'|'B1'|'B2'|'C1'|'C2';
export const M21_LEVELS: readonly M21Level[]=['A1','A2','B1','B2','C1','C2'];
export const M21_POLICY={version:'M21.1', minItemsPerConcept:2, minProvisionalConcepts:6,
  liveCoverageRatio:0.8, durationMinutes:25, maxAttemptsPer24Hours:3, pilotOnly:true} as const;
export type M21Item={id:string; level:M21Level; lesson_id:string; concept_id:string; micro_skill_target:string;
  version:string; prompt:string; options:string[]; correct_index:number; rationales_vi:string[];
  release_status:string; source:string; teacher_approved:boolean; exposure_policy:string};
export type M21Approval={id:string;fingerprint:string;reviewerId:string;reviewedAt:string;concept_id:string};
export type M21ReleaseEvidence={source_revision_verified:boolean; security_signed_off:boolean;
  human_calibration_signed_off:boolean; signatureId:string};
export type M21Publication={approved:readonly M21Approval[];approvedConceptIds:readonly string[];releaseEvidence:M21ReleaseEvidence|null};
export type M21Coverage={level:M21Level; distinctConcepts:number; items:number; requiredConcepts:number; ready:boolean; missingConcepts:string[]};
export type M21Result={assessmentKind:'diagnostic_screening_not_cefr_certification'; policyVersion:string;
  level:M21Level; evidence:'PILOT_LOW_CONFIDENCE'|'INCOMPLETE';
  points:number;total:number; conceptResults:{conceptId:string;correct:number;total:number;status:'REVIEW_PRIORITY'|'MIXED'|'PROVISIONAL_STRENGTH'|'INSUFFICIENT_EVIDENCE'}[];
  suggestedReviewLessonIds:string[];summary_vi:string; courseAccessGranted:false; cefrCertified:false};

/** Browser payload must not contain answer key or option explanations before submission. */
export function publicDiagnosticItem(item:M21Item){return {
  id:item.id,level:item.level,conceptId:item.concept_id,prompt:item.prompt,options:item.options,
};}
export function validateM21DraftBank(items:readonly M21Item[],conceptIds:ReadonlySet<string>):string[]{
  const errors:string[]=[];const ids=new Set<string>();const prompts=new Set<string>();
  for(const item of items){
    if(ids.has(item.id)) errors.push(`DUPLICATE_ID:${item.id}`); ids.add(item.id);
    if(!/^M21-DIAG-(A1|A2|B1|B2|C1|C2)-\d\d-\d\d$/.test(item.id))errors.push(`BAD_ID:${item.id}`);
    if(!M21_LEVELS.includes(item.level) || !item.lesson_id.startsWith(item.level+'-')||
      item.concept_id!==`GC-${item.lesson_id}` || !conceptIds.has(item.concept_id)) errors.push(`BAD_CONCEPT:${item.id}`);
    if(!Array.isArray(item.options)||item.options.length!==3||item.options.some(x=>typeof x!=='string'||!x.trim())||
       new Set(item.options.map(x=>x.trim().toLowerCase())).size!==3)errors.push(`BAD_OPTIONS:${item.id}`);
    if(!Number.isInteger(item.correct_index)||item.correct_index<0||item.correct_index>=3)errors.push(`BAD_KEY:${item.id}`);
    if(!Array.isArray(item.rationales_vi)||item.rationales_vi.length!==3||item.rationales_vi.some(s=>typeof s!=='string'||s.length<20))errors.push(`BAD_FEEDBACK:${item.id}`);
    if(!item.prompt||item.prompt.length<20)errors.push(`BAD_PROMPT:${item.id}`);
    const lower=item.prompt.trim().toLowerCase();if(prompts.has(lower))errors.push(`REPEATED_PROMPT:${item.id}`);prompts.add(lower);
    if(item.source!=='ORIGINAL_M21_DIAGNOSTIC_EXCLUSIVE')errors.push(`UNTRUSTED_SOURCE:${item.id}`);
    if(item.release_status==='PUBLISHED' && !item.teacher_approved) errors.push(`PUBLISHED_WITHOUT_APPROVAL:${item.id}`);
  }
  return errors;
}
/** FNV-like deterministic fingerprint is NOT sufficient for approval; a SHA-256 fingerprint is computed on the server. */
export function signedContentFields(item:M21Item):string{
  return JSON.stringify([item.id,item.level,item.concept_id,item.micro_skill_target,item.version,
    item.prompt,item.options,item.correct_index,item.rationales_vi,item.release_status,item.source]);
}
export function isEligibleLive(item:M21Item, approved:Map<string,M21Approval>,approvedConcepts:ReadonlySet<string>,
  releaseEvidence:M21ReleaseEvidence|null, fingerprint:string):boolean{
  const a=approved.get(item.id);
  return Boolean(releaseEvidence?.source_revision_verified && releaseEvidence?.security_signed_off &&
    releaseEvidence?.human_calibration_signed_off && releaseEvidence.signatureId?.trim() &&
    item.release_status==='PUBLISHED' && item.teacher_approved &&
    approvedConcepts.has(item.concept_id) && a?.concept_id===item.concept_id &&
    a?.fingerprint===fingerprint && /^[a-f0-9]{64}$/.test(fingerprint) && a.reviewerId?.trim() &&
    Number.isFinite(Date.parse(a.reviewedAt)));
}
/** Full live coverage: 80% of all M20 concepts in the requested CEFR level, >=2 independently authored items per concept. */
export function computeLiveCoverage(level:M21Level,allLevelConceptIds:readonly string[],eligibleItems:readonly M21Item[]):M21Coverage{
  const by=new Map<string,number>();for(const item of eligibleItems)if(item.level===level)by.set(item.concept_id,(by.get(item.concept_id)||0)+1);
  const covered=allLevelConceptIds.filter(id=>(by.get(id)||0)>=M21_POLICY.minItemsPerConcept);
  const required=Math.ceil(allLevelConceptIds.length*M21_POLICY.liveCoverageRatio);
  return {level,distinctConcepts:covered.length,items:eligibleItems.filter(x=>x.level===level).length,
    requiredConcepts:required,ready:covered.length>=required,missingConcepts:allLevelConceptIds.filter(id=>(by.get(id)||0)<2)};
}
/** Select exactly two per concept; only teacher-approved bank may be passed to live API. */
export function selectDiagnostic(items:readonly M21Item[],level:M21Level,requestedConcepts=6,
  chooseIndex:(maxExclusive:number)=>number=(max)=>Math.floor(Math.random()*max)):M21Item[]{
  const by=new Map<string,M21Item[]>();for(const item of items.filter(x=>x.level===level))
    by.set(item.concept_id,[...(by.get(item.concept_id)||[]),item]);
  const eligible=[...by.entries()].filter(([,arr])=>arr.length>=2);
  if(eligible.length<requestedConcepts)return [];
  const pool=[...eligible],selection:M21Item[]=[];
  while(selection.length<requestedConcepts*2){
    const ix=chooseIndex(pool.length);if(!Number.isInteger(ix)||ix<0||ix>=pool.length)throw Error('Invalid random index');
    const [concept,itemsForConcept]=pool.splice(ix,1)[0];
    const uniqueItems=[...new Map(itemsForConcept.map(x=>[x.id,x])).values()];
    if(uniqueItems.length<2)throw Error(`Duplicate candidate within ${concept}`);
    const firstIndex=chooseIndex(uniqueItems.length);
    if(!Number.isInteger(firstIndex)||firstIndex<0||firstIndex>=uniqueItems.length)throw Error('Invalid item random index');
    const first=uniqueItems.splice(firstIndex,1)[0];
    const secondIndex=chooseIndex(uniqueItems.length);
    if(!Number.isInteger(secondIndex)||secondIndex<0||secondIndex>=uniqueItems.length)throw Error('Invalid item random index');
    selection.push(first,uniqueItems[secondIndex]);
  }
  return selection;
}
export function scoreDiagnostic(items:readonly M21Item[],answers:Readonly<Record<string,number>>,level:M21Level):M21Result{
  if(items.length===0||items.some(x=>x.level!==level)||new Set(items.map(x=>x.id)).size!==items.length)throw Error('Invalid selected items');
  const expected=new Set(items.map(x=>x.id));if(Object.keys(answers).length!==expected.size||
    Object.entries(answers).some(([id,x])=>!expected.has(id)||!Number.isInteger(x)||x<0||x>2))throw Error('Invalid answer set');
  const by=new Map<string,{correct:number;total:number}>();let points=0;
  for(const x of items){const ok=answers[x.id]===x.correct_index?1:0;points+=ok;
    const group=by.get(x.concept_id)||{correct:0,total:0};group.correct+=ok;group.total+=1;by.set(x.concept_id,group);}
  const conceptResults=[...by].map(([conceptId,x])=>({conceptId,...x,
    status:(x.total<2?'INSUFFICIENT_EVIDENCE':x.correct===0?'REVIEW_PRIORITY':x.correct===x.total?'PROVISIONAL_STRENGTH':'MIXED') as M21Result['conceptResults'][number]['status']
  }));
  const priorities=[...conceptResults].filter(x=>x.status==='REVIEW_PRIORITY'||x.status==='MIXED').sort((a,b)=>a.correct/a.total-b.correct/b.total);
  return {assessmentKind:'diagnostic_screening_not_cefr_certification',policyVersion:M21_POLICY.version,level,
    evidence:conceptResults.every(x=>x.total>=2)?'PILOT_LOW_CONFIDENCE':'INCOMPLETE',points,total:items.length,conceptResults,
    suggestedReviewLessonIds:priorities.slice(0,5).map(x=>x.conceptId.replace(/^GC-/,'')),
    summary_vi:'Chỉ là tín hiệu ôn tập sơ bộ từ một mẫu câu hỏi nhỏ; không phải xác nhận trình độ, mức thành thạo hoặc quyền mở khóa.',
    courseAccessGranted:false,cefrCertified:false};
}
