import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Archivo, Nunito_Sans } from "next/font/google";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { MainBox } from "@/components/mainbox";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
});

// Display face: Archivo's condensed, heavy cut for headlines (see `display-type`).
const archivo = Archivo({
  axes: ["wdth"],
  subsets: ["latin"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  description:
    "Fitme builds your strength plan, tracks every set and gives you an AI Coach that knows your training. Workout planner and tracker for iPhone.",
  itunes: {
    appId: process.env.NEXT_PUBLIC_APPSTORE_ID || "",
  },
  metadataBase: new URL("https://fitmeproject.com"),
  openGraph: {
    url: "https://fitmeproject.com",
  },
  title: "Fitme: AI workout planner, tracker and Coach for iPhone",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#1f1f1f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="dark" lang="en">
      <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID || ""} />
      <body
        className={`${nunitoSans.className} ${nunitoSans.variable} ${archivo.variable} antialiased`}
      >
        <Header />
        <MainBox>{children}</MainBox>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
