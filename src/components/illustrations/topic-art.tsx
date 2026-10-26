import Image from "next/image";
import { topicIllustration, wordIllustration } from "@/lib/topic-illustration";

export function TopicArt({ topic, className = "", word, caption = false }: { topic: string; className?: string; word?: string; caption?: boolean }) {
  const art = word ? wordIllustration(word, topic) : topicIllustration(topic);
  return <figure className={`topic-art ${className}`}>
    <Image src={art.src} alt={art.alt} width={480} height={300} loading="lazy" />
    {caption && <figcaption>{word && !art.contextual ? `Hình gợi nhớ: ${word}` : `Minh họa chủ đề: ${topic || "Tiếng Anh"}`}</figcaption>}
  </figure>;
}
