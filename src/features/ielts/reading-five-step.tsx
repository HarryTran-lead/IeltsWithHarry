"use client";

import { useState } from "react";
import type { FiveStep } from "@/lib/ielts-bank/schema";

type Lang = "vi" | "en";
const titles: Record<Lang, string[]> = {
  vi: ["Hiểu câu hỏi", "Từ loại & ngữ pháp", "Nhận diện paraphrase", "Đối chiếu dẫn chứng", "Kết luận đáp án"],
  en: ["Understand the question", "Word class & grammar", "Spot the paraphrase", "Check the evidence", "Final answer"],
};
const roles: Record<string, [string, string]> = {
  supports: ["Xác nhận", "Supports"],
  contradicts: ["Mâu thuẫn", "Contradicts"],
  main_idea: ["Ý chính", "Main idea"],
  context_only: ["Ngữ cảnh", "Context"],
};

/** "P2-C" → "Đoạn C" / "Paragraph C". */
const paragraphName = (id: string, lang: Lang) => {
  const letter = id.split("-").at(-1);
  return letter ? `${lang === "vi" ? "Đoạn" : "Paragraph"} ${letter}` : "";
};

/**
 * A worked explanation in five steps, as a teacher would talk it through:
 * what the question asks, the grammar that decides it, how the passage
 * rephrases it, the lines that prove it, and the answer with its usual trap.
 */
export function FiveStepView({ steps }: { steps: FiveStep }) {
  const [lang, setLang] = useState<Lang>("vi");
  const pick = (block: { en: string; vi: string }) => (lang === "vi" ? block.vi || block.en : block.en || block.vi);
  const trap = lang === "vi" ? steps.final.trapVi || steps.final.trapEn : steps.final.trapEn || steps.final.trapVi;
  const tip = lang === "vi" ? steps.final.tipVi || steps.final.tipEn : steps.final.tipEn || steps.final.tipVi;
  const name = titles[lang];
  return <div className="br-five">
    <header>
      <b>{lang === "vi" ? "Giải thích 5 bước" : "Five-step explanation"}</b>
      <div className="br-five-lang" role="group" aria-label="Ngôn ngữ lời giải">
        <button type="button" aria-pressed={lang === "vi"} onClick={() => setLang("vi")}>Tiếng Việt</button>
        <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
      </div>
    </header>
    <ol>
      <li><span>1</span><div><h4>{name[0]}</h4><p>{pick(steps.understand)}</p></div></li>
      <li><span>2</span><div><h4>{name[1]}</h4><p>{pick(steps.wordClass)}</p></div></li>
      <li><span>3</span><div><h4>{name[2]}</h4><p>{pick(steps.paraphrase)}</p>
        {steps.paraphrase.pairs.length > 0 && <ul className="br-five-pairs">{steps.paraphrase.pairs.map((pair, index) => <li key={index}><q>{pair.question}</q><i aria-label="tương ứng với">≈</i><q>{pair.passage}</q></li>)}</ul>}
      </div></li>
      <li><span>4</span><div><h4>{name[3]}</h4><p>{pick(steps.evidence)}</p>
        {steps.evidence.quotes.map((quote, index) => <blockquote key={index} className={`is-${quote.role}`}>
          <small>{paragraphName(quote.paragraph, lang)}{roles[quote.role] ? ` · ${roles[quote.role][lang === "vi" ? 0 : 1]}` : ""}</small>
          “{quote.quote}”
        </blockquote>)}
      </div></li>
      <li><span>5</span><div><h4>{name[4]}</h4>
        <p className="br-five-answer">{lang === "vi" ? "Đáp án" : "Answer"}: <b>{steps.final.answer}</b></p>
        <p>{pick(steps.final)}</p>
        {trap && <p className="br-five-note is-trap"><b>{lang === "vi" ? "Bẫy thường gặp" : "Common trap"}</b>{trap}</p>}
        {tip && <p className="br-five-note is-tip"><b>{lang === "vi" ? "Mẹo áp dụng" : "Transfer tip"}</b>{tip}</p>}
      </div></li>
    </ol>
  </div>;
}

/** The quote to light up in the passage: a verbatim line that supports (or settles) the answer. */
export function fiveStepEvidence(steps: FiveStep | undefined) {
  const quotes = steps?.evidence.quotes.filter((quote) => quote.exact) ?? [];
  const best = quotes.find((quote) => quote.role === "supports") ?? quotes.find((quote) => quote.role !== "context_only") ?? quotes[0];
  return best ? { quote: best.quote, paragraph: best.paragraph } : null;
}
