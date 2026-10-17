import { Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SectionHeading } from "@/components/section-heading";
import { Container } from "@/components/ui/container";

const questions: { answer: ReactNode; question: string }[] = [
  {
    answer:
      "Fitme is an AI workout tracker and fitness coach for iPhone. It builds a gym workout plan around your goal, tracks every set you lift, and shows your progress over time. The AI Coach can answer questions and change your plan when you ask.",
    question: "What is Fitme?",
  },
  {
    answer:
      "Fitme is free to download. Fitme Pro gives you unlimited access to every feature, including the AI Coach that builds and adjusts your plan. You can manage or cancel your subscription any time in your App Store settings.",
    question: "Is Fitme free?",
  },
  {
    answer:
      "Tell the planner your goal (lose weight, gain muscle or improve health), your experience, how long and how often you want to train, and add a note if there's anything else. The Coach turns that into a plan of workouts with exercises, sets and target weights, and you can ask it to change anything.",
    question: "How does Fitme build my plan?",
  },
  {
    answer:
      "You choose. The Coach offers GPT and Claude models, and the one you pick answers your next message.",
    question: "Which AI models does the Coach use?",
  },
  {
    answer:
      "Yes. Plans are built around gym equipment: barbells, dumbbells, cables and machines.",
    question: "Do I need a gym?",
  },
  {
    answer:
      "Yes. Pick metric, US or UK units in Settings. Switching converts your history too, so your numbers stay right.",
    question: "Can I use pounds and inches?",
  },
  {
    answer:
      "Yes. Connect your Fitme account in ChatGPT to search exercises, manage your plans, log sets and review your workout history. Changes save to the same account you use in the app. The connection is free and requires signing in to your Fitme account.",
    question: "Can I use Fitme in ChatGPT?",
  },
  {
    answer:
      "Go to Profile, then Settings, then Delete account. Your profile, plans, workout history and Coach conversations are deleted with it.",
    question: "How do I delete my account?",
  },
];

function Faq() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="w-full scroll-mt-24"
      id="faq"
    >
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <SectionHeading
            align="start"
            eyebrow="FAQ"
            id="faq-heading"
            title="Questions, answered"
          />
          <p className="text-muted-foreground">
            Something else on your mind?{" "}
            <Link
              className="font-semibold text-foreground underline underline-offset-4 hover:text-primary"
              href="/support"
            >
              Get in touch
            </Link>
          </p>
        </div>
        <div className="flex flex-col border-t">
          {questions.map(({ answer, question }) => (
            <details className="group border-b" key={question}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-semibold text-foreground text-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {question}
                <Plus
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                />
              </summary>
              <p className="max-w-prose text-pretty pb-5 text-muted-foreground">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export { Faq };
