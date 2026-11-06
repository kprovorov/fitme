import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import { readToolStubs } from "./fixtures";

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;

// Letters Ukrainian has and Russian doesn't, so a Russian answer fails too.
const UKRAINIAN_LETTERS = /[іїєґ]/iu;

const count = (text: string, pattern: RegExp) =>
  text.match(pattern)?.length ?? 0;

const isUkrainian = (message = "") =>
  UKRAINIAN_LETTERS.test(message) &&
  count(message, CYRILLIC) > count(message, LATIN);

const isEnglish = (message = "") =>
  count(message, LATIN) > 0 && count(message, CYRILLIC) === 0;

export default defineEval({
  description:
    "Arnold follows the User's message language, or the App language for an ambiguous message.",
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

    await Promise.all(
      [
        {
          appLanguage: "ca",
          language: "Spanish",
          message: "¿Cuánto debo descansar entre series para ganar fuerza?",
        },
        {
          appLanguage: "es",
          language: "Catalan",
          message: "Quant he de descansar entre sèries per guanyar força?",
        },
        { appLanguage: "es", language: "Spanish", message: "💪" },
        { appLanguage: "ca", language: "Catalan", message: "💪" },
      ].map(async ({ appLanguage, language, message }) => {
        const session = await t.session({ stubs: readToolStubs });

        const turn = await session.send(message, {
          clientContext: { language: appLanguage },
        });

        turn.succeeded();
        t.judge(
          `The assistant's response is written in ${language}. Proper names and exercise names may stay in English.`,
          { on: turn.message }
        )
          .label(`${language} response to ${message}`)
          .gate(0.9);
      })
    );

    t.succeeded();
  },
});
