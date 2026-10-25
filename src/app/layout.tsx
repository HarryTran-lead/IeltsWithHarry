import type { Metadata } from "next";
import "./globals.css";
import "./news.css";
import "./study-room.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "IeltsWithHarry — Small steps, big progress",
  description:
    "Learn English and IELTS with Harry: lessons, daily news, vocabulary, a study notebook and a shared study room.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
