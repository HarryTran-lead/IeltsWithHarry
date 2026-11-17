import { z } from "zod";
import { bankClient, viewer, requestError } from "@/lib/ielts-bank/server";
import { lessonId } from "@/lib/speaking-s6/contract";
import { s6AccessAllowed } from "@/lib/speaking-s6/access";
export const runtime="nodejs";
export async function GET(request:Request){
  try {
    const preview=new URL(request.url).searchParams.get("preview")==="true";
    const user=await viewer(preview);
    const params=new URL(request.url).searchParams;
    const code=lessonId.parse(params.get("lessonId"));

    const db=bankClient();
    if(!await s6AccessAllowed(user.id,preview,db))
      return Response.json({error:"NOT_AVAILABLE"},{status:404});
    const query=db.from("speaking_s6_lesson_revisions").select("lesson_code,revision,status,student_content")
      .eq("lesson_code",code).eq("status",preview?"staging":"published")
      .order("created_at",{ascending:false}).limit(1);
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
