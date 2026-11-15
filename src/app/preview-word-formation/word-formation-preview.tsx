"use client";

import { WordFormationPage } from "@/features/vocabulary/word-formation-page";
import { previewFamilies } from "./fixture";

/** Stands in for the app header so the one-screen board can be judged at real heights. */
export function WordFormationPreview() {
  return <div style={{ minHeight: "100dvh", background: "#f3f8fa" }}>
    <div style={{ height: "var(--app-header-height, 64px)", background: "linear-gradient(90deg,#cfe9f5,#e8f6fb)", borderBottom: "1px solid #d6e6eb" }} />
    <div className="main-area" style={{ padding: "4px 12px 8px" }}><WordFormationPage fixture={previewFamilies} /></div>
  </div>;
}
