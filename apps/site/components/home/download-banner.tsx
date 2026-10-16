import { AppStoreBadge } from "@/components/app-store-badge";
import { PhoneShot } from "@/components/phone-shot";
import { Container } from "@/components/ui/container";
import historyShot from "@/public/screens/history.png";
import planShot from "@/public/screens/plan.png";

function DownloadBanner() {
  return (
    <section
      aria-labelledby="download-heading"
      className="w-full scroll-mt-24"
      id="download"
    >
      <Container>
        <div className="grid items-center gap-10 overflow-hidden rounded-3xl border bg-secondary px-6 pt-12 md:grid-cols-[1.2fr_1fr] md:px-12">
          <div className="flex flex-col items-center gap-6 text-center md:items-start md:pb-12 md:text-left">
            <h2
              className="text-balance font-bold text-3xl tracking-tight sm:text-4xl"
              id="download-heading"
            >
              Your next workout{" "}
              <span className="text-primary">starts here</span>
            </h2>
            <p className="max-w-md text-pretty text-lg text-muted-foreground">
              Download Fitme for iPhone, set your goal and get a plan you can
              start today.
            </p>
            <AppStoreBadge />
          </div>
          <div className="flex h-72 items-start justify-center gap-4 sm:h-96">
            <div className="w-40 sm:w-52">
              <PhoneShot
                alt="History: finished workouts over the past weeks with their duration and volume"
                sizes="208px"
                src={historyShot}
              />
            </div>
            <div className="mt-12 hidden w-40 sm:block sm:w-52">
              <PhoneShot
                alt="Plan detail: the four workouts of an Upper / Lower plan"
                sizes="208px"
                src={planShot}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export { DownloadBanner };
