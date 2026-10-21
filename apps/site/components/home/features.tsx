import {
  Check,
  type LucideIcon,
  MessagesSquare,
  PersonStanding,
  Repeat,
  Ruler,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import type { StaticImageData } from "next/image";

import { PhoneShot } from "@/components/phone-shot";
import { SectionHeading } from "@/components/section-heading";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import progressShot from "@/public/screens/exercise-progress.png";
import libraryShot from "@/public/screens/library-chest.png";
import loggingShot from "@/public/screens/session-logging.png";
import summaryShot from "@/public/screens/session-summary.png";

interface Feature {
  alt: string;
  description: string;
  eyebrow: string;
  points: string[];
  shot: StaticImageData;
  title: string;
}

const features: Feature[] = [
  {
    alt: "Logging sets for Barbell Bent-over Row: three sets ticked, the fourth ready with 70 kg for 8 reps",
    description:
      "Every set comes filled in with its target from your plan. Lift, tick it off, rest and go again.",
    eyebrow: "Workout tracker",
    points: [
      "Target weight and reps on every set",
      "Recommended rest between sets",
      "Add or edit a set mid-workout",
    ],
    shot: loggingShot,
    title: "Log every set in a tap",
  },
  {
    alt: "Workout Complete summary: 59 minutes, 8419 kg volume, 6 exercises, 20 sets, a muscle map and trophies on two exercises",
    description:
      "Finish a workout and see what it added up to: time, total volume, sets, the muscles you worked and any new personal records.",
    eyebrow: "Workout summary",
    points: [
      "Duration, volume and set count",
      "Muscle map of what you trained",
      "Trophies on personal records",
    ],
    shot: summaryShot,
    title: "See what every session was worth",
  },
  {
    alt: "Exercise history for Barbell Bent-over Row: 65 kg, then 67.5 kg, then 70 kg over three weeks",
    description:
      "Each exercise keeps every set you've ever logged, so you know what to lift today and can see how far you've come.",
    eyebrow: "Progress",
    points: [
      "Every logged set, newest first",
      "Last week's numbers while you train",
      "Kilograms or pounds, your call",
    ],
    shot: progressShot,
    title: "Watch your lifts go up",
  },
  {
    alt: "Exercise library filtered to Chest: bench presses, flies and dumbbell presses, each with an illustration",
    description:
      "A library of 75+ gym exercises, each with an illustration of the movement, the muscles it works and how to do it right.",
    eyebrow: "Exercise library",
    points: [
      "Browse by muscle group",
      "Step-by-step instructions",
      "Your own history on every exercise",
    ],
    shot: libraryShot,
    title: "Know every movement",
  },
];

interface Extra {
  description: string;
  icon: LucideIcon;
  title: string;
}

const extras: Extra[] = [
  {
    description:
      "Finish a workout and the next one in your plan moves up. Miss a day and nothing breaks.",
    icon: Repeat,
    title: "Workouts in rotation",
  },
  {
    description:
      "Beat your best and the summary marks it with a trophy, so the wins don't slip by.",
    icon: Trophy,
    title: "Personal records",
  },
  {
    description:
      "See which muscles each workout hit, front and back, right after you finish.",
    icon: PersonStanding,
    title: "Muscle map",
  },
  {
    description:
      "Metric, US or UK units. Switch any time and your history converts with you.",
    icon: Ruler,
    title: "Your units",
  },
  {
    description:
      "Connect your Fitme account in ChatGPT to search exercises, manage plans and log sets.",
    icon: MessagesSquare,
    title: "Works in ChatGPT",
  },
  {
    description:
      "Delete your account in the app and your plans, workouts and Coach chats go with it.",
    icon: ShieldCheck,
    title: "Your data, your call",
  },
];

function FeatureRow({
  feature,
  reversed,
}: {
  feature: Feature;
  reversed: boolean;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div
        className={cn(
          "flex flex-col items-start gap-5",
          reversed && "md:order-last"
        )}
      >
        <p className="text-footnote-emphasized text-muted-foreground uppercase">
          {feature.eyebrow}
        </p>
        <h3 className="text-balance text-foreground text-title-2-emphasized">
          {feature.title}
        </h3>
        <p className="text-pretty text-body text-muted-foreground">
          {feature.description}
        </p>
        <ul className="flex flex-col gap-3">
          {feature.points.map((point) => (
            <li className="flex items-start gap-3" key={point}>
              <Check
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-primary"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex h-96 justify-center overflow-hidden rounded-3xl border bg-secondary px-6 pt-10 sm:h-112 md:px-10">
        <div className="w-60 lg:w-72">
          <PhoneShot
            alt={feature.alt}
            sizes="(min-width: 1024px) 288px, 240px"
            src={feature.shot}
          />
        </div>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section
      aria-labelledby="features-heading"
      className="w-full scroll-mt-24"
      id="features"
    >
      <Container className="flex flex-col gap-16 sm:gap-24">
        <SectionHeading
          description="Plan, train, log and look back, all in one app built for the gym floor."
          eyebrow="Features"
          id="features-heading"
          title="Everything you need between the first rep and the last"
        />
        {features.map((feature, index) => (
          <FeatureRow
            feature={feature}
            key={feature.title}
            reversed={index % 2 === 1}
          />
        ))}
        <ul className="grid gap-px overflow-hidden rounded-3xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {extras.map((extra) => (
            <li
              className="flex flex-col gap-3 bg-secondary p-6"
              key={extra.title}
            >
              <extra.icon aria-hidden="true" className="size-6 text-primary" />
              <h3 className="text-foreground text-title-3-emphasized">
                {extra.title}
              </h3>
              <p className="text-muted-foreground">{extra.description}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export { Features };
