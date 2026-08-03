import type { Metadata, Viewport } from "next";
import { DM_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["300", "400", "500"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: ["400", "500", "600"],
  display: "swap",
});

const SITE_URL = "https://ask-leo-seven.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Leonardo Diman — Frontend Developer",
  description:
    "Mid-level Frontend Developer with 5 years of experience building mobile-first products. Open to international remote opportunities.",
  keywords: [
    "Frontend Developer",
    "React",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "Remote",
    "Brazil",
  ],
  authors: [{ name: "Leonardo Diman", url: SITE_URL }],
  openGraph: {
    title: "Leonardo Diman — Frontend Developer",
    description:
      "Mid-level Frontend Developer with 5 years of experience. Open to remote opportunities.",
    url: SITE_URL,
    siteName: "Leonardo Diman",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Leonardo Diman — Frontend Developer",
    description:
      "Mid-level Frontend Developer with 5 years of experience. Open to remote opportunities.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0c0b",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmMono.variable} ${instrumentSans.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}