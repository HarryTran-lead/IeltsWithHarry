/** Grammar assessment ticket primitives. No environment or database credentials are read here. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { GRAMMAR_TEST_SIZE } from "./gate";
import type { GrammarLevel } from "./types";

export type GrammarAssessmentTicket = {
  userId: string;
  target: GrammarLevel;
  ids: string[];
  expires: number;
};

const demoKey = "local-demo-grammar-assessment-only";
const maxTicketLength = 8192;
const maxTicketLifetime = 30 * 60_000;

/** A dedicated server-only secret is required in live mode; never reuse a database key. */
export function isGrammarSigningKeyValid(configured: string | undefined, demo: boolean): boolean {
  if (demo) return true;
  return Boolean(
    configured &&
      configured.trim() === configured &&
      Buffer.byteLength(configured, "utf8") >= 32 &&
      configured !== demoKey,
  );
}

export function resolveGrammarSigningKey(configured: string | undefined, demo: boolean): string {
  if (demo) return demoKey;
  if (!isGrammarSigningKeyValid(configured, false)) {
    throw new Error("Grammar assessment signing key is not configured or too short");
  }
  return configured!;
}

function signature(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function signGrammarAssessmentTicket(ticket: GrammarAssessmentTicket, key: string): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${signature(payload, key)}`;
}

export function verifyGrammarAssessmentTicket(
  token: string,
  userId: string,
  target: GrammarLevel,
  key: string,
  now = Date.now(),
): GrammarAssessmentTicket | null {
  if (token.length > maxTicketLength) return null;
  const [payload, actual, extra] = token.split(".");
  if (!payload || !actual || extra) return null;
  const expected = signature(payload, key);
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const ticket = value as Partial<GrammarAssessmentTicket>;
    if (ticket.userId !== userId || ticket.target !== target || typeof ticket.expires !== "number" ||
        !Number.isFinite(ticket.expires) || ticket.expires <= now || ticket.expires > now + maxTicketLifetime + 60_000 ||
        !Array.isArray(ticket.ids) || ticket.ids.length !== GRAMMAR_TEST_SIZE ||
        ticket.ids.some((id) => typeof id !== "string" || !id.trim()) ||
        new Set(ticket.ids).size !== GRAMMAR_TEST_SIZE) return null;
    return ticket as GrammarAssessmentTicket;
  } catch {
    return null;
  }
}
