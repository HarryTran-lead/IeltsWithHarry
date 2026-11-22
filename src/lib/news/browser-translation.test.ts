import { afterEach, describe, expect, it, vi } from "vitest";
import { translateEnglishToVietnamese } from "./browser-translation";

afterEach(() => vi.unstubAllGlobals());

describe("news translation fallback", () => {
  it("batches paragraphs and keeps translations aligned with their source", async () => {
    const requests: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const texts = (JSON.parse(String(init.body)) as { texts: string[] }).texts;
      requests.push(texts);
      return { ok: true, json: async () => ({ translations: texts.map((text) => `VI:${text}`) }) };
    }));
    const progress: number[] = [];
    const translated: [number, string][] = [];
    const result = await translateEnglishToVietnamese(["First paragraph.", "Second paragraph.", ""], (done) => progress.push(done), (index, value) => translated.push([index, value]));
    expect(requests).toEqual([["First paragraph.", "Second paragraph."]]);
    expect(result).toEqual(["VI:First paragraph.", "VI:Second paragraph.", ""]);
    expect(progress.at(-1)).toBe(3);
    expect(translated).toContainEqual([1, "VI:Second paragraph."]);
  });
  it("reuses a successful result without sending the same text again", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ translations: ["Bản dịch"] }) }));
    vi.stubGlobal("fetch", fetcher);
    expect(await translateEnglishToVietnamese(["A unique sentence for cache."])).toEqual(["Bản dịch"]);
    expect(await translateEnglishToVietnamese(["A unique sentence for cache."])).toEqual(["Bản dịch"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains a completed paragraph when a larger request and a later paragraph fail",async()=>{
    let fail=true;
    const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
      const {texts}=JSON.parse(String(init.body)) as {texts:string[]};
      if(texts.length>1||fail&&texts[0]==="Later unique paragraph.")return {ok:false,status:502,json:async()=>({error:"Unavailable"})};
      return {ok:true,status:200,json:async()=>({translations:texts.map((value)=>`VI:${value}`)})};
    });
    vi.stubGlobal("fetch",fetcher);
    const done:[number,string][]=[];
    await expect(translateEnglishToVietnamese(["Completed unique paragraph.","Later unique paragraph."],undefined,(index,value)=>done.push([index,value]))).rejects.toThrow("Unavailable");
    expect(done).toEqual([[0,"VI:Completed unique paragraph."]]);
    fail=false;fetcher.mockClear();
    expect(await translateEnglishToVietnamese(["Completed unique paragraph.","Later unique paragraph."])).toEqual(["VI:Completed unique paragraph.","VI:Later unique paragraph."]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body)).texts).toEqual(["Later unique paragraph."]);
  });
});
