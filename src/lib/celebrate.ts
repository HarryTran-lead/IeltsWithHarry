/*
 * Small confetti burst plus an optional floating label, drawn with plain DOM
 * nodes so any client component can reward a finished task or a good score.
 */
const colors = ["#12a1ab", "#ffc94a", "#f2665f", "#7c66dc", "#2fb889", "#4f8fe0"];

type Origin = { x: number; y: number } | Element | null | undefined;

function point(origin: Origin) {
  if (origin && "getBoundingClientRect" in origin) {
    const rect = origin.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}

export function celebrate(origin?: Origin, { label, pieces = 26 }: { label?: string; pieces?: number } = {}) {
  if (typeof window === "undefined") return;
  // With reduced motion the burst stays small and close; the reward label still shows.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) pieces = Math.min(pieces, 10);
  const { x, y } = point(origin);
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  for (let index = 0; index < pieces; index++) {
    const piece = document.createElement("i");
    const angle = (Math.PI * 2 * index) / pieces + Math.random() * 0.5;
    const distance = reduced ? 24 + Math.random() * 20 : 60 + Math.random() * 90;
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance - (reduced ? 0 : 40)}px`);
    piece.style.setProperty("--spin", `${Math.round(Math.random() * 720 - 360)}deg`);
    if (index % 3 === 0) piece.style.borderRadius = "50%";
    layer.appendChild(piece);
  }
  if (label) {
    const tag = document.createElement("b");
    tag.textContent = label;
    tag.style.left = `${x}px`;
    tag.style.top = `${y}px`;
    layer.appendChild(tag);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1400);
}

/** Celebrate a quiz result: a big burst for a perfect score, a small one for a passing score. */
export function celebrateScore(score: number, total: number, origin?: Origin) {
  if (!total) return;
  const ratio = score / total;
  if (ratio === 1) celebrate(origin, { label: "Hoàn hảo!", pieces: 40 });
  else if (ratio >= 0.6) celebrate(origin, { label: "Làm tốt lắm!", pieces: 20 });
}
