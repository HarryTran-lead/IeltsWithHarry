export const NEWS_CATEGORIES = ["Technology", "Science", "Education", "Health", "Environment", "Business", "Culture", "World News"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export const NEWS_CATEGORY_LABELS:Record<NewsCategory,string>={Technology:"Công nghệ",Science:"Khoa học",Education:"Học tập",Health:"Sức khỏe",Environment:"Môi trường",Business:"Kinh tế & nghề nghiệp",Culture:"Văn hóa", "World News":"Thế giới"};
export function newsCategoryLabel(category:string){return NEWS_CATEGORY_LABELS[category as NewsCategory]??category;}
