import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackHost } from "@/components/feedback";
import { NavigationProgress } from "@/components/navigation-progress";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Papersmith",
  description: "Build exam papers from Edexcel International GCSE past papers.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className={`min-h-screen bg-zinc-50 font-sans text-foreground antialiased`}>
        <NavigationProgress />
        {children}
        <FeedbackHost />
      </body>
    </html>
  );
}
