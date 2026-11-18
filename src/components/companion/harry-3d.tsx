"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { harryModel, type HarryModelConfig } from "./harry-model";
import type { HarryMood } from "./harry-moods";
import type { HarryRig, HarryRigInfo } from "./harry-rig";

/*
 * React wrapper for the 3D Harry rig. three.js loads lazily in its own chunk
 * so pages stay light; until it is ready (or if WebGL is unavailable) the
 * round mascot badge stands in. Rendering pauses while off screen.
 * With a sculpted model configured (harry-model.ts) that model is used, and
 * the code-built rig takes over if it cannot load.
 */
export function Harry3D({ mood = "happy", width = 120, pulse = 0, yaw = 0, className = "", title, model = harryModel, onInfo }: {
  mood?: HarryMood; width?: number; pulse?: number; yaw?: number; className?: string; title?: string;
  model?: HarryModelConfig | null; onInfo?: (info: HarryRigInfo) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rigRef = useRef<HarryRig | null>(null);
  const moodRef = useRef(mood);
  const yawRef = useRef(yaw);
  const onInfoRef = useRef(onInfo);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const height = Math.round(width * 1.2);
  const modelKey = model ? JSON.stringify(model) : "";

  useEffect(() => {
    onInfoRef.current = onInfo;
  }, [onInfo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let rig: HarryRig | null = null;
    let observer: IntersectionObserver | null = null;
    let resizer: ResizeObserver | null = null;
    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
      const y = -(event.clientY - (rect.top + rect.height * 0.3)) / (window.innerHeight / 2);
      rig?.setPointer(x * 1.6, y * 1.6);
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const config = modelKey ? (JSON.parse(modelKey) as HarryModelConfig) : null;
    let modelError: string | undefined;
    const load = async (): Promise<HarryRig> => {
      if (config) {
        try {
          const { createHarryModelRig } = await import("./harry-model-rig");
          return await createHarryModelRig(canvas, { ...config, reducedMotion });
        } catch (error) {
          modelError = error instanceof Error ? error.message : String(error);
          console.warn("Harry model could not load; using the code-built Harry.", error);
        }
      }
      const { createHarryRig } = await import("./harry-rig");
      return createHarryRig(canvas, { reducedMotion });
    };

    load().then((created) => {
      if (disposed) {
        created.dispose();
        return;
      }
      rig = created;
      rigRef.current = rig;
      onInfoRef.current?.({ ...(rig.info ?? { source: "code", clips: [], byMood: {} }), error: modelError });
      if (process.env.NODE_ENV !== "production") (canvas as HTMLCanvasElement & { harryRig?: HarryRig }).harryRig = rig;
      rig.setMood(moodRef.current);
      rig.setYaw(yawRef.current);
      const rect = canvas.getBoundingClientRect();
      rig.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      resizer = new ResizeObserver(([entry]) => rig?.resize(Math.max(1, entry.contentRect.width), Math.max(1, entry.contentRect.height)));
      resizer.observe(canvas);
      observer = new IntersectionObserver(([entry]) => rig?.setActive(entry.isIntersecting));
      observer.observe(canvas);
      window.addEventListener("pointermove", onPointer, { passive: true });
      setState("ready");
    }).catch(() => { if (!disposed) setState("failed"); });

    return () => {
      disposed = true;
      observer?.disconnect();
      resizer?.disconnect();
      window.removeEventListener("pointermove", onPointer);
      rig?.dispose();
      rigRef.current = null;
    };
  }, [modelKey]);

  useEffect(() => {
    moodRef.current = mood;
    rigRef.current?.setMood(mood);
  }, [mood]);

  useEffect(() => {
    if (pulse) rigRef.current?.hop();
  }, [pulse]);

  useEffect(() => {
    yawRef.current = yaw;
    rigRef.current?.setYaw(yaw);
  }, [yaw]);

  return (
    <span className={`harry-3d is-${state} ${className}`.trim()} style={{ width, height }} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {state === "failed"
        ? <Image src="/ieltswithharry-mascot.webp" alt="" width={width} height={width} />
        : <canvas key={modelKey} ref={canvasRef} />}
    </span>
  );
}
