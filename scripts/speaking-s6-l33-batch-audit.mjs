#!/usr/bin/env node
/**
 * L33 OFFLINE 44-lesson QA intake. Reads ONLY operator-provided local files.
 * No Supabase/network, imports, writes, logs of questions/models/private paths,
 * release unlock, IELTS band rating or teacher certification.
 */
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,lstatSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectL33LocalPackage} from "./speaking-s6-l33-teacher-review.mjs";

const ID=i=>"S6-"+String(i).padStart(3,"0");
const MAX_FILE=2*1024*1024;
const normalize=x=>String(x??"").toLowerCase().replace(/\s+/g," ").trim();
const shaText=x=>createHash("sha256").update(normalize(x),"utf8").digest("hex");
function privateQuestions(pkg){
 const p=pkg?.privateLesson,lesson=pkg?.lesson;
 const all=[
  ...(lesson?.guided?.map(x=>x.question_en)??[]),
  ...Object.values(p?.independent??{}).map(x=>x?.question_en),
  ...Object.values(p?.mastery??{}).map(x=>x?.question_en)
 ];
 return all.filter(x=>typeof x==="string"&&x.trim().length>=5);
}
export function auditL33BatchPackages(records){
 const errors=[],lesson_reports=[],seenIds=new Set(),questionFirst=new Map(),duplicates=new Set();
 if(!Array.isArray(records)||records.length!==44)
   errors.push("EXPECTED_44_LOCAL_PACKAGES");
 for(let i=0;i<(Array.isArray(records)?records.length:0);i++){
   const record=records[i],id=ID(i+1),lesson=record?.pkg?.lesson;
   if(record?.lessonId!==id||lesson?.lesson_id!==id||seenIds.has(record?.lessonId)){
     errors.push("LESSON_ID_ORDER_OR_MISMATCH:"+id);
     continue;
   }
   seenIds.add(record.lessonId);
   const inspected=inspectL33LocalPackage(record.pkg);
   lesson_reports.push({lesson_id:id,passed_checks:inspected.passed_checks,
     total_checks:inspected.total_checks,failed_check_codes:inspected.failed_check_codes});
   for(const q of privateQuestions(record.pkg)){
     const hash=shaText(q);
     if(questionFirst.has(hash)&&questionFirst.get(hash)!==id){
       duplicates.add(questionFirst.get(hash));
       duplicates.add(id);
     }else if(!questionFirst.has(hash))questionFirst.set(hash,id);
   }
 }
 if(duplicates.size)errors.push("EXACT_CROSS_LESSON_PROMPT_DUPLICATES");
 const failed=lesson_reports.filter(x=>x.failed_check_codes.length>0);
 return {
  milestone:"M10-L33",
  inspection:"44_LOCAL_IMPORT_PACKAGES_STRUCTURAL_ONLY",
  lessons_expected:44,lessons_checked:lesson_reports.length,
  lessons_with_structure_flags:failed.length,
  exact_cross_lesson_duplicate_lesson_ids:[...duplicates].sort(),
  errors,lesson_reports,
  status:!errors.length&&!failed.length&&lesson_reports.length===44
    ?"READY_FOR_TEACHER_CONTENT_REVIEW":"HOLD_CONTENT_STRUCTURE",
  real_teacher_lessons_certified:0,release_authorized:false,
  s7_unlock_authorized:false,private_content_returned:false
 };
}
export function readL33PrivateDirectory(root){
 const dir=resolve(root),st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error("INVALID_LOCAL_DIRECTORY");
 const entries=readdirSync(dir,{withFileTypes:true});
 // Reject a missing or unexpected set of import JSON files, as well as
 // symlinked or nonregular lesson files; no dynamic execution from imports.
 const json=entries.filter(e=>e.name.endsWith(".json"));
 if(json.length!==44||json.some(e=>!e.isFile()||!/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])\.json$/.test(e.name)))
   throw Error("EXPECTED_EXACT_44_NONSYMLINK_LESSON_JSON_FILES");
 const result=[];
 for(let i=1;i<=44;i++){
   const id=ID(i),name=id+".json",entry=json.find(e=>e.name===name);
   if(!entry)throw Error("MISSING_LESSON_IMPORT_FILE");
   const path=join(dir,name),file=lstatSync(path);
   if(!file.isFile()||file.isSymbolicLink()||file.size>MAX_FILE||file.size<100)
     throw Error("INVALID_LESSON_IMPORT_FILE");
   result.push({lessonId:id,pkg:JSON.parse(readFileSync(path,"utf8"))});
 }
 return result;
}
async function main(){
 const index=process.argv.indexOf("--inspect-private-local-dir");
 if(index<0){
   console.log(JSON.stringify({milestone:"M10-L33",status:"HOLD_NO_LOCAL_PACKAGES",
     lessons_checked:0,real_teacher_lessons_certified:0,release_authorized:false}));
   return;
 }
 if(!process.argv[index+1])throw Error("LOCAL_PRIVATE_DIRECTORY_REQUIRED");
 const report=auditL33BatchPackages(readL33PrivateDirectory(process.argv[index+1]));
 // No file path or question text in this report.
 console.log(JSON.stringify(report,null,2));
 if(report.status!=="READY_FOR_TEACHER_CONTENT_REVIEW")process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error("L33 local package audit HOLD; no private paths disclosed");process.exitCode=2;});
}
