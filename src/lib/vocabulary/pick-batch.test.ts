import { describe, expect, it } from "vitest";
import { pickBatch } from "./study-session";

const list = Array.from({ length: 23 }, (_, index) => `w${index}`);
const source = (calls: number[] = []) => async (start: number, size: number) => { calls.push(start); return list.slice(start, start + size); };

describe("pickBatch", () => {
  it("takes the next words from the offset", async () => {
    const result = await pickBatch(0, source(), () => true, { batch: 3, chunk: 5 });
    expect(result).toEqual({ rows: ["w0", "w1", "w2"], next: 3, end: false });
  });

  it("skips studied words and keeps reading chunks until the batch is full", async () => {
    const studied = new Set(["w3", "w4", "w5", "w6"]);
    const calls: number[] = [];
    const result = await pickBatch(3, source(calls), (word) => !studied.has(word), { batch: 3, chunk: 5 });
    expect(result.rows).toEqual(["w7", "w8", "w9"]);
    expect(result.next).toBe(10);
    expect(calls).toEqual([0, 5]);
  });

  it("reports the end of the list", async () => {
    const result = await pickBatch(20, source(), () => true, { batch: 10, chunk: 5 });
    expect(result).toEqual({ rows: ["w20", "w21", "w22"], next: 23, end: true });
  });

  it("returns an empty batch when every remaining word was studied", async () => {
    const result = await pickBatch(0, source(), () => false, { batch: 10, chunk: 5, maxChunks: 10 });
    expect(result.rows).toEqual([]);
    expect(result.end).toBe(true);
  });
});
