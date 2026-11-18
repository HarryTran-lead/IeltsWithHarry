import { expect, it } from "vitest";
import { assertPublishRightsEvidence, type RightsEvidence } from "../src/lib/content-rights";

const text: RightsEvidence = {
  asset_kind: "text", asset_url: null, author_name: "Editor A", rights_holder: "IeltsWithHarry",
  permission_document_ref: "rights-evidence/editor-a.txt", permission_scope: "Publication on this website, commercial use, and translation",
  web_publication_allowed: true, commercial_use_allowed: true, modification_translation_allowed: true,
  source_package_name: "owner-original.zip", source_package_sha256: "a".repeat(64),
};

it("requires recorded rights for every audio and image asset", () => {
  expect(() => assertPublishRightsEvidence([text], [{ kind: "audio", url: "https://example.com/recording.mp3" }])).toThrow("audio rights evidence");
  const audio = { ...text, asset_kind: "audio" as const, asset_url: "https://example.com/recording.mp3" };
  expect(() => assertPublishRightsEvidence([text, audio], [{ kind: "audio", url: audio.asset_url }])).not.toThrow();
});

it("rejects an unsupported commercial or adaptation scope", () => {
  expect(() => assertPublishRightsEvidence([{ ...text, commercial_use_allowed: false }])).toThrow("text rights evidence");
  expect(() => assertPublishRightsEvidence([{ ...text, modification_translation_allowed: false }])).toThrow("text rights evidence");
});

it("accepts an original fact dossier for text but still requires image rights", () => {
  expect(() => assertPublishRightsEvidence([], [], true)).not.toThrow();
  expect(() => assertPublishRightsEvidence([], [{ kind: "image", url: "https://example.com/photo.jpg" }], true)).toThrow("image rights evidence");
});
