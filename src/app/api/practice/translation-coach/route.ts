import { z } from "zod";
import { evaluateExpression } from "@/lib/translation/compare-words";

export const runtime = "nodejs";

const requestSchema = z.object({
  band: z.string().regex(/^[1-9]\.\d$/),
  promptVi: z.string().trim().min(1).max(2000),
  learnerText: z.string().trim().min(1).max(2500),
  referenceAnswers: z.array(z.string().trim().min(1).max(2500)).min(1).max(6),
  explanationVi: z.string().trim().max(1000).optional(),
  targetTerm: z.string().trim().max(120).optional(),
  commonErrors: z.array(z.object({
    incorrect: z.string(),
    correction: z.string(),
    reasonVi: z.string(),
  })).max(5).optional(),
});

export type CoachFeedback = {
  verdictVi: string;
  grammarNoteVi: string;
  upgradedSentenceEn: string;
  upgradeTipVi: string;
  source: "ai" | "instant";
};

function buildInstantCoachFeedback(input: z.infer<typeof requestSchema>): CoachFeedback {
  const evalResult = evaluateExpression(
    input.learnerText,
    input.referenceAnswers,
    input.commonErrors ?? [],
  );
  const hasContraction = /\b(don't|doesn't|didn't|can't|won't|isn't|aren't|it's|i'm|i've|i'll)\b/i.test(input.learnerText);
  const numericBand = Number(input.band);

  let verdictVi =
    evalResult.conceptScore >= 85
      ? "Bạn đã diễn đạt rất sát nghĩa và bao phủ hầu hết các ý trọng tâm của câu gốc!"
      : evalResult.conceptScore >= 55
        ? "Bạn đã nắm được khung ý chính; chỉ cần trau chuốt thêm vài cụm từ học thuật để câu tự nhiên hơn."
        : "Câu viết đã có ý khởi đầu, nhưng còn thiếu một số thông tin quan trọng so với câu tiếng Việt.";

  let grammarNoteVi = "Chưa phát hiện bẫy ngữ pháp phổ biến nào trong câu của bạn.";
  if (evalResult.detectedTrap) {
    verdictVi = "Ý chính đã rõ nhưng bạn vừa vướng một lỗi ngữ pháp rất hay gặp ở người học Việt Nam.";
    grammarNoteVi = `Chú ý cụm "${evalResult.detectedTrap.incorrect}" → nên sửa thành "${evalResult.detectedTrap.correction}". ${evalResult.detectedTrap.reasonVi}`;
  } else if (numericBand >= 6 && hasContraction) {
    grammarNoteVi = "Trong IELTS Writing học thuật (Band 6.0+), hãy viết dạng đầy đủ (do not, cannot, will not) thay vì viết tắt để tăng độ trang trọng.";
  } else if (!/[.!?]$/.test(input.learnerText.trim())) {
    grammarNoteVi = "Nhớ đặt dấu chấm kết thúc câu và viết hoa chữ cái đầu câu để giữ điểm hình thức trong phòng thi.";
  }

  const bestModel = input.referenceAnswers[0];
  const upgradeTipVi = input.targetTerm
    ? `Thử neo câu quanh cụm ăn điểm "${input.targetTerm}". ${input.explanationVi ?? ""}`.trim()
    : input.explanationVi || "Quan sát cách câu mẫu nén cụm danh từ và nối mệnh đề để câu gọn và sang hơn.";

  return {
    verdictVi,
    grammarNoteVi,
    upgradedSentenceEn: bestModel,
    upgradeTipVi,
    source: "instant",
  };
}

async function tryGeminiCoach(input: z.infer<typeof requestSchema>): Promise<CoachFeedback | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const configuredModels = (process.env.GEMINI_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = configuredModels.length > 0 ? configuredModels : ["gemini-2.5-flash", "gemini-2.0-flash"];

  const prompt = [
    "Bạn là gia sư IELTS Writing & Speaking tận tâm của HarryUp.",
    `Band mục tiêu của bài: ${input.band}.`,
    `Câu gốc tiếng Việt: "${input.promptVi}"`,
    `Câu mẫu tham khảo: "${input.referenceAnswers[0]}"`,
    `Câu học viên viết: "${input.learnerText}"`,
    "Hãy nhận xét ngắn gọn, khích lệ, KHÔNG phạt nếu học viên paraphrase đúng nghĩa và ngữ pháp.",
    "Trả về JSON thuần theo đúng 4 khóa:",
    '{"verdictVi":"1 câu nhận xét tổng quan về độ sát nghĩa và tự nhiên","grammarNoteVi":"Chỉ ra lỗi ngữ pháp/dùng từ cụ thể trên câu của học viên hoặc khen nếu đã chuẩn","upgradedSentenceEn":"Viết lại dựa trên chính cấu trúc của học viên nhưng nâng cấp lên chuẩn IELTS mượt hơn","upgradeTipVi":"1 mẹo ngắn giải thích cụm từ vừa nâng cấp giúp ăn điểm gì"}',
  ].join("\n");

  for (const model of models.slice(0, 2)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 420,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;
      const parsed = z.object({
        verdictVi: z.string().min(1),
        grammarNoteVi: z.string().min(1),
        upgradedSentenceEn: z.string().min(1),
        upgradeTipVi: z.string().min(1),
      }).safeParse(JSON.parse(rawText));
      if (parsed.success) {
        return { ...parsed.data, source: "ai" };
      }
    } catch {
      // Fall through to next model or instant coach.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = requestSchema.parse(json);
    const aiFeedback = await tryGeminiCoach(input);
    const feedback = aiFeedback ?? buildInstantCoachFeedback(input);
    return Response.json({ feedback }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Không thể phân tích câu viết lúc này. Vui lòng thử lại." }, { status: 400 });
  }
}
