import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { previewDir } from "../data";

const types: Record<string, string> = { ".mp3": "audio/mpeg", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };

/** Local-only file server for the Listening preview: recordings, covers and maps, with byte ranges so audio can seek. */
export function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const dir = previewDir();
  const wanted = new URL(request.url).searchParams.get("f") ?? "";
  const relative = normalize(wanted).replace(/^([/\\])+/, "");
  // Only recordings and the package's student-facing assets; never the answer keys.
  const allowed = /^(audio|audio-placeholder)[/\\][\w.-]+\.mp3$/.test(relative) || /^package[/\\]MOCK_0\d[/\\]assets[/\\][\w./\\-]+\.(webp|png|svg)$/.test(relative);
  if (!dir || !allowed || relative.includes(`..${sep}`) || relative.includes("../")) return new Response("Not found", { status: 404 });
  const file = join(dir, relative);
  if (!existsSync(file)) return new Response("Not found", { status: 404 });
  const size = statSync(file).size;
  const type = types[extname(file)] ?? "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  const bytes = readFileSync(file);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    return new Response(bytes.subarray(start, end + 1), { status: 206, headers: { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(bytes, { headers: { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": String(size), "Cache-Control": "no-store" } });
}
