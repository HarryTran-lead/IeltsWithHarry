import "server-only";

export type PublicCourse = {
  slug: string;
  title: string;
  description: string;
  stage_id: string;
};

/** The public catalog is identical for every visitor, so it can be shared briefly. */
export async function getPublicCourses(): Promise<PublicCourse[]> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key) return [];

  const url = new URL("/rest/v1/courses", origin);
  url.searchParams.set("select", "slug,title,description,stage_id");
  url.searchParams.set("published", "eq.true");
  url.searchParams.set("order", "title.asc");
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    next: { revalidate: 30 },
  });
  if (!response.ok) throw new Error(`Public course catalog returned ${response.status}`);
  return response.json() as Promise<PublicCourse[]>;
}
