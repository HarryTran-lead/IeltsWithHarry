import { z } from "zod";
import { bankClient, viewer, requestError } from "@/lib/ielts-bank/server";
import { lessonId } from "@/lib/speaking-s6/contract";
export const runtime="nodejs";
export async function GET(request:Request){
  try {
    await viewer();
    const params=new URL(request.url).searchParams;
    const code=lessonId.parse(params.get("lessonId"));
    const preview=params.get("preview")==="true";
    if(preview)await viewer(true);
    const db=bankClient();
    if(!preview){
      const {data:ready,error:gateError}=await db.rpc("speaking_s6_release_ready");
      if(gateError || ready!==true)return Response.json({error:"NOT_AVAILABLE"},{status:404});
    }
    let query=db.from("speaking_s6_lesson_revisions").select("lesson_code,revision,status,student_content")
      .eq("lesson_code",code).order("created_at",{ascending:false}).limit(1);
    if(!preview)query=query.eq("status","published");
    const {data,error}=await query.maybeSingle();
    if(error)throw new Error(error.message);
    if(!data)return Response.json({error:"NOT_AVAILABLE"},{status:404});
    return Response.json({lesson:data.student_content,revision:data.revision,preview},
      {headers:{"Cache-Control":"private, no-store"}});
  } catch(e){
    if(e instanceof z.ZodError)return Response.json({error:"SCHEMA_INVALID"},{status:422});
    return requestError(e);
  }
}
