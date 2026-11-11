import type { Metadata } from "next";
import "./globals.css";
import "./stickers.css";
import "./motion.css";
import "./playful.css";
import "./page-head.css";
import "./buttons.css";
import { Be_Vietnam_Pro, Bricolage_Grotesque, Patrick_Hand } from "next/font/google";
import { StickerDefs } from "@/components/stickers/stickers";
import { InteractionLayer } from "@/components/fx/interaction-layer";
import { cn } from "@/lib/utils";

const body = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});
const hand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-hand",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "IeltsWithHarry — Small steps, big progress",
  description:
    "Learn English and IELTS with Harry: lessons, daily news, vocabulary, a study notebook and a shared study room.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en"className={cn("font-sans", body.variable, display.variable, hand.variable)}>
      <body>
        <StickerDefs />
        <InteractionLayer />
        {children}
      </body>
    </html>
  );
}
