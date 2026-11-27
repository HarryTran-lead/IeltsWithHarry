/**
 * Phase 2 Grammar Data Sanitization Pipeline.
 * Cleans leaked internal rule codes, snake_case identifiers, unfilled {team} placeholders,
 * mismatched "vị trí trống" rationales on non-blank items, duplicate/echoed theory examples,
 * boilerplate learning objectives, ungrammatical M08 contrast audio pairs, and M26 punctuation glitches.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function cleanRationaleString(str, hasBlank) {
  if (typeof str !== "string" || !str) return str;
  let out = str;
  // 1. Strip raw C2/level rule prefixes like "Mã lỗi: C2-01-R01. " or "Cần ôn C2-20-R06: "
  out = out.replace(/^Mã lỗi:\s*[A-C][12]-\d{2}-R\d+\.\s*/i, "");
  out = out.replace(/^Cần ôn\s+[A-C][12]-\d{2}-R\d+:\s*/i, "Lưu ý: ");
  out = out.replace(/\b[A-C][12]-\d{2}-R\d+\b:\s*/g, "");

  // 2. Strip raw snake_case internal rule identifiers in B2/C1 like "Kiểm tra quy tắc mixed_past_present: "
  out = out.replace(/^Kiểm tra quy tắc\s+[a-z0-9_]+:\s*/i, "Quy tắc cần nhớ: ");
  out = out.replace(/\bquy tắc\s+[a-z]+_[a-z0-9_]+\b/gi, "quy tắc của bài");

  // 3. Strip prompt-echo bug in A1 (" Câu phù hợp: «Choose the grammatically correct sentence.».")
  out = out.replace(/\s*Câu phù hợp:\s*«(?:Choose the|Which sentence)[^»]+»\.?/g, "");

  // 4. Fix "vị trí trống" template mismatch on whole-sentence choice questions without blanks
  if (!hasBlank && out.includes("vị trí trống")) {
    out = out
      .replace(/Ở đây vị trí trống làm chủ ngữ/g, "Ở đây từ đứng đầu mệnh đề cần làm chủ ngữ")
      .replace(/Ở đây vị trí trống làm/g, "Ở đây thành phần cần chọn làm")
      .replace(/không khớp vị trí trống và yêu cầu của mẫu/g, "không khớp cấu trúc ngữ pháp của câu")
      .replace(/vị trí trống/g, "cấu trúc câu");
  }

  return out.trim();
}

const stats = {
  teamPlaceholdersFixed: 0,
  rationaleFieldsCleaned: 0,
  boilerplateObjectivesFixed: 0,
  c207Disambiguated: 0,
  m08ContrastsFixed: 0,
  m26Fixed: 0,
};

