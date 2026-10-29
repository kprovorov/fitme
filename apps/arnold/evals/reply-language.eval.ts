import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { readToolStubs } from "./fixtures";

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;
// Letters Ukrainian has and Russian doesn't, so a Russian answer fails too.
const UKRAINIAN_LETTERS = /[іїєґ]/i;

const count = (text: string, pattern: RegExp) =>
  text.match(pattern)?.length ?? 0;

const isUkrainian = (message: string | undefined) => {
  const text = message ?? "";
  return (
    UKRAINIAN_LETTERS.test(text) && count(text, CYRILLIC) > count(text, LATIN)
  );
};

const isEnglish = (message: string | undefined) => {
  const text = message ?? "";
  return count(text, LATIN) > 0 && count(text, CYRILLIC) === 0;
};

export default defineEval({
  description:
    "Arnold replies in the language of the User's message, whatever the App language in the client context.",
  async test(t) {
    // The App language is English, so only the message can make it Ukrainian.
    const ukrainianSession = await t.session({ stubs: readToolStubs });
    const ukrainian = await ukrainianSession.send(
      "Скільки відпочивати між підходами, коли я тренуюся на силу?",
      { clientContext: { language: "en" } }
    );

    ukrainian.notCalledTool("display_workout_plan");
    t.check(
      ukrainian.message,
      satisfies(isUkrainian, "answered in Ukrainian")
    ).label("Ukrainian message, English app: Ukrainian answer");

    // The App language is Ukrainian, but the message is clearly English.
    const englishSession = await t.session({ stubs: readToolStubs });
    const english = await englishSession.send(
      "How long should I rest between sets when training for strength?",
      { clientContext: { language: "uk" } }
    );

    english.notCalledTool("display_workout_plan");
    t.check(english.message, satisfies(isEnglish, "answered in English")).label(
      "English message, Ukrainian app: English answer"
    );

    t.succeeded();
  },
});
