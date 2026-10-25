import type { CSSProperties, ReactNode } from "react";

/*
 * Hand-drawn sticker set for IeltsWithHarry. Every sticker shares one SVG
 * filter (rendered once by <StickerDefs />) that grows a white die-cut border
 * around the artwork, so new stickers only need their coloured shapes.
 * Artwork stays inside the 8–92 range of the 100×100 box to leave room for it.
 */

export type StickerName =
  | "harry"
  | "star"
  | "plane"
  | "bubble"
  | "book"
  | "headphones"
  | "pencil"
  | "mic"
  | "coffee"
  | "bulb"
  | "globe"
  | "stamp"
  | "flame"
  | "check"
  | "heart"
  | "abc"
  | "chart"
  | "calendar"
  | "clock"
  | "lock"
  | "mountain"
  | "rocket"
  | "newspaper"
  | "notebook";

const ink = "#10233f";

function art(name: StickerName, label?: string): ReactNode {
  switch (name) {
    case "harry":
      return <image href="/ieltswithharry-mascot.webp" x="8" y="8" width="84" height="84" />;
    case "star":
      return <>
        <path d="M50 9c3 0 4.6 2 6 5l7.6 15.4 17 2.5c6.6 1 8 5.4 3.4 9.9L71.7 53.7l2.9 16.9c1.1 6.6-2.7 9.4-8.6 6.3L50.8 69l-15.2 8c-5.9 3.1-9.7.3-8.6-6.3l2.9-17L17.5 41.8c-4.7-4.5-3.2-8.9 3.3-9.9l17-2.5L45 14c1.4-3 2.9-5 5-5Z" fill="#ffc94a" stroke="#e8a21c" strokeWidth="3" strokeLinejoin="round" />
        <path d="M33 34c4-1 7-1 9-3" stroke="#fff3c4" strokeWidth="4" strokeLinecap="round" fill="none" />
        {label ? <text x="50" y="58" textAnchor="middle" className="sticker-text" fontSize={label.length > 3 ? 15 : 19} fill={ink}>{label}</text> : <>
          <circle cx="42" cy="47" r="3.4" fill={ink} /><circle cx="58" cy="47" r="3.4" fill={ink} />
          <path d="M43 56q7 6 14 0" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
        </>}
      </>;
    case "plane":
      return <>
        <path d="M14 76c8-6 14-8 22-8" stroke="#8fd8de" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" fill="none" />
        <path d="M88 14 12 46l26 10 4 26 14-17 18 12Z" fill="#ffffff" stroke="#2c98a8" strokeWidth="3" strokeLinejoin="round" />
        <path d="M88 14 38 56l4 26 6-17Z" fill="#cfeff2" stroke="#2c98a8" strokeWidth="3" strokeLinejoin="round" />
        <path d="M88 14 48 65l26 12Z" fill="#7fd3da" stroke="#2c98a8" strokeWidth="3" strokeLinejoin="round" />
      </>;
    case "bubble":
      return <>
        <path d="M18 14h64c6 0 10 4 10 10v34c0 6-4 10-10 10H45L27 85l4-17H18c-6 0-10-4-10-10V24c0-6 4-10 10-10Z" fill="#ff7a6b" stroke="#e45a4b" strokeWidth="3" strokeLinejoin="round" />
        <text x="50" y="48" textAnchor="middle" className="sticker-text" fontSize={(label ?? "Hello!").length > 7 ? 15 : 19} fill="#fff">{label ?? "Hello!"}</text>
      </>;
    case "book":
      return <>
        <path d="M10 28c14-6 27-5 40 4v52c-13-8-26-9-40-4Z" fill="#fffaf0" stroke="#1d8c99" strokeWidth="3" strokeLinejoin="round" />
        <path d="M90 28c-14-6-27-5-40 4v52c13-8 26-9 40-4Z" fill="#fffaf0" stroke="#1d8c99" strokeWidth="3" strokeLinejoin="round" />
        <path d="M18 40c8-2 16-2 24 2M18 50c8-2 16-2 24 2M18 60c8-2 16-2 24 2M58 42c8-4 16-4 24-2M58 52c8-4 16-4 24-2" stroke="#9cc9cf" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d="M70 14v24l5-4 5 4V14Z" fill="#ff7a6b" stroke="#e45a4b" strokeWidth="2.4" strokeLinejoin="round" />
      </>;
    case "headphones":
      return <>
        <path d="M20 56V48a30 30 0 0 1 60 0v8" stroke="#1d8c99" strokeWidth="8" strokeLinecap="round" fill="none" />
        <rect x="12" y="50" width="20" height="32" rx="9" fill="#ff7a6b" stroke="#e45a4b" strokeWidth="3" />
        <rect x="68" y="50" width="20" height="32" rx="9" fill="#ff7a6b" stroke="#e45a4b" strokeWidth="3" />
        <path d="M44 66h3l3-8 4 14 3-6h3" stroke="#7c66dc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>;
    case "pencil":
      return <>
        <path d="M70 12 88 30 38 80 16 86l6-22Z" fill="#ffc94a" stroke="#d99a17" strokeWidth="3" strokeLinejoin="round" />
        <path d="m70 12 18 18-8 8-18-18Z" fill="#ff9aa8" stroke="#e06f80" strokeWidth="3" strokeLinejoin="round" />
        <path d="m58 24 18 18" stroke="#b8c3cf" strokeWidth="5" />
        <path d="m22 64 16 16-22 6Z" fill="#f6dcb5" stroke="#d99a17" strokeWidth="3" strokeLinejoin="round" />
        <path d="m16 86 3-9 6 6Z" fill={ink} />
      </>;
    case "mic":
      return <>
        <rect x="36" y="10" width="28" height="46" rx="14" fill="#9b87ef" stroke="#6f58d6" strokeWidth="3" />
        <path d="M42 24h16M42 32h16M42 40h16" stroke="#d9d0ff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M24 46a26 26 0 0 0 52 0" stroke="#6f58d6" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M50 72v12M36 88h28" stroke="#6f58d6" strokeWidth="5" strokeLinecap="round" />
      </>;
    case "coffee":
      return <>
        <path d="M38 12c-4 6 4 8 0 14M52 10c-4 6 4 8 0 14" stroke="#b9c6d3" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M16 34h56v26c0 14-11 24-24 24h-8c-13 0-24-10-24-24Z" fill="#fff7ec" stroke="#c97b4a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M72 42h4c7 0 11 5 11 11s-4 11-11 11h-6" stroke="#c97b4a" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M44 66c-8-5-10-11-6-14 3-2 6 0 6 2 0-2 3-4 6-2 4 3 2 9-6 14Z" fill="#ff7a6b" />
      </>;
    case "bulb":
      return <>
        <path d="M50 12a26 26 0 0 0-15 47c3 2 4 5 4 8v4h22v-4c0-3 1-6 4-8a26 26 0 0 0-15-47Z" fill="#ffd95e" stroke="#e5a91f" strokeWidth="3" strokeLinejoin="round" />
        <path d="M40 76h20M42 84h16" stroke="#7a8aa0" strokeWidth="5" strokeLinecap="round" />
        <path d="M44 52c0-8 12-8 12 0M50 52v14" stroke="#e5a91f" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M38 26c3-4 7-6 11-6" stroke="#fff4c7" strokeWidth="4" strokeLinecap="round" fill="none" />
      </>;
    case "globe":
      return <>
        <circle cx="50" cy="50" r="38" fill="#7cc4f2" stroke="#3f8fd2" strokeWidth="3" />
        <path d="M30 24c8 4 6 12 14 14s6 12-2 14-6 14-14 12c-6-2-10-10-14-16M60 16c-4 8 4 10 10 12 8 2 10 10 6 16s4 14 0 18" fill="#5ec7a0" stroke="#2f9a78" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M26 34c6-10 16-16 24-16" stroke="#dff2ff" strokeWidth="4" strokeLinecap="round" fill="none" />
      </>;
    case "stamp":
      return <>
        <path d="M50 8l7 6 9-2 4 8 9 3-1 9 7 7-5 8 3 9-8 4-2 9-9 1-5 8-8-4-8 4-5-8-9-1-2-9-8-4 3-9-5-8 7-7-1-9 9-3 4-8 9 2Z" fill="#14a3ad" stroke="#0b7f88" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="#bff0f2" strokeWidth="2.6" strokeDasharray="3 5" />
        <text x="50" y="59" textAnchor="middle" className="sticker-text" fontSize={(label ?? "A+").length > 3 ? 15 : 26} fill="#fff">{label ?? "A+"}</text>
      </>;
    case "flame":
      return <>
        <path d="M50 8c4 14 22 22 22 46a22 22 0 0 1-44 0c0-12 6-18 10-24 2 8 6 10 8 10-2-12 0-22 4-32Z" fill="#ff8a3d" stroke="#e8642a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 46c2 8 12 12 12 22a12 12 0 0 1-24 0c0-8 6-10 8-16 1 4 3 4 4 4Z" fill="#ffd34d" />
      </>;
    case "check":
      return <>
        <circle cx="50" cy="50" r="38" fill="#2fb889" stroke="#1f9670" strokeWidth="3" />
        <path d="m32 51 12 12 24-26" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>;
    case "heart":
      return <>
        <path d="M50 84C26 68 12 54 12 36c0-12 9-22 21-22 8 0 13 4 17 10 4-6 9-10 17-10 12 0 21 10 21 22 0 18-14 32-38 48Z" fill="#ff7a8a" stroke="#e2566a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M24 34c0-6 4-10 9-10" stroke="#ffd2d8" strokeWidth="4" strokeLinecap="round" fill="none" />
      </>;
    case "abc":
      return <>
        <g transform="rotate(-10 26 58)"><rect x="10" y="42" width="32" height="32" rx="7" fill="#ff7a6b" stroke="#e45a4b" strokeWidth="3" /><text x="26" y="67" textAnchor="middle" className="sticker-text" fontSize="22" fill="#fff">A</text></g>
        <g transform="rotate(6 52 38)"><rect x="36" y="20" width="32" height="32" rx="7" fill="#ffc94a" stroke="#d99a17" strokeWidth="3" /><text x="52" y="45" textAnchor="middle" className="sticker-text" fontSize="22" fill={ink}>B</text></g>
        <g transform="rotate(-4 74 66)"><rect x="58" y="50" width="32" height="32" rx="7" fill="#14a3ad" stroke="#0b7f88" strokeWidth="3" /><text x="74" y="75" textAnchor="middle" className="sticker-text" fontSize="22" fill="#fff">C</text></g>
      </>;
    case "chart":
      return <>
        <rect x="10" y="12" width="80" height="76" rx="12" fill="#fff" stroke="#c9d6e2" strokeWidth="3" />
        <rect x="22" y="52" width="12" height="26" rx="3" fill="#8fd8de" />
        <rect x="40" y="38" width="12" height="40" rx="3" fill="#14a3ad" />
        <rect x="58" y="28" width="12" height="50" rx="3" fill="#ff7a6b" />
        <path d="M22 40 40 28l16 6 18-14" stroke="#7c66dc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>;
    case "calendar":
      return <>
        <rect x="12" y="18" width="76" height="70" rx="12" fill="#fff" stroke="#c9d6e2" strokeWidth="3" />
        <path d="M12 30c0-7 5-12 12-12h52c7 0 12 5 12 12v8H12Z" fill="#ff7a6b" />
        <path d="M32 10v16M68 10v16" stroke="#4a5d78" strokeWidth="5" strokeLinecap="round" />
        <path d="M26 52h8M46 52h8M66 52h8M26 68h8M46 68h8" stroke="#c9d6e2" strokeWidth="5" strokeLinecap="round" />
        <circle cx="70" cy="68" r="8" fill="#2fb889" /><path d="m66 68 3 3 5-6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </>;
    case "clock":
      return <>
        <circle cx="50" cy="52" r="36" fill="#fff" stroke="#7c66dc" strokeWidth="5" />
        <path d="M50 30v22l14 10" stroke={ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M20 22l10-8M80 22l-10-8" stroke="#7c66dc" strokeWidth="6" strokeLinecap="round" />
        <circle cx="50" cy="52" r="4" fill="#ff7a6b" />
      </>;
    case "lock":
      return <>
        <path d="M32 42V32a18 18 0 0 1 36 0v10" stroke="#9aa9bb" strokeWidth="8" fill="none" />
        <rect x="20" y="40" width="60" height="46" rx="12" fill="#d7dee8" stroke="#9aa9bb" strokeWidth="3" />
        <circle cx="50" cy="60" r="6" fill="#6f7f96" /><path d="M50 64v10" stroke="#6f7f96" strokeWidth="5" strokeLinecap="round" />
      </>;
    case "mountain":
      return <>
        <path d="M8 84 36 34l14 20 12-18 30 48Z" fill="#7cc4f2" stroke="#3f8fd2" strokeWidth="3" strokeLinejoin="round" />
        <path d="M36 34 28 48l6-2 4 4 4-6Z" fill="#fff" />
        <path d="M62 36v-24" stroke="#4a5d78" strokeWidth="3" strokeLinecap="round" />
        <path d="M62 12h18l-5 6 5 6H62Z" fill="#ff7a6b" />
      </>;
    case "rocket":
      return <>
        <path d="M60 14c14-4 24-2 26 0 2 2 4 12 0 26L58 68 32 42Z" fill="#fff" stroke="#7c66dc" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="64" cy="36" r="8" fill="#7cc4f2" stroke="#7c66dc" strokeWidth="3" />
        <path d="M32 42 18 40l12-14h16ZM58 68l2 14 14-12V54Z" fill="#ff7a6b" stroke="#e45a4b" strokeWidth="3" strokeLinejoin="round" />
        <path d="M34 66c-6 0-14 4-18 18 14-4 18-12 18-18Z" fill="#ffc94a" stroke="#e8a21c" strokeWidth="3" strokeLinejoin="round" />
      </>;
    case "newspaper":
      return <>
        <rect x="14" y="16" width="66" height="70" rx="8" fill="#fff" stroke="#c9d6e2" strokeWidth="3" />
        <path d="M80 34h6v42c0 6-4 10-10 10" stroke="#c9d6e2" strokeWidth="3" fill="#eef3f8" strokeLinejoin="round" />
        <rect x="24" y="26" width="46" height="10" rx="3" fill={ink} />
        <rect x="24" y="44" width="20" height="18" rx="3" fill="#ffc94a" />
        <path d="M50 46h20M50 54h20M24 70h46M24 78h34" stroke="#b5c3d1" strokeWidth="3.4" strokeLinecap="round" />
      </>;
    case "notebook":
      return <>
        <rect x="20" y="10" width="62" height="80" rx="10" fill="#14a3ad" stroke="#0b7f88" strokeWidth="3" />
        <path d="M30 10v80" stroke="#0b7f88" strokeWidth="3" />
        <rect x="40" y="26" width="32" height="16" rx="4" fill="#fffaf0" />
        <path d="M14 26h12M14 42h12M14 58h12M14 74h12" stroke="#4a5d78" strokeWidth="5" strokeLinecap="round" />
        <path d="M60 90V70l6 5 6-5v20" fill="#ffc94a" />
      </>;
  }
}

export function Sticker({
  name,
  size = 64,
  tilt = 0,
  label,
  float = false,
  pop = true,
  delay = 0,
  className = "",
  style,
}: {
  name: StickerName;
  size?: number;
  tilt?: number;
  label?: string;
  float?: boolean;
  pop?: boolean;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const classes = ["sticker", float ? "is-floating" : "", pop ? "is-popping" : "", className].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      style={{ "--tilt": `${tilt}deg`, "--delay": `${delay}ms`, width: size, height: size, ...style } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" focusable="false">
        <g filter="url(#sticker-diecut)">{art(name, label)}</g>
      </svg>
    </span>
  );
}

/** Washi tape strip for pinning cards; purely decorative. */
export function Tape({ tone = "teal", className = "" }: { tone?: "teal" | "sun" | "coral" | "lilac"; className?: string }) {
  return <span className={`washi washi-${tone} ${className}`.trim()} aria-hidden="true" />;
}

/** Hand-drawn doodles used next to headings and in empty space. */
export function Doodle({ name, className = "" }: { name: "underline" | "arrow" | "swirl" | "dots"; className?: string }) {
  const paths = {
    underline: <path d="M4 14c30-8 62-10 92-6 30 4 58 2 96-6" />,
    arrow: <><path d="M6 10c22 2 42 14 50 36" /><path d="m44 40 12 8 4-14" /></>,
    swirl: <path d="M10 30c10-20 34-22 40-8 6 14-14 22-18 10-4-12 18-24 34-14 10 6 12 16 26 14" />,
    dots: <><circle cx="8" cy="8" r="3" /><circle cx="24" cy="16" r="3" /><circle cx="12" cy="28" r="3" /></>,
  } as const;
  const viewBox = { underline: "0 0 200 20", arrow: "0 0 64 56", swirl: "0 0 100 44", dots: "0 0 32 32" }[name];
  return (
    <svg className={`doodle doodle-${name} ${className}`.trim()} viewBox={viewBox} aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/** Rendered once in the root layout; provides the shared die-cut filter. */
export function StickerDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="sticker-diecut" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3.6" result="grown" />
          <feFlood floodColor="#ffffff" />
          <feComposite in2="grown" operator="in" result="outline" />
          <feMerge>
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
