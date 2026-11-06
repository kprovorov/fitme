import { SectionHeading } from "@/components/section-heading";
import { Container } from "@/components/ui/container";

const steps = [
  {
    description:
      "Pick your goal, experience, how long you want to train, how often, and add a note about anything else.",
    title: "Tell Fitme your goal",
  },
  {
    description:
      "Arnold, Fitme's AI, writes a plan around it: workouts in rotation, exercises in order, sets with target weights and reps.",
    title: "Get your plan",
  },
  {
    description:
      "Start a workout, log each set as you go, and finish with a summary of everything you lifted.",
    title: "Train and log",
  },
];

const HowItWorks = () => (
  <section
    aria-labelledby="how-it-works-heading"
    className="w-full scroll-mt-24"
    id="how-it-works"
  >
    <Container className="flex flex-col">
      <SectionHeading
        eyebrow="How it works"
        id="how-it-works-heading"
        title="From goal to first workout in minutes"
      />
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            className="bg-secondary flex flex-col gap-3 rounded-2xl border p-6"
            key={step.title}
          >
            <span
              aria-hidden="true"
              className="border-primary/40 text-body-emphasized text-primary flex size-9 items-center justify-center rounded-full border"
            >
              {index + 1}
            </span>
            <h3 className="text-foreground text-title-3-emphasized">
              {step.title}
            </h3>
            <p className="text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </Container>
  </section>
);

export { HowItWorks };
