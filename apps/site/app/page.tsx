import Link from "next/link";
import type { ReactNode } from "react";
import { AppStoreBadge } from "@/components/app-store-badge";
import { Phone } from "@/components/phone";
import { cn } from "@/lib/utils";

const steps = [
  {
    body: "Pick a goal, your experience, how many days a week you train and how long a session runs.",
    title: "Tell Fitme what you’re training for",
  },
  {
    body: "Fitme builds a split with exercises, sets, reps and target weights, and makes it your active plan.",
    title: "Get a plan made for you",
  },
  {
    body: "Log each set as you go and finish. The workout you just did moves to the back of the rotation.",
    title: "Train and log every set",
  },
  {
    body: "Ask the Coach to swap an exercise, add a set or change a target. It edits the plan for you.",
    title: "Adjust as you go",
  },
];

const coachAsks = [
  "My lower back is sore. Swap the rows for something easier on it.",
  "My bench has stalled at 70 kg for three weeks. What should I change?",
  "Add a fourth set of pull-ups to Upper B.",
  "How did my squat sessions go this month?",
];

const extras = [
  {
    body: "Kilograms and centimetres, or pounds and inches. Switch any time and every stored weight converts with you.",
    title: "Metric, US or UK units",
  },
  {
    body: "Keep more than one plan and switch which one is active. Your history stays with you.",
    title: "Several plans, one active",
  },
  {
    body: "Every finished workout is kept, set by set, so you can look back at any session.",
    title: "Your whole history",
  },
  {
    body: "Made for iPhone, in the iOS design you already know: native headers, sheets and Liquid Glass.",
    title: "Built for iPhone",
  },
];

export default function Home() {
  return (
    <div className="w-full" data-bleed>
      <Hero />
      <HowItWorks />
      <Feature
        body="Tell Fitme your goal, your experience, where you train, how long you have and how many days a week. Add a note for anything it should know, like a bad shoulder. It builds a split around all of that."
        image={{
          alt: "The plan builder with goal, experience and duration filled in",
          src: "/screens/planner.jpg",
        }}
        tag="Fitme Pro"
        title="A plan built around your week"
      />
      <Coach />
      <Training />
      <Feature
        body="Browse exercises by muscle group. Each one shows how it’s done, with an animation, the muscles it works and step-by-step instructions, so you get the form right before you add weight."
        image={{
          alt: "Bench press with an animation and step-by-step instructions",
          src: "/screens/exercise.jpg",
        }}
        reverse
        title="Know how every lift should feel"
      />
      <Extras />
      <ChatGpt />
      <ClosingCall />
    </div>
  );
}

