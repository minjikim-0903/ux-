import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans_KR({ variable: "--font-sans", weight: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "머뭇 · 이탈 진단",
  description: "URL을 넣으면 가입·결제 플로우의 이탈 이유를 행동심리 기준으로 진단해요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
