"use client";

import { AccountAvatar } from "./account-avatar";
import { isAvatarFrame, type AvatarFrameId } from "@/lib/gamification";
import "./avatar-frame.css";

export function AvatarFrame({ avatar, frame, size, alt }: { avatar: string; frame?: string | null; size: number; alt?: string }) {
  const selected: AvatarFrameId = isAvatarFrame(frame) ? frame : "classic";
  return <span className={`avatar-frame avatar-frame--${selected}`} style={{ width: size, height: size }}>
    <AccountAvatar value={avatar} size={Math.round(size * 0.76)} alt={alt} />
  </span>;
}
