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
      "The AI Coach writes a plan around it: workouts in rotation, exercises in order, sets with target weights and reps.",
    title: "Get your plan",
  },
  {
    description:
      "Start a workout, log each set as you go, and finish with a summary of everything you lifted.",
    title: "Train and log",
  },
];

function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="w-full scroll-mt-24"
      id="how-it-works"
    >
      <Container className="flex flex-col gap-12">
        <SectionHeading
          eyebrow="How it works"
          id="how-it-works-heading"
          title="From goal to first workout in minutes"
        />
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              className="flex flex-col gap-3 rounded-2xl border bg-secondary p-6"
              key={step.title}
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full border border-primary/40 font-bold text-primary"
              >
                {index + 1}
              </span>
              <h3 className="font-bold text-foreground text-lg">
                {step.title}
              </h3>
              <p className="text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export { HowItWorks };
