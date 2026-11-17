import { createHash } from "node:crypto";
import type { bankClient } from "@/lib/ielts-bank/server";
import { S6_MAX_AUDIO_BYTES, normalizedAudioMime, type S6AudioMime } from "./recording-policy";

const BUCKET = "speaking-s6-recordings";
const MIN_BYTES = 256;
type Storage = ReturnType<typeof bankClient>["storage"];

export type S6StoredAudioFingerprint = {
  audio_evidence_state: "stored_hash_recorded";
  audio_evidence_sha256: string;
  audio_evidence_bytes: number;
  audio_evidence_mime: S6AudioMime;
  audio_evidence_at: string;
};

export class S6AudioEvidenceError extends Error {
  constructor(public readonly code:
    "AUDIO_UPLOAD_REQUIRED" | "AUDIO_FILE_AMBIGUOUS" |
    "AUDIO_INVALID_FORMAT" | "AUDIO_TOO_LARGE" | "AUDIO_STORAGE_UNAVAILABLE") {
    super(code);
  }
}

function signatureMatches(kind: S6AudioMime, bytes: Uint8Array): boolean {
  if (kind === "audio/webm") {
    return bytes.length >= 4 &&
      bytes[0] === 0x1a && bytes[1] === 0x45 &&
      bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (kind === "audio/ogg") {
    return bytes.length >= 4 && bytes[0] === 0x4f &&
      bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
  }
  return bytes.length >= 12 && bytes[4] === 0x66 &&
    bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

/** This verifies stored bytes + hash only. It never claims speech, duration or IELTS band accuracy. */
export async function fingerprintS6StoredAudio(
  storage: Storage,
  userId: string,
  attemptId: string
): Promise<S6StoredAudioFingerprint> {
  const bucket = storage.from(BUCKET);
  const listed = await bucket.list(userId, { search: attemptId, limit: 100 });
  if (listed.error || !listed.data) throw new S6AudioEvidenceError("AUDIO_STORAGE_UNAVAILABLE");

  const candidates = listed.data.filter(item =>
    ["webm","mp4","ogg"].some(ext => item.name === attemptId + "." + ext)
  );
  if (candidates.length === 0) throw new S6AudioEvidenceError("AUDIO_UPLOAD_REQUIRED");
  if (candidates.length !== 1) throw new S6AudioEvidenceError("AUDIO_FILE_AMBIGUOUS");

  const file = candidates[0];
  const kind = normalizedAudioMime("audio/" + file.name.split(".").at(-1));
  if (!kind) throw new S6AudioEvidenceError("AUDIO_INVALID_FORMAT");
  const meta = file.metadata as {size?: unknown; mimetype?: unknown} | null;
  if (meta?.size !== undefined && (typeof meta.size !== "number" ||
      !Number.isSafeInteger(meta.size) ||
      meta.size < MIN_BYTES || meta.size > S6_MAX_AUDIO_BYTES)) {
    throw new S6AudioEvidenceError("AUDIO_TOO_LARGE");
  }
  if (typeof meta?.mimetype === "string" &&
      normalizedAudioMime(meta.mimetype) !== kind) {
    throw new S6AudioEvidenceError("AUDIO_INVALID_FORMAT");
  }
  const downloaded = await bucket.download(userId + "/" + file.name);
  if (downloaded.error || !downloaded.data) {
    throw new S6AudioEvidenceError("AUDIO_STORAGE_UNAVAILABLE");
  }
  if (downloaded.data.size < MIN_BYTES || downloaded.data.size > S6_MAX_AUDIO_BYTES) {
    throw new S6AudioEvidenceError("AUDIO_TOO_LARGE");
  }
  const buffer = await downloaded.data.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!signatureMatches(kind, bytes)) {
    throw new S6AudioEvidenceError("AUDIO_INVALID_FORMAT");
  }
  return {
    audio_evidence_state: "stored_hash_recorded",
    audio_evidence_sha256: createHash("sha256").update(bytes).digest("hex"),
    audio_evidence_bytes: bytes.byteLength,
    audio_evidence_mime: kind,
    audio_evidence_at: new Date().toISOString()
  };
}
