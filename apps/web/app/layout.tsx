import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Nunito_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "~/components/providers";
import { clerkAppearance } from "~/lib/clerk-appearance";
import { DASHBOARD_PATH, SIGN_IN_PATH } from "~/lib/routes";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--next-font-nunito-sans",
  weight: ["400", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--next-font-ibm-plex-mono",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  description: "Your AI-powered training plans, on the web.",
  title: "Fitme",
};

// Dark only, whatever the OS setting (ADR 0009).
export const viewport: Viewport = { colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${nunitoSans.variable} ${ibmPlexMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <ClerkProvider
          afterSignOutUrl="/"
          appearance={clerkAppearance}
          signInFallbackRedirectUrl={DASHBOARD_PATH}
          signInUrl={SIGN_IN_PATH}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
