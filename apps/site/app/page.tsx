import { Coach } from "@/components/home/coach";
import { DownloadBanner } from "@/components/home/download-banner";
import { Faq } from "@/components/home/faq";
import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";

export default function Home() {
  return (
    <div className="flex w-full flex-col gap-24 sm:gap-32">
      <Hero />
      <HowItWorks />
      <Features />
      <Coach />
      <Faq />
      <DownloadBanner />
    </div>
  );
}
