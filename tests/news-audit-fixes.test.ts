import { describe,expect,it } from "vitest";
import { cardResults } from "../src/lib/news/card-progress";
import { elapsedSeconds,localExamEpoch,recoverExamAnswers,type NewsExamSession } from "../src/lib/news/exam-session";
import { parseQuestionDiagram,sharedMatchingOptions } from "../src/lib/news/question-presentation";
import { parseReadingSections } from "../src/lib/news/reading-sections";
import { nextNewsReads } from "../src/lib/news/daily-plan";
import { inlinePhotoAnchor } from "../src/lib/news/inline-photo-layout";
import { isPublisherBoilerplate } from "../src/lib/news/source-blocks";

describe("Daily News audit regressions",()=>{
  it("excludes publisher spotlights and image credits while retaining factual leads",()=>{
    expect(isPublisherBoilerplate("This post is part of Global Voices’ November 2026 Spotlight series, Justice as infrastructure. You can support our work.")).toBe(true);
    expect(isPublisherBoilerplate("Image credit: NASA/JPL-Caltech/MSSS")).toBe(true);
    expect(isPublisherBoilerplate("Over 223,700 children have dropped out of school in Cameroon’s Northwest and Southwest regions.")).toBe(false);
  });
  it("keeps full and partial outcomes distinct even if attempts arrive out of order",()=>{
    expect(cardResults([
      {article_id:"a",score:9,total:11,submitted_at:"2026-11-20",partial:false},
      {article_id:"a",score:2,total:2,submitted_at:"2026-11-22",partial:true},
      {article_id:"a",score:1,total:11,submitted_at:"2026-11-19",partial:false},
      {article_id:"b",score:3,total:4,submitted_at:"2026-11-21",partial:true},
    ])).toEqual({a:{score:9,total:11,practice:{score:2,total:2}},b:{score:0,total:0,practice:{score:3,total:4}}});
  });
  const question="00000000-0000-4000-8000-000000000001";
  const session:NewsExamSession={id:"session",article_id:"article",started_at:"2026-11-22T00:00:00Z",expires_at:"2026-11-22T00:20:00Z",server_now:"2026-11-22T00:10:00Z",revision:4,question_version:"v1",answers:{[question]:0}};
  it("derives elapsed wall time from a server baseline and recovers after background suspension",()=>{
    const epoch=localExamEpoch(session,9_000_000);
    expect(elapsedSeconds(epoch,9_000_000,1200)).toBe(600);
    expect(elapsedSeconds(epoch,9_700_000,1200)).toBe(1200);
  });
  it("only recovers a valid journal at the same server revision",()=>{
    expect(recoverExamAnswers(session,JSON.stringify({revision:4,answers:{[question]:"new draft"}}))).toEqual({[question]:"new draft"});
    for(const raw of ["{broken",JSON.stringify({revision:3,answers:{[question]:1}}),JSON.stringify({revision:4,answers:{[question]:{bad:1}}}),JSON.stringify({revision:4,answers:{bad:"value"}})])
      expect(recoverExamAnswers(session,raw)).toEqual(session.answers);
  });
  it("requires explicit hidden diagram labels and rejects unrelated or malformed diagram data",()=>{
    expect(parseQuestionDiagram('[DIAGRAM:{"title":"Layers","labels":["outer","______","inner"],"gap":1}] Fill the label.')).toMatchObject({title:"Layers",gap:1,prompt:"Fill the label."});
    expect(parseQuestionDiagram('[DIAGRAM:{"title":"Layers","labels":["outer","answer"],"gap":1}] Fill.')).toBeNull();
    expect(parseQuestionDiagram("An old text-only diagram question ______")).toBeNull();
    expect(sharedMatchingOptions([{options:["A","B"]},{options:["B","A"]}])).toBeNull();
    expect(sharedMatchingOptions([{options:["A","B"]},{options:["A","B"]}])).toEqual(["A","B"]);
  });
  it("keeps section headings ordered and outside passage paragraph indexing",()=>{
    expect(parseReadingSections([{start:0,title:"The project"},{start:4,title:"What changes"}],8)).toHaveLength(2);
    expect(parseReadingSections([{start:0,title:"The project"},{start:0,title:"Duplicate"}],8)).toEqual([]);
    expect(parseReadingSections([{start:8,title:"Beyond the article"}],8)).toEqual([]);
  });
  it("suggests three distinct unread stories with interest, skill and discovery purposes",()=>{
    const articles=[{id:"read",category:"Technology",published_at:"2026-11-23"},{id:"a",category:"Technology",published_at:"2026-11-22"},{id:"b",category:"Education",published_at:"2026-11-21"},{id:"c",category:"Science",published_at:"2026-11-20"}];
    const picks=nextNewsReads(articles,new Set(["read"]),"Technology",[],new Map([["b",["tfng"]]]),"tfng");
    expect(picks.map((item)=>item.id)).toEqual(["a","b","c"]);
    expect(picks.map((item)=>item.recommendationReason)).toEqual(["Gần chủ đề bạn quan tâm","Có dạng câu hỏi bạn cần luyện","Khám phá một chủ đề khác"]);
  });
  it("anchors a photo near its subject and middle reading distance",()=>{
    const paragraphs=Array.from({length:8},(_,i)=>`${"Context background information. ".repeat(20)}${i===3?"Airport terminal construction progress.":"Other information."}`);
    expect(inlinePhotoAnchor(paragraphs,1,"Airport terminal construction")).toBe(3);
    expect(inlinePhotoAnchor(paragraphs.slice(0,3),1,"Airport")).toBe(-1);
  });
});
