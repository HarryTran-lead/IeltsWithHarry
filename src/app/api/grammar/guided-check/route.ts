import { NextResponse } from "next/server";
import { checkM19Answer } from "@/lib/grammar/teaching/m19-guided-theory";
import { checkM19BAnswer } from "@/lib/grammar/teaching/m19b-guided-theory";
import { checkM19CAnswer } from "@/lib/grammar/teaching/m19c-guided-theory";
import { checkM19DAnswer } from "@/lib/grammar/teaching/m19d-guided-theory";
import { checkM19EAnswer } from "@/lib/grammar/teaching/m19e-guided-theory";
import { checkM19FAnswer } from "@/lib/grammar/teaching/m19f-guided-theory";
import { createClient } from "@/lib/supabase/server";
import { demoMode } from "@/lib/runtime";
import { grammarFlag } from "@/lib/grammar/preview";
import { getViewerRole } from "@/lib/viewer-role";
/** Formative preview only. Never writes grades, progress, or unlocks. */
export async function POST(request:Request) {
  if (await getViewerRole() === "guest") return NextResponse.json({error:"Cần đăng nhập."},{status:401});
  try {
    const body: unknown=await request.json();
    if (!body || typeof body!=="object" || Array.isArray(body)) throw Error("invalid");
    const b=body as Record<string,unknown>;
    if (typeof b.code!=="string" || !/^(A1|A2|B1|B2|C1|C2)-\d{2}$/.test(b.code) || typeof b.checkId!=="string" || typeof b.selection!=="number" || !Number.isInteger(b.selection) || b.selection < 0 || b.selection > 2) throw Error("invalid");
    const selection=b.selection;
    const enabled = b.code.startsWith("A1-")
      ? grammarFlag("GRAMMAR_M19_ENABLE_GUIDED_THEORY")
      : b.code.startsWith("A2-")
        ? grammarFlag("GRAMMAR_M19B_ENABLE_GUIDED_THEORY")
        : b.code.startsWith("B1-")
          ? grammarFlag("GRAMMAR_M19C_ENABLE_GUIDED_THEORY")
          : b.code.startsWith("B2-")
            ? grammarFlag("GRAMMAR_M19D_ENABLE_GUIDED_THEORY")
            : b.code.startsWith("C1-")
              ? grammarFlag("GRAMMAR_M19E_ENABLE_GUIDED_THEORY")
              : b.code.startsWith("C2-") && grammarFlag("GRAMMAR_M19F_ENABLE_GUIDED_THEORY");
    if (!enabled) return NextResponse.json({error:"Không có bản học thử."},{status:404});
    // M19G: match the lesson GET access policy for EVERY level.
    // A2/B1 previously exposed formative keys without the unlock required by lesson GET.
    if (!b.code.startsWith("A1-") && !demoMode) {
      const db = await createClient();
      const {data: auth,error: authError}=await db.auth.getUser();
      if (authError || !auth.user) return NextResponse.json({error:"Cần đăng nhập."},{status:401});
      const {data: unlocked,error: unlockError}=await db.from("grammar_level_unlocks")
        .select("level").eq("user_id",auth.user.id).eq("level",b.code.slice(0,2)).maybeSingle();
      if (unlockError || unlocked?.level!==b.code.slice(0,2))
        return NextResponse.json({error:"Cấp độ chưa mở khóa."},{status:403});
    }
    const result=b.code.startsWith("A1-")
      ? checkM19Answer(b.code,b.checkId,selection)
      : b.code.startsWith("A2-")
        ? checkM19BAnswer(b.code,b.checkId,selection)
        : b.code.startsWith("B1-")
          ? checkM19CAnswer(b.code,b.checkId,selection)
          : b.code.startsWith("B2-")
            ? checkM19DAnswer(b.code,b.checkId,selection)
            : b.code.startsWith("C1-")
              ? checkM19EAnswer(b.code,b.checkId,selection)
              : checkM19FAnswer(b.code,b.checkId,selection);
    if (!result) return NextResponse.json({error:"Câu thử không hợp lệ."},{status:400});
    return NextResponse.json({...result, formativeOnly:true},{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({error:"Dữ liệu không hợp lệ."},{status:400});
  }
}
