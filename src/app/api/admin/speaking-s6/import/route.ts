import { z } from "zod";
import { bankClient, viewer, requestError } from "@/lib/ielts-bank/server";
import { validateS6Import } from "@/lib/speaking-s6/contract";
export const runtime="nodejs";
export async function POST(request:Request){
  try {
    const admin=await viewer(true);
    if(Number(request.headers.get("content-length")||0)>200000)
      return Response.json({error:"BODY_TOO_LARGE"},{status:413});
    const raw=await request.text();
    if(Buffer.byteLength(raw,"utf8")>200000)
      return Response.json({error:"BODY_TOO_LARGE"},{status:413});
    const body=validateS6Import(JSON.parse(raw));
    const {error}=await bankClient().rpc("speaking_s6_import_revision",{
      p_lesson_code:body.lesson.lesson_id,p_revision:body.revision,p_hash:body.hash,
      p_student_content:body.lesson,p_private_bank:body.privateLesson,
      p_private_hash:body.privateHash,p_actor:admin.id
    });
    if(error?.code==="23505")return Response.json({error:"ADD_ONLY_CONFLICT"},{status:409});
    if(error)throw new Error(error.message);
    return Response.json({ok:true,status:"staging",lesson_id:body.lesson.lesson_id,revision:body.revision},
      {status:201,headers:{"Cache-Control":"private, no-store"}});
  } catch(e){
    if(e instanceof z.ZodError)return Response.json({error:"SCHEMA_INVALID",details:e.issues},{status:422});
    if(e instanceof Error && e.message.startsWith("S6_"))return Response.json({error:e.message},{status:422});
    return requestError(e);
  }
}
