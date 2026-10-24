export const NEWS_CATEGORIES = ["Technology", "Science", "Education", "Health", "Environment", "Business", "Culture", "World News"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
