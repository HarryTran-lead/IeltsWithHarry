"use client";

import { useEffect, useState } from "react";
import type { IeltsLiveData, IeltsLiveSkill } from "@/lib/ielts/live";

const cache = new Map<IeltsLiveSkill, { promise: Promise<IeltsLiveData>; at: number }>();
const ttl = 2 * 60 * 1000;

function load(skill: IeltsLiveSkill) {
  const existing = cache.get(skill);
  if (existing && Date.now() - existing.at < ttl) return existing.promise;
  const promise = fetch(`/api/ielts/live?skill=${skill}`, { cache: "no-store" })
    .then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Không tải được dữ liệu.");
      return value as IeltsLiveData;
    })
    .catch((cause) => { cache.delete(skill); throw cause; });
  cache.set(skill, { promise, at: Date.now() });
  return promise;
}

export function useIeltsData(skill: IeltsLiveSkill) {
  const [data, setData] = useState<IeltsLiveData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    load(skill).then((loaded) => { if (mounted) setData(loaded); })
      .catch((cause) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu.");
      })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [skill]);

  return { data, busy, error };
}
