type ReadingTool = "highlight" | "note" | "lookup" | "translate" | "notebook" | "erase";

/** Small original vector stickers: crisp at toolbar size, with a white cutout edge. */
export function ReadingToolSticker({ tool }: { tool: ReadingTool }) {
  return <svg className="bt-tool-sticker" viewBox="0 0 40 40" width="26" height="26" fill="none" aria-hidden="true" focusable="false">
    <path d="M10 3Q5 3 4 9L2 26Q2 34 10 36L28 38Q36 38 37 30L38 12Q38 5 30 4Z" fill="white" />
    <g stroke="#244052" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {tool === "highlight" && <>
        <path d="M6 32H28" stroke="#F4CB4D" strokeWidth="5" />
        <g transform="rotate(32 22 19)"><path d="M16 7Q16 5 18 5H25Q27 5 27 7V25H16Z" fill="#FFE17A" /><path d="M16 12H27V17H16Z" fill="#FFBE55" /><path d="M18 25H25L24 32H18Z" fill="#50BFA8" /><path d="M18 32H24" /></g>
      </>}
      {tool === "note" && <>
        <path d="M7 6H32V26L23 34H7Z" fill="#FFE296" /><path d="M23 34V26H32" fill="#F6BA6F" />
        <path d="M12 13H25M12 18H21" /><path d="M28 17V25M24 21H32" stroke="#B25D33" strokeWidth="2.5" />
      </>}
      {tool === "lookup" && <>
        <path d="M8 6H26Q29 6 29 9V33H10Q6 33 6 29V10Q6 6 8 6Z" fill="#A6D2FF" /><path d="M11 6V28M7 28H26" />
        <path d="M15 20L19 11L23 20M17 17H21" stroke="#315D97" />
        <circle cx="28" cy="26" r="6" fill="#F2FBFF" /><path d="M32 31L36 35" strokeWidth="3" />
      </>}
      {tool === "translate" && <>
        <path d="M5 6H24V23H12L6 28V23H5Z" fill="#C9B8F4" /><path d="M16 17H35V33H31L30 37L25 33H16Z" fill="#9DE0CE" />
        <path d="M9 18L13 10L17 18M11 15H15" stroke="#69539C" /><path d="M21 23L25 29L30 22" stroke="#247F6D" />
      </>}
      {tool === "notebook" && <>
        <rect x="8" y="5" width="25" height="30" rx="4" fill="#F6B6BD" /><path d="M13 5V35" stroke="#C46C80" /><path d="M6 11H11M6 18H11M6 25H11" strokeWidth="3" />
        <rect x="17" y="11" width="11" height="14" rx="2" fill="#FFF8EE" /><path d="M20 16H25M20 20H24" />
      </>}
      {tool === "erase" && <>
        <path d="M6 23L21 7Q23 5 25 7L34 15Q36 17 34 19L20 34H16Z" fill="#F5A5B8" /><path d="M6 23L14 15L28 26L20 34H16Z" fill="#BBD9F4" /><path d="M21 35H35" stroke="#94A5AE" /><path d="M6 10L7 7M11 11L14 10" stroke="#E9AE44" />
      </>}
    </g>
  </svg>;
}
