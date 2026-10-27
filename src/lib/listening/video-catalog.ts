export const videoTopics = [
  { id: "education", label: "Học tập", search: "BBC Learning English education 6 Minute English" },
  { id: "technology", label: "Công nghệ", search: "BBC Learning English technology 6 Minute English" },
  { id: "environment", label: "Môi trường", search: "BBC Learning English environment 6 Minute English" },
  { id: "health", label: "Sức khỏe", search: "BBC Learning English health 6 Minute English" },
  { id: "travel", label: "Du lịch & văn hóa", search: "BBC Learning English travel culture 6 Minute English" },
  { id: "work", label: "Công việc", search: "BBC Learning English work 6 Minute English" },
  { id: "money", label: "Tiền bạc", search: "BBC Learning English money 6 Minute English" },
  { id: "food", label: "Ẩm thực", search: "BBC Learning English food 6 Minute English" },
] as const;

export type VideoTopic = (typeof videoTopics)[number]["id"];
export type CatalogVideo = { id: string; title: string; topic: VideoTopic; duration: string; channel: string; keywords: string };

// Only public video metadata is listed here. Playback stays in YouTube's official player.
export const catalogVideos: CatalogVideo[] = [
  { id: "RxDUhWAreCg", title: "Education: 6 Minute English box set", topic: "education", duration: "30 phút", channel: "BBC Learning English", keywords: "education school exam student learning học tập giáo dục" },
  { id: "0EPYNMJv-oQ", title: "Artificial intelligence: 6 Minute English box set", topic: "technology", duration: "30 phút", channel: "BBC Learning English", keywords: "ai robots technology artificial intelligence công nghệ trí tuệ nhân tạo" },
  { id: "StEB_wntlZ0", title: "Is technology harmful to youngsters?", topic: "technology", duration: "6 phút", channel: "BBC Learning English", keywords: "technology teenagers mental health social media công nghệ giới trẻ" },
  { id: "P2UOO6L8rio", title: "Smart tech and climate change", topic: "technology", duration: "6 phút", channel: "BBC Learning English", keywords: "technology climate environment smart tech môi trường khí hậu" },
  { id: "pEO9-iPZQWA", title: "Climate and extreme weather", topic: "environment", duration: "6 phút", channel: "BBC Learning English", keywords: "climate weather storm environment khí hậu thời tiết môi trường" },
  { id: "y10Ch9sRqGQ", title: "Climate change: 6 Minute English box set", topic: "environment", duration: "30 phút", channel: "BBC Learning English", keywords: "climate change nature environment khí hậu thiên nhiên môi trường" },
  { id: "IozMTwnat3o", title: "Health: 6 Minute English box set", topic: "health", duration: "30 phút", channel: "BBC Learning English", keywords: "health sleep doctor exercise sức khỏe giấc ngủ" },
  { id: "FZDImEiPgMk", title: "Feed your brain", topic: "health", duration: "6 phút", channel: "BBC Learning English", keywords: "brain health food nutrition sức khỏe não dinh dưỡng" },
  { id: "OA1iXnZ0lNw", title: "Travel and tourism: 6 Minute English box set", topic: "travel", duration: "30 phút", channel: "BBC Learning English", keywords: "travel tourism trip culture du lịch văn hóa" },
  { id: "5kr5ADrMeYU", title: "Learning a new food culture", topic: "travel", duration: "6 phút", channel: "BBC Learning English", keywords: "culture travel food country văn hóa ẩm thực du lịch" },
  { id: "8E8DQnmd4zs", title: "Flexible working", topic: "work", duration: "6 phút", channel: "BBC Learning English", keywords: "work job office remote career công việc nghề nghiệp" },
  { id: "U7UxHEzTjxY", title: "Money: 6 Minute English box set", topic: "money", duration: "30 phút", channel: "BBC Learning English", keywords: "money finance payment spending tiền bạc tài chính" },
  { id: "vOuhs1mA0xo", title: "How advertisers make us spend money", topic: "money", duration: "6 phút", channel: "BBC Learning English", keywords: "money advertising shopping spending tiền bạc quảng cáo" },
  { id: "vW2HKouGOPE", title: "Food issues: 6 Minute English box set", topic: "food", duration: "30 phút", channel: "BBC Learning English", keywords: "food sugar eating waste ẩm thực thực phẩm" },
];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}

export function findCatalogVideos(query: string, topic: VideoTopic | "all") {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return catalogVideos.filter((video) => {
    if (topic !== "all" && video.topic !== topic) return false;
    const topicLabel = videoTopics.find((item) => item.id === video.topic)?.label ?? "";
    const haystack = normalize(`${video.title} ${video.channel} ${video.keywords} ${topicLabel}`);
    return words.every((word) => haystack.includes(word));
  });
}
