"use client";
import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
type Mix={total:number;real:number;ai:number;missing:number;articles:{id:string;title:string;kind:"real"|"ai"|"missing"}[]};
export function AdminNewsPhotoMix(){
  const db=useMemo(()=>createClient(),[]);const [mix,setMix]=useState<Mix|null>(null);const [error,setError]=useState("");
  useEffect(()=>{let active=true;void db.rpc("news_admin_photo_mix").then(({data,error})=>{if(!active)return;if(error)setError("Chưa tải được thống kê ảnh.");else setMix(data as Mix);});return()=>{active=false;};},[db]);
  return <section className="card admin-overview-card"><h3>Ảnh của 10 bài mới nhất</h3>{error?<p role="status">{error}</p>:mix?<><p><b>{mix.real}/{mix.total}</b> ảnh thật · {mix.ai} ảnh AI · {mix.missing} chưa có ảnh. Mục tiêu: ít nhất 8 ảnh thật và tối đa 2 ảnh AI trên 10 bài. Bài thiếu ảnh được tính riêng.</p><p>{mix.total===10&&mix.real>=8&&mix.ai<=2?"Đã đạt mục tiêu ở nhóm hiện tại.":"Chưa đạt mục tiêu; tiếp tục ưu tiên tìm ảnh thật."}</p><details><summary>Xem từng bài</summary><ul>{mix.articles.map((article)=><li key={article.id}><Link href={`/app/news/${article.id}`}>{article.title}</Link> — {article.kind==="real"?"Ảnh thật":article.kind==="ai"?"Ảnh AI":"Chưa có ảnh"}</li>)}</ul></details></>:<p>Đang tải thống kê…</p>}</section>;
}
