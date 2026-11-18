import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MapSpec, ProcessSpec } from "@/lib/writing-task1/types";
import { Task1Figure } from "./task1-figure";

const linear: ProcessSpec = {
  kind: "process", title: "Making tea", process_type: "linear",
  stages: ["Pick the leaves", "Wither the leaves", "Roll and crush", "Dry in hot air", "Sort by size", "Pack and ship"].map((label_en, index) => ({ id: `s${index + 1}`, label_en })),
  edges: [1, 2, 3, 4, 5].map((index) => ({ from: `s${index}`, to: `s${index + 1}` })),
};
const cycle: ProcessSpec = {
  kind: "process", title: "Life cycle of a frog", process_type: "cycle",
  stages: ["Eggs", "Tadpole", "Tadpole with legs", "Young frog", "Adult frog"].map((label_en, index) => ({ id: `s${index + 1}`, label_en })),
  edges: [1, 2, 3, 4, 5].map((index) => ({ from: `s${index}`, to: `s${(index % 5) + 1}` })),
};
const map: MapSpec = {
  kind: "map", title: "Riverside, 2000 and now", compass: true,
  panels: [
    { label: "2000", features: [{ id: "f1", name: "Farmland", type: "farmland", x: 0, y: 0, w: 6, h: 5 }, { id: "f2", name: "River", type: "water", x: 0, y: 8, w: 12, h: 2 }] },
    { label: "Now", features: [{ id: "f3", name: "Housing", type: "housing", x: 0, y: 0, w: 6, h: 5 }, { id: "f2", name: "River", type: "water", x: 0, y: 8, w: 12, h: 2 }] },
  ],
};

describe("Task 1 figures drawn from data", () => {
  it("draws every process stage with a number and every arrow with a head", () => {
    for (const spec of [linear, cycle]) {
      const html = renderToStaticMarkup(<Task1Figure visual={{ type: "chart", spec }}/>);
      expect(html.match(/class="t1-process-box"/g)).toHaveLength(spec.stages.length);
      expect(html.match(/marker-end="url\(#t1-arrow-[\w-]+\)"/g)).toHaveLength(spec.edges.length);
      for (const stage of spec.stages) expect(html).toContain(stage.label_en.split(" ")[0]);
      expect(html).not.toContain("NaN");
    }
  });

  it("draws a map panel per date with its features and a compass", () => {
    const html = renderToStaticMarkup(<Task1Figure visual={{ type: "chart", spec: map }}/>);
    expect(html.match(/<figure class="t1-map"/g)).toHaveLength(2);
    expect(html).toContain("Farmland");
    expect(html).toContain("Housing");
    expect(html).toContain("t1-compass");
    expect(html).not.toContain("NaN");
  });
});
