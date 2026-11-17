import { createHash } from "node:crypto";
import { z } from "zod";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(obj[key])).join(",") + "}";
}
export const sha256Json = (value: unknown) => createHash("sha256").update(canonicalJson(value),"utf8").digest("hex");
export const lessonId = z.string().regex(/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])$/);
export const activityId = z.string().regex(/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])-[GIM]\d{2}$/);
const guided = z.object({activity_id:activityId,question_en:z.string().min(5),model_ref:z.string().min(1),hints:z.array(z.unknown()).length(3)}).passthrough();
const stub = z.object({activity_id:activityId,mode:z.enum(["INDEPENDENT","MASTERY"]),
  prompt_ref:z.string().startsWith("server:"),no_answer_key_on_student:z.literal(true),followup_delivery:z.string()}).strict();
export const studentSchema = z.object({
  lesson_id:lessonId,status:z.literal("STAGING_REVIEW_REQUIRED"),publish_allowed:z.literal(false),
  steps:z.array(z.unknown()).length(10),guided:z.array(guided).length(4),
  independent:z.array(stub).length(3),mastery:z.array(stub).length(2),
  spaced_review:z.array(z.unknown()).length(3)
}).passthrough();
const privateEntry = z.object({question_en:z.string().min(1)}).passthrough();
export const privateSchema = z.object({
  guided:z.record(z.string(),privateEntry.extend({model_answer_en:z.string().min(1)})),
  independent:z.record(z.string(),privateEntry),mastery:z.record(z.string(),privateEntry)
}).strict();
export const importSchema = z.object({
  revision:z.string().min(3).max(100),hash:z.string().regex(/^[a-f0-9]{64}$/),
  privateHash:z.string().regex(/^[a-f0-9]{64}$/),
  lesson:studentSchema,privateLesson:privateSchema
}).strict();
const sensitive = new Set(["model_answer_en","model_translation_vi","teacher_reasoning_vi","answer_key","answer_keys",
  "followup_en","followups_en","privateLesson","privateBank","private_answer_bank","correct_answer_en","mastery_answer"]);
function inspectPublic(value:unknown,trail="lesson"):void {
  if(Array.isArray(value)){value.forEach((x,i)=>inspectPublic(x,trail+"["+i+"]"));return;}
  if(!value || typeof value!=="object")return;
  for(const [k,v] of Object.entries(value)){
    if(sensitive.has(k))throw new Error("S6_PRIVATE_FIELD:"+trail+"."+k);
    if(k==="teacher_private_bank" && v!=="SERVER_ONLY")throw new Error("S6_PRIVATE_BANK_POINTER_INVALID");
    inspectPublic(v,trail+"."+k);
  }
}
export function validateS6Import(raw:unknown){
  const d=importSchema.parse(raw);
  if(sha256Json(d.lesson)!==d.hash)throw new Error("S6_STUDENT_HASH_MISMATCH");
  if(sha256Json(d.privateLesson)!==d.privateHash)throw new Error("S6_PRIVATE_HASH_MISMATCH");
  inspectPublic(d.lesson);
  for(const [mode,prefix] of [["guided","G"],["independent","I"],["mastery","M"]] as const){
    const ids=d.lesson[mode].map(v=>v.activity_id);
    const bankIds=Object.keys(d.privateLesson[mode]);
    if(ids.length!==bankIds.length || new Set(ids).size!==ids.length || ids.some(id=>
      !id.startsWith(d.lesson.lesson_id+"-"+prefix) || !Object.hasOwn(d.privateLesson[mode],id)))
      throw new Error("S6_KEY_MISMATCH:"+mode);
  }
  if(d.lesson.independent.some(x=>x.mode!=="INDEPENDENT") || d.lesson.mastery.some(x=>x.mode!=="MASTERY"))
    throw new Error("S6_MODE_MISMATCH");
  const text=JSON.stringify(d.lesson).toLowerCase();
  for(const mode of ["independent","mastery"] as const)for(const item of Object.values(d.privateLesson[mode])){
    for(const q of [item.question_en,...(Array.isArray(item.followups_en)?item.followups_en:[]),item.followup_en]){
      if(typeof q==="string" && q.trim().length>17 && text.includes(q.trim().toLowerCase()))
        throw new Error("S6_UNSEEN_QUESTION_LEAK");
    }
  }
  return d;
}
