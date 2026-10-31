import { z } from "zod";

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const IMAGE_BUCKET = "smart-notebook-images";
export const covers = ["teal", "blue", "lavender", "coral", "sand"] as const;
export const papers = ["blank", "ruled", "grid"] as const;
export type Cover = (typeof covers)[number];
export type Paper = (typeof papers)[number];

export type Book = {
  id: string; user_id: string; title: string; description: string; cover: Cover; folder: string;
  favorite: boolean; deleted_at: string | null; opened_at: string | null;
  created_at: string; updated_at: string;
};
export type Point = { x: number; y: number; pressure?: number };
export type Stroke = { id: string; tool: "pen" | "marker"; color: string; width: number; points: Point[] };
export type TextElement = { id: string; type: "text"; x: number; y: number; width: number; height: number; html: string; sourceId?: string };
export type ImageElement = { id: string; type: "image"; x: number; y: number; width: number; height: number; path: string };
export type NotebookElement = TextElement | ImageElement;
export type PageDocument = { schemaVersion: 1; elements: NotebookElement[]; strokes: Stroke[] };
export type Page = {
  id: string; notebook_id: string; user_id: string; position: number; paper: Paper;
  document: PageDocument; revision: number; created_at: string; updated_at: string;
};
export const emptyDocument = (): PageDocument => ({ schemaVersion: 1, elements: [], strokes: [] });

const finite = z.number().finite();
const box = { id: z.uuid(), x: finite.min(0).max(PAGE_WIDTH), y: finite.min(0).max(PAGE_HEIGHT), width: finite.min(30).max(PAGE_WIDTH), height: finite.min(20).max(PAGE_HEIGHT) };
export const documentSchema = z.object({
  schemaVersion: z.literal(1),
  elements: z.array(z.discriminatedUnion("type", [
    z.object({ ...box, type: z.literal("text"), html: z.string().max(50000), sourceId: z.uuid().optional() }),
    z.object({ ...box, type: z.literal("image"), path: z.string().max(250) }),
  ])).max(200),
  strokes: z.array(z.object({ id: z.uuid(), tool: z.enum(["pen", "marker"]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: finite.min(1).max(30), points: z.array(z.object({ x: finite.min(0).max(PAGE_WIDTH), y: finite.min(0).max(PAGE_HEIGHT), pressure: finite.min(0).max(1).optional() })).min(1).max(10000) })).max(3000),
});

const allowedTags = new Set(["P", "BR", "DIV", "H1", "H2", "H3", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "A", "TABLE", "TBODY", "THEAD", "TR", "TH", "TD", "BLOCKQUOTE"]);
/** Normalize clipboard/editor HTML to a small text-only tag set. Images are separate private assets. */
export function sanitizeTextHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const source = new DOMParser().parseFromString(html, "text/html");
  const safe = document.createElement("div");
  function copy(parent: Node, target: Node) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(node.textContent ?? "")); continue; }
      if (!(node instanceof Element)) continue;
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH", "FORM"].includes(node.tagName)) continue;
      if (!allowedTags.has(node.tagName)) { copy(node, target); continue; }
      const element = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "A") {
        const href = node.getAttribute("href") ?? "";
        try { const url = new URL(href); if (["https:", "http:"].includes(url.protocol)) { element.setAttribute("href", url.href); element.setAttribute("rel", "noopener noreferrer"); element.setAttribute("target", "_blank"); } }
        catch { /* Ignore relative and unsafe links. */ }
      }
      copy(node, element); target.appendChild(element);
    }
  }
  copy(source.body, safe);
  return safe.innerHTML.slice(0, 50000);
}

export function draftKey(userId: string, pageId: string) { return `${userId}:${pageId}`; }
export type LocalDraft = { key: string; baseRevision: number; document: PageDocument; paper: Paper };
const DB_NAME = "ielts-smart-notebook-v1";
function drafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await drafts();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const request = action(tx.objectStore("drafts"));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export const readDraft = (key: string) => transaction<LocalDraft | undefined>("readonly", (store) => store.get(key));
const pending = new Map<string, Promise<unknown>>();
function ordered<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  pending.set(key, next);
  void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => undefined);
  return next;
}
export const writeDraft = (draft: LocalDraft) => ordered(draft.key, () => transaction<IDBValidKey>("readwrite", (store) => store.put(draft)));
export const clearDraft = (key: string) => ordered(key, () => transaction<undefined>("readwrite", (store) => store.delete(key)));
