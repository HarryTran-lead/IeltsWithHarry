"use client";
import { useEffect, useRef, useState } from "react";
import type { Cue } from "@/lib/listening/youtube";
import { loadYouTubeIframeApi, type YouTubePlayer as Player } from "@/lib/youtube-iframe-api";

export function YoutubePlayer({ id, segment, request, loop = false, onTime }: { id: string; segment?: Cue | null; request: number; loop?: boolean; onTime?: (seconds: number) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const segmentRef = useRef(segment);
  const loopRef = useRef(loop);
  const onTimeRef = useRef(onTime);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [rates, setRates] = useState<number[]>([1]);
  const [rate, setRate] = useState(1);
  useEffect(() => { segmentRef.current = segment; loopRef.current = loop; onTimeRef.current = onTime; }, [segment, loop, onTime]);

  useEffect(() => {
    let alive = true;
    const target = mount.current;
    if (!target) return;
    void loadYouTubeIframeApi().then((yt) => {
      if (!alive) return;
      player.current = new yt.Player(target, { videoId: id, width: "100%", height: "100%", playerVars: { controls: 1, playsinline: 1, rel: 0 }, events: {
        onReady: () => { if (!alive || !player.current) return; setReady(true); setRates(player.current.getAvailablePlaybackRates()); },
        onError: ({ data }) => setError(data === 100 ? "This video was removed or is unavailable." : data === 101 || data === 150 ? "The owner does not allow this video to be embedded." : "YouTube could not play this video."),
        onPlaybackRateChange: () => setRate(player.current?.getPlaybackRate() ?? 1),
      } });
    }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "YouTube could not load."); });
    const timer = window.setInterval(() => {
      const current = player.current?.getCurrentTime();
      if (typeof current !== "number") return;
      onTimeRef.current?.(current);
      const cue = segmentRef.current;
      if (cue && current >= cue.end) {
        if (loopRef.current) { player.current?.seekTo(cue.start, true); player.current?.playVideo(); }
        else { player.current?.pauseVideo(); segmentRef.current = null; }
      }
    }, 200);
    return () => { alive = false; window.clearInterval(timer); player.current?.destroy(); player.current = null; setReady(false); };
  }, [id]);

  useEffect(() => { if (ready && segment && request) { player.current?.seekTo(segment.start, true); player.current?.playVideo(); } }, [ready, request, segment]);
  return <div className="yt-player-shell">
    <div className="yt-player-frame" ref={mount} aria-label="YouTube video player" />
    {error && <p role="alert" className="form-error">{error} <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">Open on YouTube</a></p>}
    <div className="yt-player-actions"><button type="button" disabled={!ready} onClick={() => player.current?.pauseVideo()}>Pause</button><button type="button" disabled={!ready} onClick={() => player.current?.playVideo()}>Play</button><button type="button" disabled={!ready || !segment} onClick={() => { if (segment) { player.current?.seekTo(segment.start, true); player.current?.playVideo(); } }}>Replay sentence</button><label>Speed <select value={rate} disabled={!ready} onChange={(event) => player.current?.setPlaybackRate(Number(event.target.value))}>{rates.map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></div>
  </div>;
}
