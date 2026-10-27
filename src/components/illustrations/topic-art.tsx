"use client";
/* eslint-disable @next/next/no-img-element -- Course book illustrations load from Supabase public storage with progressive fallback. */

import { useState } from "react";
import { courseBookArtCandidates, isCourseBookAiUrl } from "@/lib/course-book-art";
import { topicIllustration, wordIllustration } from "@/lib/topic-illustration";

export type TopicArtProps = {
  topic: string;
  className?: string;
  word?: string;
  caption?: boolean | string;
  unitSlug?: string | null;
  lessonSlug?: string | null;
  imageUrl?: string | null;
  variant?: "unit" | "lesson" | "exercise";
  badge?: boolean;
};

export function TopicArt({
  topic,
  className = "",
  word,
  caption = false,
  unitSlug,
  lessonSlug,
  imageUrl,
  variant,
  badge = true,
}: TopicArtProps) {
  const art = word ? wordIllustration(word, topic) : topicIllustration(topic);
  const candidates = courseBookArtCandidates({ topic, word, unitSlug, lessonSlug, imageUrl, variant });
  const [failed, setFailed] = useState<string[]>([]);
  const activeSrc = candidates.find((url) => !failed.includes(url)) ?? art.src;
  const isAi = isCourseBookAiUrl(activeSrc);

  return (
    <figure className={`topic-art ${isAi ? "is-ai-art" : ""} ${className}`.trim()}>
      <img
        src={activeSrc}
        alt={art.alt}
        width={480}
        height={300}
        loading="lazy"
        onError={() => {
          if (activeSrc !== art.src) {
            setFailed((prev) => (prev.includes(activeSrc) ? prev : [...prev, activeSrc]));
          }
        }}
      />
      {badge && isAi && (
        <em className="topic-ai-badge" title="Hình minh họa tạo bằng AI (Pollinations)">
          Ảnh AI
        </em>
      )}
      {caption && (
        <figcaption>
          {typeof caption === "string"
            ? caption
            : word && !art.contextual
              ? `Hình gợi nhớ: ${word}`
              : `Minh họa chủ đề: ${topic || "Tiếng Anh"}`}
        </figcaption>
      )}
    </figure>
  );
}
