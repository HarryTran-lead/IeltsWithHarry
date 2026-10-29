import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
try {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function public.is_admin() returns boolean language sql stable as $$ select false $$;
  `);
  for (const name of [
    "202610290009_reading_vocabulary.sql",
    "202610290010_reading_vocabulary_seed.sql",
  ]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  const { rows } = await db.query(`
    select
      (select count(*) from public.reading_vocabulary_entries) as words,
      (select count(*) from public.reading_vocabulary_plan_days) as days,
      (select count(distinct id) from public.reading_vocabulary_entries) as unique_words,
      (select sum(cardinality(new_vocabulary_ids)) from public.reading_vocabulary_plan_days) as planned_words
  `);
  const row = rows[0];
  if (Number(row.words) !== 607 || Number(row.days) !== 84 || Number(row.unique_words) !== 607 || Number(row.planned_words) !== 607) {
    throw new Error(`Unexpected Reading data counts: ${JSON.stringify(row)}`);
  }
  console.log("Reading vocabulary migration passes: 607 distinct words, 84 days, 607 planned placements.");
} finally {
  await db.close();
}
