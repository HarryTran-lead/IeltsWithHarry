import type { ReactNode } from "react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";

/**
 * Compact page header shared by portal pages: one short band with a small
 * sticker, the title and its actions, so the page content starts near the top.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  sticker,
  actions,
  children,
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  sticker?: StickerName;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-head ${className}`.trim()}>
      {sticker && <Sticker name={sticker} size={52} tilt={-6} />}
      <div className="page-head-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
      {children && <div className="page-head-extra">{children}</div>}
    </header>
  );
}
