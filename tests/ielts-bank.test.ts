import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createConnector, normalizeSource } from "../src/lib/ielts-bank/connectors";
import { contentHash, publicContent, scoreAnswers, validateExam } from "../src/lib/ielts-bank/schema";

describe("IELTS source normalization", () => {
  const reading = { id: "test-1", title: "Practice reading", test_type: "Academic", duration: "60 mins", passages: [{ id: "passage-1", title: "A passage", content: "Read this passage.", question_groups: [{ question_type: "true-false-not-given", instructions: "Choose one", questions: [{ id: "q1", question_order: 1, text: "A statement", answer: "TRUE", accepted_answers: ["True"] }] }] }] };
  it("imports an actual AI dataset-shaped Reading record with answers hidden from students", () => {
    const [exam] = normalizeSource("ielts-ai-dataset", "datasets/practice-drills/reading/sample.json", reading, "abc");
    expect(exam.skill).toBe("Reading");
    expect(validateExam(exam)).toEqual([]);
    expect(exam.content.sections[0].questions[0].answers).toEqual(["TRUE", "True"]);
    expect(publicContent(exam.content).sections[0].questions[0].answers).toEqual([]);
    expect(scoreAnswers(exam.content, { "passage-1:q1": " true " }).score).toBe(1);
    expect(contentHash(exam.content)).toBe(contentHash(exam.content));
  });
  it("extracts only filled completion gaps and flags missing answer keys", () => {
    const data = structuredClone(reading);
    data.passages[0].question_groups[0].questions = [{ id: "row", question_order: 2, text: "Row", answer: "", completion_gaps: [{ id: "heading", gap_text: "Year", answer: "" }, { id: "a", gap_text: "Method {{gap}}", answer: "cut-and-cover" }] }] as never;
    const [exam] = normalizeSource("ielts-ai-dataset", "datasets/practice-drills/reading/sample.json", data, "abc");
    expect(exam.content.sections[0].questions).toHaveLength(1);
    expect(exam.content.sections[0].questions[0].answers).toEqual(["cut-and-cover"]);
    exam.content.sections[0].questions[0].answers = [];
    expect(validateExam(exam)).toContain("answer_key_missing:passage-1:row:a");
  });
  it("keeps BandReady's non-MCQ structure and records incomplete audio", () => {
    const [exam] = normalizeSource("bandready", "content/core-en/data/listening_scripts.jsonl", { id: "ls1", title: "Conversation", script_json: { lines: [{ speaker: "A", text: "Hello" }], questions: [{ n: 1, type: "form_completion", prompt: "Name", answers: [["Mary"]] }] } }, "v1");
    expect(exam.content.sections[0].questions[0].type).toBe("form_completion");
    expect(validateExam(exam)).toContain("audio_missing");
  });
  it("labels BandReady General Training letters separately from Academic charts", () => {
    const [letter] = normalizeSource("bandready", "content/core-en/data/writing_prompts.jsonl", { id: "wp_gtl_01_formal_enquiry_field_course", task_type: "gt_task1", prompt_text: "Write a letter about a course." }, "v1");
    const [chart] = normalizeSource("bandready", "content/core-en/data/writing_prompts.jsonl", { id: "wp_a1_01_bar_recycling_materials", task_type: "ac_task1", prompt_text: "Describe the chart.", chart_spec: { kind: "bar" } }, "v1");
    expect(letter.format).toBe("General Training");
    expect(letter.title).toBe("Writing Task 1: Formal Enquiry Field Course");
    expect(chart.format).toBe("Academic");
    expect(chart.title).toBe("Writing Task 1: Bar Recycling Materials");
  });
  it("does not turn incomplete synthetic mocks into full mocks", () => {
    const [exam] = normalizeSource("ielts-ai-dataset", "datasets/synthetic-official-mocks/reading/sample.json", reading, "abc");
    expect(exam.mode).toBe("practice");
  });
  it("grades multiple answers as a complete set", () => {
    const [exam] = normalizeSource("ielts-ai-dataset", "datasets/practice-drills/reading/sample.json", reading, "abc");
    const question = exam.content.sections[0].questions[0];
    question.type = "multiple-answers";
    question.options = ["A — first", "B — second", "C — third"];
    question.answers = ["A", "C"];
    expect(scoreAnswers(exam.content, { [question.id]: "A — first,C — third" }).score).toBe(1);
    expect(scoreAnswers(exam.content, { [question.id]: "A — first" }).score).toBe(0);
  });
  it("isolates a malformed JSONL row so adjacent rows remain usable", () => {
    const rows = createConnector("bandready").parseContent("content/core-en/data/writing_prompts.jsonl", '{"id":"one"}\n{broken\n{"id":"three"}');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ __line: 2 });
    expect(rows[2]).toMatchObject({ id: "three" });
  });
  it("blocks a Writing chart reference until an approved image is available", () => {
    const [exam] = normalizeSource("ielts-ai-dataset", "datasets/practice-drills/writing/test.json", { tasks: [{ id: "task-1", task_type: "task1", prompt: "Describe the chart", image_url: "./chart.png" }] }, "abc");
    expect(validateExam(exam)).toContain("media_missing");
    exam.content.imageUrl = "https://example.org/chart.png";
    expect(validateExam(exam)).not.toContain("media_missing");
  });
});

