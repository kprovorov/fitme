import { ArrowDown } from "lucide-react";

import { AppStoreBadge } from "@/components/app-store-badge";
import { PhoneShot } from "@/components/phone-shot";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import homeShot from "@/public/screens/home.png";
import plannerShot from "@/public/screens/planner.png";
import sessionShot from "@/public/screens/session-active.png";

function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="w-full">
      <Container className="flex flex-col items-center gap-12 sm:gap-16">
        <div className="flex max-w-3xl flex-col items-center gap-6 text-center">
          <p className="rounded-full border px-3 py-1 font-semibold text-muted-foreground text-sm">
            AI workout tracker for iPhone
          </p>
          <h1
            className="text-balance font-bold text-4xl text-foreground tracking-tight sm:text-6xl"
            id="hero-heading"
          >
            Train with a plan <span className="text-primary">made for you</span>
          </h1>
          <p className="max-w-xl text-pretty text-lg text-muted-foreground sm:text-xl">
            Fitme builds your workout plan, tracks every set and shows how your
            lifts grow week after week. Ask the AI Coach anything along the way.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <AppStoreBadge />
            <Button asChild size="lg" variant="ghost">
              <a href="#features">
                See what&apos;s inside
                <ArrowDown aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>

        <div className="flex w-full items-end justify-center gap-4 lg:gap-10">
          <div className="hidden w-52 sm:block lg:w-64">
            <PhoneShot
              alt="Fitme planner: pick a goal, experience level, workout length and place"
              sizes="(min-width: 1024px) 256px, 208px"
              src={plannerShot}
            />
          </div>
          <div className="w-64 lg:w-80">
            <PhoneShot
              alt="Fitme home screen: the active Upper / Lower plan with the workout in progress and the next workouts"
              priority
              sizes="(min-width: 1024px) 320px, 256px"
              src={homeShot}
            />
          </div>
          <div className="hidden w-52 sm:block lg:w-64">
            <PhoneShot
              alt="A workout in progress: bench press done, rows at three of four sets, the timer running"
              sizes="(min-width: 1024px) 256px, 208px"
              src={sessionShot}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

export { Hero };
