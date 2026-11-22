import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect,it } from "vitest";

it("enforces real deadlines, revisions, ownership, idempotency, QA isolation and photo reservations",async()=>{
  const db=new PGlite();
  const user="00000000-0000-4000-8000-000000000001";
  const other="00000000-0000-4000-8000-000000000002";
  const article="10000000-0000-4000-8000-000000000001";
  const question="20000000-0000-4000-8000-000000000001";
  try{
    await db.exec(`create role authenticated;create role anon;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.news_articles(id uuid primary key,title text default 'A news article',publication_status text default 'published',sensitive boolean default false,
        category text default 'Science',origin_region text default 'vietnam',interest_topics text[] default '{}',source_id uuid,published_at timestamptz default now(),image_url text,illustration_source_url text);
      create table public.news_article_bodies(article_id uuid primary key,body_text text,ai_generated boolean default false);
      create view public.news_archive_catalog as select a.*,true as readable from public.news_articles a;
      create table public.news_auto_questions(id uuid primary key,article_id uuid,sort_order integer,prompt text,options jsonb,question_type text);
      create table public.news_auto_answer_keys(question_id uuid primary key,correct_index integer);
      create table public.user_news_article_reads(user_id uuid,article_id uuid);
      create table public.news_auto_attempts(id uuid default gen_random_uuid(),user_id uuid,article_id uuid,answers jsonb);
      create function public.is_admin() returns boolean language sql as $$select true$$;
      create function public.news_grade_auto_answers(p_id uuid,p_answers jsonb) returns table(correct boolean,review jsonb) language sql as $$
        select value='0'::jsonb,jsonb_build_object('id',key,'correct',value='0'::jsonb) from jsonb_each(p_answers) order by key $$;
      create function public.news_auto_breakdown(p_id uuid,p_answers jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function public.news_submit_auto_exam(p_article_id uuid,p_answers jsonb,p_seconds integer) returns jsonb language plpgsql as $$
      begin insert into public.news_auto_attempts(user_id,article_id,answers) values(auth.uid(),p_article_id,p_answers);
        return jsonb_build_object('review',(select jsonb_agg(review) from public.news_grade_auto_answers(p_article_id,p_answers)));end;$$;
      grant execute on function public.news_submit_auto_exam(uuid,jsonb,integer) to authenticated;
      insert into auth.users values('${user}'),('${other}');
      insert into public.news_articles(id) values('${article}');insert into public.news_article_bodies(article_id) values('${article}');
      insert into public.news_auto_questions values('${question}','${article}',0,'What happened?', '[]','mcq');
      insert into public.news_auto_answer_keys values('${question}',0);
      set request.jwt.claim.sub='${user}';`);
    for(const file of ["202611220002_news_exam_sessions.sql","202611220003_news_unread_picker.sql","202611220004_news_reading_sections.sql","202611220005_news_photo_mix.sql","202611220006_news_legacy_question_forms.sql","202611220007_news_require_timed_session.sql"])
      await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
    // Legacy repairs retain IDs and keys, so old results remain recoverable.
    const repairSql=readFileSync("supabase/migrations/202611220006_news_legacy_question_forms.sql","utf8");
    const dataRepair=repairSql.slice(repairSql.indexOf("insert into public.news_question_form_repairs"));
    const oldDiagram="20000000-0000-4000-8000-000000000002";
    await db.query("insert into public.news_auto_questions values($1,$2,1,'Complete the description ______','[]','diagram_label_completion')",[oldDiagram,article]);
    await db.exec(dataRepair);
    expect((await db.query<{question_type:string}>("select question_type from public.news_auto_questions where id=$1",[oldDiagram])).rows[0].question_type).toBe("sentence_completion");
    expect((await db.query<{reason:string}>("select reason from public.news_question_form_repairs where question_id=$1",[oldDiagram])).rows[0].reason).toContain("no diagram");
    await db.query("delete from public.news_auto_questions where id=$1",[oldDiagram]);
    const rpc=async<T=Record<string,unknown>>(sql:string,params:unknown[]=[])=> (await db.query<{value:T}>(`select ${sql} as value`,params)).rows[0].value;
    const open=await rpc<{id:string;revision:number}>("public.news_open_auto_exam($1,true,false)",[article]);
    expect((await rpc<{id:string}>("public.news_open_auto_exam($1,true,false)",[article])).id).toBe(open.id);
    const saved=await rpc<{revision:number}>("public.news_save_auto_exam($1,$2,0)",[open.id,{[question]:0}]);
    expect(saved.revision).toBe(1);
    expect((await rpc<{answers:unknown}>("public.news_open_auto_exam($1,false,false)",[article])).answers).toEqual({[question]:0});
    await expect(rpc("public.news_save_auto_exam($1,$2,0)",[open.id,{[question]:1}])).rejects.toThrow("Another tab");
    await expect(rpc("public.news_save_auto_exam($1,$2,null)",[open.id,{[question]:1}])).rejects.toThrow("Another tab");
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    await expect(rpc("public.news_save_auto_exam($1,$2,1)",[open.id,{[question]:1}])).rejects.toThrow("Session unavailable");
    await db.exec(`set request.jwt.claim.sub='${user}'`);
    await db.query("update public.news_exam_sessions set started_at=now()-interval '21 minutes',expires_at=now()-interval '1 minute' where id=$1",[open.id]);
    await expect(rpc("public.news_save_auto_exam($1,$2,1)",[open.id,{[question]:1}])).rejects.toThrow("expired");
    const result=await rpc<{answers:unknown;durationSeconds:number}>("public.news_finish_auto_exam($1,$2,1)",[open.id,{[question]:1}]);
    expect(result.answers).toEqual({[question]:0});expect(result.durationSeconds).toBe(1200);
    expect(await rpc("public.news_finish_auto_exam($1,$2,1)",[open.id,{[question]:1}])).toEqual(result);
    expect(await rpc<number>("(select count(*)::integer from public.news_auto_attempts)")).toBe(1);
    const qa=await rpc<{id:string}>("public.news_open_auto_exam($1,true,true)",[article]);
    await rpc("public.news_finish_auto_exam($1,$2,0)",[qa.id,{[question]:0}]);
    expect(await rpc<number>("(select count(*)::integer from public.news_auto_attempts)")).toBe(1);
    const next=await rpc<{id:string}>("public.news_open_auto_exam($1,true,false)",[article]);
    expect(next.id).not.toBe(open.id);
    await db.query("update public.news_auto_questions set prompt='The revised question?' where id=$1",[question]);
    expect((await rpc<{stale:boolean}>("public.news_open_auto_exam($1,false,false)",[article])).stale).toBe(true);
    await expect(rpc("public.news_finish_auto_exam($1,$2,0)",[next.id,{[question]:0}])).rejects.toThrow("Questions changed");
    await rpc("public.news_close_stale_auto_exam($1)",[next.id]);
    expect((await rpc<{id:string}>("public.news_open_auto_exam($1,true,false)",[article])).id).not.toBe(next.id);
    expect(await rpc<boolean>("has_function_privilege('authenticated','public.news_submit_auto_exam(uuid,jsonb,integer)','EXECUTE')")).toBe(false);
    expect(await rpc<boolean>("has_function_privilege('anon','public.news_open_auto_exam(uuid,boolean,boolean)','EXECUTE')")).toBe(false);
    await db.exec(`insert into public.user_news_article_reads values('${user}','${article}')`);
    expect(await rpc("public.news_random_unread_article()")).toBeNull();
    await db.exec("delete from public.news_articles where id<>'10000000-0000-4000-8000-000000000001'");
    // Eight real covers and two missing covers permit exactly two reservations.
    await db.exec("update public.news_articles set image_url='https://example.com/real.jpg'");
    const photoIds:string[]=[];
    for(let i=0;i<9;i++){
      const id=`30000000-0000-4000-8000-${String(i).padStart(12,"0")}`;photoIds.push(id);
      await db.query("insert into public.news_articles(id,image_url,published_at) values($1,$2,now()+$3*interval '1 second')",[id,i<7?"https://example.com/real.jpg":null,i+1]);
    }
    expect(await rpc("public.news_claim_ai_cover_slot($1)",[photoIds[7]])).toBe(true);
    expect(await rpc("public.news_claim_ai_cover_slot($1)",[photoIds[8]])).toBe(true);
    expect(await rpc("public.news_claim_ai_cover_slot($1)",[photoIds[8]])).toBe(false);
    expect(await rpc("public.news_claim_ai_cover_slot($1)",[photoIds[0]])).toBe(false);
    const mix=await rpc<{real:number;ai:number;missing:number}>("public.news_admin_photo_mix()");
    expect(mix).toMatchObject({real:8,ai:0,missing:2});
  }finally{await db.close();}
},30000);
