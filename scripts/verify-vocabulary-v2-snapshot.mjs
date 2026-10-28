// Verify a private Vocabulary logical snapshot by loading it into local PGlite.
// This verifies rows, keys and internal Vocabulary links, not a full DB restore.
// Usage: node scripts/verify-vocabulary-v2-snapshot.mjs PATH_TO_SNAPSHOT_ZIP
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { strFromU8, unzipSync } from "fflate";

const path = process.argv[2];
if (!path) throw new Error("Pass a private snapshot ZIP path");
const files = unzipSync(readFileSync(path));
const manifest = JSON.parse(strFromU8(files["manifest.json"]));
assert.equal(manifest.snapshot_kind, "PRIVATE_LOGICAL_VOCABULARY_ROWS_NOT_FULL_DATABASE_BACKUP");

const keyByTable = {
  vocabulary_bank_entries: (row) => row.source_id,
  vocabulary_entries: (row) => row.id,
  notebook_entries: (row) => row.id,
  user_word_reviews: (row) => `${row.user_id}/${row.notebook_entry_id}`,
  vocabulary_review_events: (row) => row.id,
  vocabulary_practice_attempts: (row) => row.id,
  vocabulary_decks: (row) => row.id,
  vocabulary_deck_cards: (row) => `${row.deck_id}/${row.notebook_entry_id}`,
  study_tasks_vocabulary_review: (row) => row.id,
};
const rowsByTable = {};
for (const [table, metadata] of Object.entries(manifest.tables)) {
  const bytes = files[`${table}.json`];
  assert.ok(bytes, `Missing ${table}.json`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), metadata.sha256, `${table} checksum`);
  const rows = JSON.parse(strFromU8(bytes));
  assert.equal(rows.length, metadata.rows, `${table} row count`);
  assert.ok(keyByTable[table], `Unknown table ${table}`);
  rowsByTable[table] = rows;
}

const notebookIds = new Set(rowsByTable.notebook_entries.map((row) => row.id));
const deckIds = new Set(rowsByTable.vocabulary_decks.map((row) => row.id));
for (const table of ["user_word_reviews", "vocabulary_review_events", "vocabulary_deck_cards"]) {
  for (const row of rowsByTable[table]) {
    assert.ok(notebookIds.has(row.notebook_entry_id), `${table} has missing notebook entry`);
  }
}
for (const row of rowsByTable.vocabulary_deck_cards) {
  assert.ok(deckIds.has(row.deck_id), "Deck card has missing deck");
}

const db = new PGlite();
await db.exec("create table snapshot_rows (table_name text not null, source_key text not null, payload jsonb not null, primary key(table_name, source_key))");
for (const [table, rows] of Object.entries(rowsByTable)) {
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const values = batch.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3}::jsonb)`).join(",");
    const params = batch.flatMap((row) => [table, keyByTable[table](row), JSON.stringify(row)]);
    await db.query(`insert into snapshot_rows(table_name, source_key, payload) values ${values}`, params);
  }
  const result = await db.query("select count(*)::integer as n from snapshot_rows where table_name = $1", [table]);
  assert.equal(result.rows[0].n, rows.length, `${table} local restore count`);
  const restored = await db.query("select source_key, payload from snapshot_rows where table_name = $1", [table]);
  const originalByKey = new Map(rows.map((row) => [keyByTable[table](row), row]));
  for (const item of restored.rows) {
    assert.deepEqual(item.payload, originalByKey.get(item.source_key), `${table} payload roundtrip`);
  }
}
const counts = Object.fromEntries(Object.entries(rowsByTable).map(([table, rows]) => [table, rows.length]));
await db.close();
console.log(JSON.stringify({ status: "PASS", environment: manifest.environment, project_ref: manifest.project_ref, counts }));