for (const lvl of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
  const filePath = path.join(root, "src/data/grammar-editorial", `${lvl}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  for (const [code, bundle] of Object.entries(data)) {
    const lesson = bundle.lesson;

    // Clean boilerplate learning_objectives in A2 / B2
    for (const listKey of ["learning_objectives"]) {
      if (Array.isArray(lesson[listKey])) {
        lesson[listKey] = lesson[listKey].map((line) => {
          if (/Vượt qua bài Mastery mới và ôn lại qua Spaced Review/i.test(line)) {
            stats.boilerplateObjectivesFixed++;
            return `Vận dụng chính xác cấu trúc ${lesson.title || code} vào giao tiếp và câu viết hoàn chỉnh.`;
          }
          if (/Ứng dụng kiến thức sang Mastery và Spaced Review mà không phụ thuộc vào câu Guided/i.test(line)) {
            stats.boilerplateObjectivesFixed++;
            return `Vận dụng linh hoạt ${lesson.title || code} trong bài viết và nói học thuật (IELTS Writing & Speaking).`;
          }
          return line;
        });
      }
    }
    if (lesson.learn && Array.isArray(lesson.learn.objectives_vi)) {
      lesson.learn.objectives_vi = lesson.learn.objectives_vi.map((line) => {
        if (/Vượt qua bài Mastery mới và ôn lại qua Spaced Review/i.test(line)) {
          stats.boilerplateObjectivesFixed++;
          return `Vận dụng chính xác cấu trúc ${lesson.learn.title || lesson.title || code} vào giao tiếp và câu viết hoàn chỉnh.`;
        }
        if (/Ứng dụng kiến thức sang Mastery và Spaced Review mà không phụ thuộc vào câu Guided/i.test(line)) {
          stats.boilerplateObjectivesFixed++;
          return `Vận dụng linh hoạt ${lesson.learn.title || lesson.title || code} trong bài viết và nói học thuật.`;
        }
        return line;
      });
    }

    // Deduplicate A1-01 near-duplicate common errors
    if (code === "A1-01" && Array.isArray(lesson.additional_common_errors)) {
      lesson.additional_common_errors = [
        {
          wrong: "My brother he works in Da Nang.",
          correct: "My brother works in Da Nang.",
          why_vi: "Không lặp lại đại từ chủ ngữ (he) ngay sau cụm danh từ làm chủ ngữ (My brother).",
        },
        {
          wrong: "Us are ready for the trip.",
          correct: "We are ready for the trip.",
          why_vi: "Đứng đầu câu làm chủ ngữ phải dùng We; us là đại từ tân ngữ.",
        },
      ];
    }

    // Replace A2-06-Q001 verbatim copy of Theory Section 01 Example 1
    if (code === "A2-06") {
      const q1 = bundle.questions.find((q) => q.id === "A2-06-Q001");
      if (q1 && q1.prompt_en === "At nine last night, I _____ a detective novel.") {
        q1.prompt_en = "At eight last night, I _____ a documentary about space.";
        q1.translation_vi = "Lúc tám giờ tối qua, tôi đang xem một bộ phim tài liệu về vũ trụ.";
        q1.meaning_hint_vi = q1.translation_vi;
        q1.context_en = "At eight last night, I was watching a documentary about space.";
        q1.correct_answer = "was watching";
        q1.accepted_answers = ["was watching"];
        q1.options = ["is watching", "were watching", "did watching", "was watching"];
        q1.explanation_correct_vi = "Đáp án “was watching”. Chủ ngữ I ở thời điểm xác định trong quá khứ đi với was + V-ing.";
        q1.explanation_wrong_vi = "Ở vị trí này cần “was watching” (I + was + V-ing cho hành động đang diễn ra lúc 8 giờ tối qua).";
        q1.option_rationales_vi = {
          "is watching": "“is watching” là thì hiện tại tiếp diễn, không khớp mốc “last night”.",
          "were watching": "Chủ ngữ “I” trong Past Continuous đi với “was”, không dùng “were”.",
          "did watching": "Sau trợ động từ “did” không dùng V-ing; cần cấu trúc “was watching”.",
          "was watching": "Đúng. Chủ ngữ I + was + watching diễn tả hành động đang diễn ra tại thời điểm cụ thể tối qua.",
        };
      }
    }

    // Track MCQ prompts in C2-07 to disambiguate identical fill_blank prompts
    const mcqPromptsInLesson = new Set(
      bundle.questions.filter((q) => q.type === "mcq").map((q) => q.prompt_en),
    );

    for (const q of bundle.questions) {
      const hasBlank = q.prompt_en.includes("_");

      // Disambiguate C2-07 fill_blank items that reuse an identical MCQ prompt_en without cue
      if (code === "C2-07" && q.type === "fill_blank" && mcqPromptsInLesson.has(q.prompt_en) && !/\([^)]+\)/.test(q.prompt_en)) {
        const firstWord = q.correct_answer.split(/\s+/)[0].toLowerCase();
        q.prompt_en = `${q.prompt_en} (${firstWord} + V-ing)`;
        stats.c207Disambiguated++;
      }

      for (const field of ["explanation_correct_vi", "explanation_wrong_vi", "feedback_on_wrong_vi", "hint_vi"]) {
        if (typeof q[field] === "string") {
          const cleaned = cleanRationaleString(q[field], hasBlank);
          if (cleaned !== q[field]) {
            q[field] = cleaned;
            stats.rationaleFieldsCleaned++;
          }
        }
      }

      if (q.option_rationales_vi && typeof q.option_rationales_vi === "object") {
        for (const [optKey, val] of Object.entries(q.option_rationales_vi)) {
          if (typeof val !== "string") continue;
          let updated = val;
          if (updated.includes("{team}")) {
            updated = updated.replace(/“[^”]*\{team\}[^”]*”/g, `“${optKey}”`).replace(/\{team\}/g, optKey);
            stats.teamPlaceholdersFixed++;
          }
          const cleaned = cleanRationaleString(updated, hasBlank);
          if (cleaned !== val) {
            q.option_rationales_vi[optKey] = cleaned;
            stats.rationaleFieldsCleaned++;
          }
        }
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
}

// 5. Fix A1-01..A1-04 ungrammatical second_en in M08 contrasts so TTS never reads broken English
const m08Path = path.join(root, "src/data/grammar-a1-m08/lessons.json");
const m08 = JSON.parse(fs.readFileSync(m08Path, "utf8"));
const m08Fixes = {
  "A1-01": [{ first_en: "She is a doctor.", second_en: "They are doctors.", difference_vi: "Một người nữ dùng She; từ hai người trở lên dùng They." }],
  "A1-02": [{ first_en: "I am a student.", second_en: "She is a student.", difference_vi: "Động từ to be đổi theo chủ ngữ: I đi với am, còn he/she/it đi với is." }],
  "A1-03": [{ first_en: "You are ready.", second_en: "Are you ready?", difference_vi: "Câu khẳng định đặt are sau you; câu hỏi đảo Are lên đầu câu." }],
  "A1-04": [{ first_en: "He calls me every Sunday.", second_en: "I call him every Sunday.", difference_vi: "Đứng trước động từ làm chủ ngữ dùng He / I; đứng sau động từ làm tân ngữ đổi thành me / him." }],
};
for (const [code, contrasts] of Object.entries(m08Fixes)) {
  if (m08[code]) {
    m08[code].contrasts = contrasts;
    stats.m08ContrastsFixed++;
  }
}
fs.writeFileSync(m08Path, JSON.stringify(m08, null, 2) + "\n", "utf8");

// 6. Clean double periods ".." in M26 task bank
const m26Path = path.join(root, "src/data/grammar-transfer-private/m26-task-bank.json");
const m26 = JSON.parse(fs.readFileSync(m26Path, "utf8"));
for (const task of m26.tasks) {
  if (typeof task.prompt_vi === "string" && task.prompt_vi.includes("..")) {
    task.prompt_vi = task.prompt_vi.replace(/\.{2,}/g, ".");
    stats.m26Fixed++;
  }
  if (Array.isArray(task.preparation_steps_vi)) {
    task.preparation_steps_vi = task.preparation_steps_vi.map((step) => {
      const next = step.replace(/\.{2,}/g, ".");
      if (next !== step) stats.m26Fixed++;
      return next;
    });
  }
}
fs.writeFileSync(m26Path, JSON.stringify(m26, null, 2) + "\n", "utf8");

console.log("Phase 2 sanitization complete:", stats);
