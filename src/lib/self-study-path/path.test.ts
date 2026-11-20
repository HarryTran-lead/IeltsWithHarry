import { describe, expect, it } from "vitest";
import { bandSpan, buildPath, type PathCourse } from "./path";

const course: PathCourse = {
  lab: "demo", name: "Demo", base: "/x", steps: ["a", "b", "c", "d", "e"],
  stages: [
    { id: "s1", title: "One", lessons: [{ id: "a", title: "A", href: "/a" }, { id: "b", title: "B", href: "/b" }], review: { href: "/r1" }, checkpoint: { title: "Check 1", href: "/c1" } },
    { id: "s2", title: "Two", lessons: [{ id: "c", title: "C", href: "/c" }, { id: "d", title: "D", href: "/d" }] },
    { id: "s3", title: "Three", lessons: [{ id: "e", title: "E", href: "/e" }] },
  ],
};

const statuses = (view: ReturnType<typeof buildPath>, stage: number) => view.stages[stage].nodes.map((node) => `${node.kind[0]}:${node.status}`);

describe("buildPath", () => {
  it("opens only the first lesson for a new learner", () => {
    const view = buildPath(course, { lessons: {}, checkpoints: {} });
    expect(statuses(view, 0)).toEqual(["l:current", "l:locked", "r:locked", "c:locked"]);
    expect(view.stages.map((stage) => stage.status)).toEqual(["current", "locked", "locked"]);
    expect(view.next?.node.id).toBe("a");
    expect(view.stages[1].nodes[0].href).toBeUndefined();
  });

  it("asks for the end-of-stage check once every lesson is done, and opens review when there are mistakes", () => {
    const view = buildPath(course, { lessons: { a: { done: true }, b: { done: true, mistakes: 2 } }, checkpoints: { s1: 0.5 } });
    expect(statuses(view, 0)).toEqual(["l:done", "l:done", "r:open", "c:current"]);
    expect(view.next?.node.kind).toBe("checkpoint");
    expect(view.stages[1].status).toBe("locked");
    expect(view.mistakes).toBe(2);
  });

  it("opens the next stage at the pass mark, and a stage without a check opens the next one when its lessons are done", () => {
    const view = buildPath(course, { lessons: { a: { done: true }, b: { done: true }, c: { done: true }, d: { done: true } }, checkpoints: { s1: 0.7 } });
    expect(view.stages.map((stage) => stage.status)).toEqual(["done", "done", "current"]);
    expect(view.next?.node.id).toBe("e");
    expect(view.done).toBe(4);
    expect(view.total).toBe(5);
  });

  it("keeps a later stage open when the learner already worked in it, but the next step stays in order", () => {
    const view = buildPath(course, { lessons: { e: { done: true } }, checkpoints: {} });
    expect(view.stages.map((stage) => stage.status)).toEqual(["current", "locked", "done"]);
    expect(view.stages[2].nodes[0].status).toBe("done");
    expect(view.next?.node.id).toBe("a");
    expect(view.done).toBe(1);
  });

  it("shows review only for stages that have it, and leaves unnumbered guides out of the count", () => {
    const guided: PathCourse = { ...course, stages: [{ ...course.stages[1], lessons: [{ id: "g", title: "Guide", href: "/g", unnumbered: true }, ...course.stages[1].lessons] }] };
    const view = buildPath(guided, { lessons: { g: { done: true } }, checkpoints: {} });
    expect(view.stages[0].nodes.map((node) => node.kind)).toEqual(["lesson", "lesson", "lesson"]);
    expect(view.stages[0].nodes.map((node) => node.number)).toEqual([undefined, 1, 2]);
    expect(view.next?.node.id).toBe("c");
    expect([view.done, view.total]).toEqual([0, 2]);
  });

  it("starts from the stage the learner picked, keeping earlier stages open", () => {
    const view = buildPath(course, { lessons: {}, checkpoints: {}, startAt: "s2" });
    expect(view.stages.map((stage) => stage.status)).toEqual(["current", "current", "locked"]);
    expect(view.next?.node.id).toBe("c");
    const later = buildPath(course, { lessons: { c: { done: true }, d: { done: true } }, checkpoints: {}, startAt: "s2" });
    expect(later.next?.node.id).toBe("e");
    const back = buildPath(course, { lessons: { c: { done: true }, d: { done: true }, e: { done: true } }, checkpoints: {}, startAt: "s2" });
    expect(back.next?.node.id).toBe("a");
  });

  it("returns no next step when the course is finished", () => {
    const lessons = Object.fromEntries(["a", "b", "c", "d", "e"].map((id) => [id, { done: true }]));
    expect(buildPath(course, { lessons, checkpoints: { s1: 1 } }).next).toBeNull();
  });
});

describe("bandSpan", () => {
  it("merges band ranges", () => {
    expect(bandSpan(["1.0–4.0", "3.0–5.0"])).toBe("1.0–5.0");
    expect(bandSpan(["6.5", undefined, "x"])).toBe("6.5");
    expect(bandSpan([])).toBe("");
  });
});
