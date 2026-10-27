// Restore the exact published flags and course metadata captured before V3 activation.
// Historical content was never deleted. Run only with the corresponding backup JSON.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const backupPath = process.argv[2];
if (!backupPath) throw new Error("Usage: node scripts/rollback-band56-v3.mjs <backup.json> --apply");
const backup = JSON.parse(readFileSync(backupPath, "utf8"));
if (backup.course?.slug !== "mindsetbuilder-topic-practice-5-6" || !Array.isArray(backup.units) || !Array.isArray(backup.lessons) || !Array.isArray(backup.assessments)) throw new Error("Unexpected Band 5–6 backup");
console.log(JSON.stringify({ courseId: backup.course.id, historicalUnits: backup.units.length, historicalLessons: backup.lessons.length, historicalAssessments: backup.assessments.length, mode: process.argv.includes("--apply") ? "restore" : "dry-run" }));
if (process.argv.includes("--apply")) {
  if (process.env.BAND56_V3_APPLY !== "confirmed") throw new Error("Set BAND56_V3_APPLY=confirmed to restore the previous course");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.AI_FACTORY_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AI_FACTORY_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase production URL or service role key");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  function check(result, context) { if (result.error) throw new Error(`${context}: ${result.error.message}`); return result.data; }
  const v3Units = check(await db.from("units").select("id").eq("course_id", backup.course.id).like("slug", "mindsetbuilder-v3-%"), "V3 units");
  if (v3Units.length) {
    const v3Lessons = check(await db.from("lessons").select("id").in("unit_id", v3Units.map((row) => row.id)), "V3 lessons");
    if (v3Lessons.length) check(await db.from("lessons").update({ published: false }).in("id", v3Lessons.map((row) => row.id)), "hide V3 lessons");
    check(await db.from("units").update({ published: false }).in("id", v3Units.map((row) => row.id)), "hide V3 units");
  }
  for (const lesson of backup.lessons) check(await db.from("lessons").update({ published: lesson.published }).eq("id", lesson.id), `restore lesson ${lesson.slug}`);
  for (const unit of backup.units) check(await db.from("units").update({ published: unit.published }).eq("id", unit.id), `restore unit ${unit.slug}`);
  for (const assessment of backup.assessments) check(await db.from("package_assessments").update({ published: assessment.published }).eq("id", assessment.id), `restore assessment ${assessment.slug}`);
  check(await db.from("courses").update({ title: backup.course.title, description: backup.course.description, published: backup.course.published }).eq("id", backup.course.id), "restore course");
  console.log("Band 5–6 V2 visibility restored; V3 remains as unpublished records.");
}
