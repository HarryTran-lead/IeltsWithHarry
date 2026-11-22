"use client";
import { useState } from "react";

/** A short review stays inside the article; it does not change the spaced-review schedule. */
export function ArticleWordReview({words}:{words:{id:string;title:string;meaningVi:string;example?:string}[]}){
  const [open,setOpen]=useState(false);const [index,setIndex]=useState(0);const [revealed,setRevealed]=useState(false);const [remembered,setRemembered]=useState(0);
  if(!words.length)return null;
  const selected=words.slice(-3);const word=selected[index];
  if(!open)return <button type="button" className="button subtle" onClick={()=>{setIndex(0);setRemembered(0);setRevealed(false);setOpen(true);}}>Ôn nhanh {selected.length} từ của bài</button>;
  return <section className="news-word-review" aria-label="Ôn từ của bài"><button type="button" onClick={()=>setOpen(false)}>Đóng lượt ôn</button>{word?<><small>Từ {index+1}/{selected.length} · Ôn nhanh, không thay lịch ôn</small><h3>{word.title}</h3>{word.example&&<p>{word.example}</p>}{revealed?<><strong>{word.meaningVi}</strong><div>{[false,true].map((known)=><button type="button" className="button subtle" key={String(known)} onClick={()=>{if(known)setRemembered((value)=>value+1);setIndex(index+1);setRevealed(false);}}>{known?"Đã nhớ":"Cần ôn thêm"}</button>)}</div></>:<button type="button" className="button primary" onClick={()=>setRevealed(true)}>Xem nghĩa</button>}</>:<p role="status">Hoàn thành. Bạn đã nhớ {remembered}/{selected.length} từ. Có thể quay lại bài ngay.</p>}</section>;
}