function Hero() {
  return (
    <section className="container grid gap-16 pt-12 pb-24 lg:grid-cols-[1fr_auto] lg:gap-20 lg:pt-20">
      <div className="max-w-2xl lg:pt-16">
        <h1 className="display-type text-balance text-6xl text-foreground sm:text-7xl xl:text-8xl">
          Walk into the gym knowing what to lift
        </h1>
        <p className="mt-8 max-w-xl text-pretty text-lg text-muted-foreground leading-relaxed sm:text-xl">
          Fitme builds your strength plan, has your next workout ready when you
          open the app and remembers every set, so each session starts where
          the last one ended.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
          <AppStoreBadge />
          <span className="text-muted-foreground text-sm">
            Free to download. AI plans and the Coach come with Fitme Pro.
          </span>
        </div>
      </div>
      <div className="hero-phone mx-auto w-64 sm:w-72 lg:w-88">
        <Phone
          alt="Fitme Home tab with the active plan and the workout in progress"
          priority
          sizes="(min-width: 1024px) 352px, 288px"
          src="/screens/home.jpg"
        />
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="bg-secondary">
      <div className="container py-20 lg:py-28">
        <h2
          className="display-type max-w-3xl text-balance text-4xl text-foreground sm:text-5xl"
          id="how-heading"
        >
          From a goal to your first set in a couple of minutes
        </h2>
        <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li className="border-primary border-t-2 pt-6" key={step.title}>
              <span
                aria-hidden="true"
                className="display-type text-5xl text-primary"
              >
                {index + 1}
              </span>
              <h3 className="mt-4 font-bold text-foreground text-xl">
                {step.title}
              </h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

interface FeatureProps {
  body: string;
  image: { alt: string; src: string };
  reverse?: boolean;
  tag?: string;
  title: string;
}

function Feature({ body, image, reverse, tag, title }: FeatureProps) {
  return (
    <section className="container grid items-center gap-14 py-20 lg:grid-cols-2 lg:gap-24 lg:py-28">
      <div className={cn("max-w-xl", reverse && "lg:order-2")}>
        {tag ? <ProTag>{tag}</ProTag> : null}
        <h2 className="display-type text-balance text-4xl text-foreground sm:text-5xl">
          {title}
        </h2>
        <p className="mt-6 text-pretty text-lg text-muted-foreground leading-relaxed">
          {body}
        </p>
      </div>
      <div
        className={cn(
          "mx-auto w-60 sm:w-72",
          reverse && "lg:order-1 lg:justify-self-start"
        )}
      >
        <Phone alt={image.alt} sizes="288px" src={image.src} />
      </div>
    </section>
  );
}

function Coach() {
  return (
    <section aria-labelledby="coach-heading" className="bg-secondary">
      <div className="container grid gap-12 py-20 lg:grid-cols-[1fr_1.2fr] lg:gap-24 lg:py-28">
        <div className="max-w-xl">
          <ProTag>Fitme Pro</ProTag>
          <h2
            className="display-type text-balance text-4xl text-foreground sm:text-6xl"
            id="coach-heading"
          >
            A coach that has read your training log
          </h2>
          <p className="mt-6 text-pretty text-lg text-muted-foreground leading-relaxed">
            The Coach knows your profile, your active plan and your recent
            workouts, so its answers are about your training, not training in
            general. When the answer is a change, it makes it in your plan right
            there in the chat. Pick the model it runs on: OpenAI’s GPT or
            Anthropic’s Claude.
          </p>
        </div>
        <figure>
          <figcaption className="text-muted-foreground">
            Things you can ask it
          </figcaption>
          <ul className="mt-4 divide-y divide-border border-border border-y">
            {coachAsks.map((ask) => (
              <li
                className="py-5 font-semibold text-foreground text-xl leading-snug sm:text-2xl"
                key={ask}
              >
                “{ask}”
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </section>
  );
}

function Training() {
  return (
    <section
      aria-labelledby="training-heading"
      className="container grid items-center gap-14 py-20 lg:grid-cols-2 lg:gap-24 lg:py-28"
    >
      <div className="max-w-xl">
        <h2
          className="display-type text-balance text-4xl text-foreground sm:text-5xl"
          id="training-heading"
        >
          Log a set in the time it takes to rack the bar
        </h2>
        <p className="mt-6 text-pretty text-lg text-muted-foreground leading-relaxed">
          Each set opens with its target weight, reps and rest. Tap to log it,
          and see what you lifted for the same exercise last week right below.
          When the last set is in, Fitme offers to finish.
        </p>
        <p className="mt-4 text-pretty text-lg text-muted-foreground leading-relaxed">
          Then you get the numbers: how long it took, the volume you moved, the
          muscles you worked, and a trophy for every new personal record.
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-md justify-center pb-10">
        <Phone
          alt="Logging sets of barbell rows with weight, reps and rest"
          className="w-[46%] translate-y-10"
          sizes="(min-width: 1024px) 224px, 46vw"
          src="/screens/session.jpg"
        />
        <Phone
          alt="Workout summary with duration, volume and a muscle map"
          className="-ml-[6%] w-[46%]"
          sizes="(min-width: 1024px) 224px, 46vw"
          src="/screens/summary.jpg"
        />
      </div>
    </section>
  );
}

function Extras() {
  return (
    <section
      aria-labelledby="extras-heading"
      className="border-border border-t"
    >
      <div className="container py-20 lg:py-28">
        <h2
          className="display-type text-4xl text-foreground sm:text-5xl"
          id="extras-heading"
        >
          And the small things
        </h2>
        <dl className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {extras.map((extra) => (
            <div key={extra.title}>
              <dt className="font-bold text-foreground text-lg">
                {extra.title}
              </dt>
              <dd className="mt-2 text-muted-foreground leading-relaxed">
                {extra.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ChatGpt() {
  return (
    <section
      aria-labelledby="chatgpt-heading"
      className="border-border border-t"
    >
      <div className="container grid gap-4 py-14 lg:grid-cols-[1fr_2fr] lg:gap-24">
        <h2 className="font-bold text-foreground text-xl" id="chatgpt-heading">
          Fitme for ChatGPT
        </h2>
        <div className="max-w-2xl space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Connect your Fitme account to search exercises, manage training
            plans, log workout sets, and review your workout history in ChatGPT.
            Your changes are saved to the same Fitme account you use in the app.
            The Fitme connection is free and requires sign-in.
          </p>
          <p>
            Provided by Kyrylo Provorov. See our{" "}
            <TextLink href="/support">support page</TextLink> for help, or read
            our <TextLink href="/privacy-policy">privacy policy</TextLink> and{" "}
            <TextLink href="/terms">terms of service</TextLink>.
          </p>
        </div>
      </div>
    </section>
  );
}

function ClosingCall() {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="container flex flex-col items-start gap-10 py-20 lg:flex-row lg:items-end lg:justify-between lg:py-28">
        <h2 className="display-type max-w-3xl text-balance text-5xl sm:text-7xl">
          Your next workout is already planned
        </h2>
        <AppStoreBadge className="shrink-0 focus-visible:outline-primary-foreground" />
      </div>
    </section>
  );
}

function ProTag({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 inline-block rounded-full border border-primary/50 px-3 py-1 font-semibold text-primary text-sm">
      {children}
    </p>
  );
}

function TextLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="rounded-sm text-foreground underline decoration-primary underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
      href={href}
    >
      {children}
    </Link>
  );
}
