import { IconCheck } from "@tabler/icons-react";

import { PhoneShot } from "@/components/phone-shot";
import { Container } from "@/components/ui/container";
import arnoldShot from "@/public/screens/arnold-models.png";

const points = [
  "Builds your plan from your goal, schedule and experience",
  "Swaps exercises, adds sets and changes targets when you ask",
  "Knows your profile, your plan and your past workouts",
  "Answers questions on form, recovery and programming",
];

function Arnold() {
  return (
    <section
      aria-labelledby="arnold-heading"
      className="w-full scroll-mt-24"
      id="arnold"
    >
      <Container>
        <div className="bg-secondary grid items-center gap-10 overflow-hidden rounded-3xl border px-6 pt-10 md:grid-cols-2 md:gap-16 md:px-12 md:pt-12">
          <div className="flex flex-col items-start gap-5 md:pb-12">
            <p className="border-primary/40 text-footnote-emphasized text-primary rounded-full border px-3 py-1">
              Fitme Pro
            </p>
            <h2
              className="text-display-2 sm:text-display-1 font-bold tracking-tight text-balance"
              id="arnold-heading"
            >
              Meet Arnold, your AI fitness coach
            </h2>
            <p className="text-body text-muted-foreground text-pretty">
              Arnold is Fitme's AI. It reads your plan and history, and changes
              them for you when you ask. You pick the model that answers, from
              GPT to Claude: a quick one for short questions, a thorough one for
              a deep look at your program.
            </p>
            <ul className="flex flex-col gap-3">
              {points.map((point) => (
                <li className="flex items-start gap-3" key={point}>
                  <IconCheck
                    aria-hidden="true"
                    className="text-primary mt-0.5 size-5 shrink-0"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center">
            <div className="w-60 lg:w-72">
              <PhoneShot
                alt="Arnold's model picker: GPT-5.5, GPT-5.6 variants, Claude Sonnet 5, Claude Opus 5 and Claude Haiku 4.5"
                className="-mb-px"
                sizes="(min-width: 1024px) 288px, 240px"
                src={arnoldShot}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export { Arnold };
