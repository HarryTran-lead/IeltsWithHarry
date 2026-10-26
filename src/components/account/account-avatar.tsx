"use client";

import Image from "next/image";
import { Sticker } from "@/components/stickers/stickers";
import { avatarPhotoUrl, isAvatar } from "@/lib/account";
import "./account.css";

export function AccountAvatar({ value, size, alt = "Ảnh đại diện" }: { value: string; size: number; alt?: string }) {
  const photo = avatarPhotoUrl(value);
  return <span className="account-avatar-art" style={{ width: size, height: size }}>
    <Sticker name={isAvatar(value) ? value : "harry"} size={size} pop={false} />
    {photo && <Image src={photo} alt={alt} width={size} height={size} sizes={`${size}px`} onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
}
