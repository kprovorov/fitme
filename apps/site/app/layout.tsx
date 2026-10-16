import type { Metadata } from "next";
import "./globals.css";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Nunito_Sans } from "next/font/google";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { MainBox } from "@/components/mainbox";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  description:
    "Fitme is your AI-powered workout tracker and fitness coach. Generate personalized plans, track progress, and achieve your goals with our iPhone app",
  itunes: {
    appId: process.env.NEXT_PUBLIC_APPSTORE_ID || "",
  },
  keywords:
    "fitness, workout, workout tracker, fitness coach, iPhone app, workout app, workout planner, workout routine, workout schedule, workout timer, workout log, workout history, workout progress, workout goal, workout goal progress, workout goal history, workout goal schedule, workout goal timer, workout goal log, workout goal history, workout goal progress",
  metadataBase: new URL("https://fitmeproject.com"),
  openGraph: {
    url: "https://fitmeproject.com",
  },
  title: "Fitme Project — AI Workout Tracker & Fitness Coach for iPhone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="motion-safe:scroll-smooth" lang="en">
      <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID || ""} />
      <body className={`${nunitoSans.className} dark antialiased`}>
        <Header />
        <MainBox>{children}</MainBox>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
