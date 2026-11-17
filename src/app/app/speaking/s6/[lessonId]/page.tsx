import { notFound,redirect } from "next/navigation";
import { getViewerRole } from "@/lib/viewer-role";
import { AppShell } from "@/components/layout/app-shell";
import { SpeakingS6Lesson } from "@/features/speaking-s6/lesson";
export default async function SpeakingS6Page({
  params,searchParams
}:{
  params:Promise<{lessonId:string}>;
  searchParams:Promise<{preview?:string}>;
}){
  const {lessonId}=await params;
  if(!/^S6-(?:00[1-9]|0[1-3]\d|04[0-4])$/.test(lessonId))notFound();
  const role=await getViewerRole();
  if(role==="guest")redirect("/login?next="+encodeURIComponent("/app/speaking/s6/"+lessonId));
  const preview=role==="admin"&&(await searchParams).preview==="1";
  return <AppShell canManage={role==="admin"}><SpeakingS6Lesson lessonId={lessonId} preview={preview}/></AppShell>;
}
