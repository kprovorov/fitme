import { IconCheck } from "@tabler/icons-react";

import { PhoneShot } from "@/components/phone-shot";
import { Container } from "@/components/ui/container";
import coachShot from "@/public/screens/coach-models.png";

const points = [
  "Builds your plan from your goal, schedule and experience",
  "Swaps exercises, adds sets and changes targets when you ask",
  "Knows your profile, your plan and your past workouts",
  "Answers questions on form, recovery and programming",
];

function Coach() {
  return (
    <section
      aria-labelledby="coach-heading"
      className="w-full scroll-mt-24"
      id="coach"
    >
      <Container>
        <div className="grid items-center gap-10 overflow-hidden rounded-3xl border bg-secondary px-6 pt-10 md:grid-cols-2 md:gap-16 md:px-12 md:pt-12">
          <div className="flex flex-col items-start gap-5 md:pb-12">
            <p className="rounded-full border border-primary/40 px-3 py-1 text-footnote-emphasized text-primary">
              Fitme Pro
            </p>
            <h2
              className="text-balance font-bold text-display-2 tracking-tight sm:text-display-1"
              id="coach-heading"
            >
              An AI Coach that knows your training
            </h2>
            <p className="text-pretty text-body text-muted-foreground">
              Chat with a Coach that can read your plan and history and change
              them for you. You pick the model that answers, from GPT to Claude:
              a quick one for short questions, a thorough one for a deep look at
              your program.
            </p>
            <ul className="flex flex-col gap-3">
              {points.map((point) => (
                <li className="flex items-start gap-3" key={point}>
                  <IconCheck
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-primary"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center">
            <div className="w-60 lg:w-72">
              <PhoneShot
                alt="The Coach's model picker: GPT-5.5, GPT-5.6 variants, Claude Sonnet 5, Claude Opus 5 and Claude Haiku 4.5"
                className="-mb-px"
                sizes="(min-width: 1024px) 288px, 240px"
                src={coachShot}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export { Coach };
