import { describe,it,expect } from "vitest";
import { reviewDueAt,reviewIsDue } from "./review";
describe("S6 spaced review dates",()=>{
 it("computes +2/+7/+21 days without browser timezone assumptions",()=>{
  const anchor="2026-11-17T00:00:00.000Z";
  expect(reviewDueAt(anchor,2).toISOString()).toBe("2026-11-19T00:00:00.000Z");
  expect(reviewDueAt(anchor,7).toISOString()).toBe("2026-11-24T00:00:00.000Z");
  expect(reviewDueAt(anchor,21).toISOString()).toBe("2026-12-08T00:00:00.000Z");
 });
 it("rejects invalid anchor and prevents early review",()=>{
  expect(()=>reviewDueAt("not-a-date",2)).toThrow("INVALID_REVIEW_ANCHOR");
  expect(reviewIsDue("2026-11-17T00:00:00Z",2,Date.parse("2026-11-18T23:59:59Z"))).toBe(false);
 });
});
