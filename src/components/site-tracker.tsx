"use client";
/*
 * Records page views and sign-ins for the admin analytics page. Writes go straight from the browser to
 * Supabase (track_site_event), so tracking costs no Vercel function time. Only a random visitor id,
 * a 30-minute session id, the path without its query, a device class and the referring host are sent.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { liveMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";

const STORE = "iwh.analytics";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SKIP = /^\/(admin|api|preview-)/;
type Ids = { visitor: string; session: string; last: number; user?: string; fresh?: boolean };

function readIds(): Ids {
  const now = Date.now();
  let ids: Partial<Ids> = {};
  try { ids = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Ids>; } catch { /* storage blocked: ids live for this page only */ }
  const fresh = !ids.session || !ids.last || now - ids.last > SESSION_IDLE_MS;
  const next: Ids = { visitor: ids.visitor ?? crypto.randomUUID(), session: fresh ? crypto.randomUUID() : ids.session!, last: now, user: ids.user, fresh };
  writeIds(next);
  return next;
}
function writeIds(ids: Ids) {
  try { localStorage.setItem(STORE, JSON.stringify({ visitor: ids.visitor, session: ids.session, last: ids.last, user: ids.user })); } catch { /* ignore */ }
}
function device() {
  const width = Math.min(window.innerWidth, window.screen?.width || window.innerWidth);
  return width < 768 ? "mobile" : width < 1100 ? "tablet" : "desktop";
}
function externalReferrer() {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host && host !== location.hostname ? host.replace(/^www\./, "") : null;
  } catch { return null; }
}
function send(kind: "page_view" | "sign_in", path: string, ids: Ids, extra: { referrer?: string | null; method?: string | null } = {}) {
  void createClient().rpc("track_site_event", {
    p_kind: kind, p_path: path, p_visitor: ids.visitor, p_session: ids.session, p_device: device(),
    p_referrer: extra.referrer ?? null, p_method: extra.method ?? null,
  }).then(() => undefined, () => undefined);
}

export function SiteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!liveMode || !pathname || SKIP.test(pathname) || navigator.webdriver) return;
    const timer = window.setTimeout(() => {
      const ids = readIds();
      send("page_view", pathname, ids, { referrer: ids.fresh ? externalReferrer() : null });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!liveMode || navigator.webdriver) return;
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      const ids = readIds();
      if (event === "SIGNED_OUT") { writeIds({ ...ids, user: undefined }); return; }
      const user = session?.user;
      if (!user || ids.user === user.id) return;
      // Count a sign-in only when it just happened, not when a remembered session reloads the page.
      const signedInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
      if (Date.now() - signedInAt < 10 * 60 * 1000) {
        const provider = String(user.app_metadata?.provider ?? "");
        send("sign_in", "/login", ids, { method: ["email", "google", "phone"].includes(provider) ? provider : "unknown" });
      }
      writeIds({ ...ids, user: user.id });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
