import type { newsAdminClient } from "./sync";

export type NewsAdminSettings = {
  id: boolean;
  auto_sync_enabled: boolean;
  auto_enrich_enabled: boolean;
  quiz_prompt: string;
  daily_quiz_limit: number;
  /** AI-written Vietnamese story attempts per day; each costs three Gemini requests (four with a revision). */
  daily_rewrite_limit: number;
  updated_at: string;
};

export async function loadNewsSettings(db: ReturnType<typeof newsAdminClient>): Promise<NewsAdminSettings> {
  const { data, error } = await db.from("news_admin_settings").select("*").eq("id", true).single();
  if (error || !data) throw new Error(error?.message ?? "News admin settings are missing");
  return data as NewsAdminSettings;
}
