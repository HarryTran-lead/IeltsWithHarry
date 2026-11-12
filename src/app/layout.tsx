import type { Metadata } from "next";
// Global styles. The order is the cascade order: later files win ties, so add rules to
// the partial where they belong rather than at the end. Tokens come first; globals.css
// carries Tailwind and the theme mapping (Tailwind's own rules sit in @layer, so the
// unlayered tokens still apply).
import "@/styles/tokens.css";
import "./globals.css";
import "@/styles/base.css";
import "@/styles/app-shell.css";
import "@/styles/components.css";
import "@/styles/dashboard.css";
import "@/styles/portal-pages.css";
import "@/styles/portal-responsive.css";
import "@/styles/public-site.css";
import "@/styles/guest-landing.css";
import "@/styles/auth.css";
import "@/styles/public-responsive.css";
import "@/styles/content-lab.css";
import "@/styles/admin.css";
import "@/styles/learn.css";
import "@/styles/course-studio.css";
import "@/styles/layout-overrides.css";
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