describe("IELTS bank migration", () => {
  it("upserts once, creates a revision on change, and pins attempt versions", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
        create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
        create table storage.objects(bucket_id text);`);
      await db.exec(readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8"));
      await db.exec(readFileSync(resolve("supabase/migrations/202610270001_ielts_question_bank.sql"), "utf8"));
      await db.exec("set request.jwt.claim.role = 'service_role'");
      const content = JSON.stringify({ sections: [{ id: "p1", title: "Passage", passage: "Text", transcript: "", questions: [{ id: "q1", number: 1, type: "short-answer", prompt: "Question", instructions: "", options: [], answers: ["yes"], explanation: "" }] }], prompt: "" });
      const meta = JSON.stringify({ skill: "Reading", title: "Test", license: "CC0-1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/", source_url: "https://example.com/test", attribution: "BandReady" });
      const call = (hash: string, value = content) => db.query<{ result: string }>("select public.ielts_upsert_import('bandready','external-1',$1::jsonb,$2::jsonb,$3,'v1','[]'::jsonb) result", [meta, value, hash]);
      expect((await call("hash1")).rows[0].result).toBe("inserted");
      expect((await call("hash1")).rows[0].result).toBe("skipped");
      const exam = (await db.query<{ id: string; current_version_id: string }>("select id,current_version_id from public.ielts_exams")).rows[0];
      const user = "11111111-1111-4111-8111-111111111111";
      await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{}')", [user]);
      await db.query("insert into public.admin_users(user_id) values($1)", [user]);
      await db.query("insert into public.ielts_review_log(exam_id,version_id,actor_id,action) values($1,$2,$3,'ready')", [exam.id, exam.current_version_id, user]);
      await db.query("update public.ielts_exams set status='published',published_version_id=$1 where id=$2", [exam.current_version_id, exam.id]);
      await db.query("insert into public.ielts_attempts(user_id,exam_id,version_id) values($1,$2,$3)", [user, exam.id, exam.current_version_id]);
      const grade = scoreAnswers(JSON.parse(content), { q1: "yes" });
      await db.query("update public.ielts_attempts set answers=$1::jsonb,state='submitted',score=$2,total=$3,submitted_at=now() where user_id=$4", [JSON.stringify({ q1: "yes" }), grade.score, grade.total, user]);
      expect((await call("hash2", content.replace("Question", "Revised question"))).rows[0].result).toBe("updated");
      const versions = await db.query<{ revision: number }>("select revision from public.ielts_exam_versions order by revision");
      expect(versions.rows.map((v) => v.revision)).toEqual([1, 2]);
      expect((await db.query<{ version_id: string }>("select version_id from public.ielts_attempts")).rows[0].version_id).toBe(exam.current_version_id);
      expect((await db.query<{ published_version_id: string }>("select published_version_id from public.ielts_exams where id=$1", [exam.id])).rows[0].published_version_id).toBe(exam.current_version_id);
      expect((await db.query<{ score: number; total: number }>("select score,total from public.ielts_attempts where user_id=$1", [user])).rows[0]).toMatchObject({ score: 1, total: 1 });
      await db.exec("set request.jwt.claim.role = 'authenticated'");
      await expect(call("hash3")).rejects.toThrow("Service role required");
    } finally { await db.close(); }
  }, 30000);
});
