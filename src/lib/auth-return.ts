/** Only learner routes may be used as a post-login destination. */
export function studentReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!(pathname === "/app" || pathname.startsWith("/app/"))) return null;
  if (pathname.includes("\\") || pathname.includes("//") || /%2e|%2f|%5c/i.test(pathname) || /(^|\/)\.\.?($|\/)/.test(pathname)) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}
