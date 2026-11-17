import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import { readToolStubs } from "./fixtures";

const CYRILLIC = /\p{Script=Cyrillic}/gu;
const LATIN = /\p{Script=Latin}/gu;

// Letters Ukrainian has and Russian doesn't, so a Russian answer fails too.
const UKRAINIAN_LETTERS = /[іїєґ]/iu;

const NAMES_MAY_STAY_ENGLISH =
  "Proper names and exercise names may stay in English.";

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
      ukrainian.reply,
      satisfies(isUkrainian, "answered in Ukrainian")
    ).label("Ukrainian message, English app: Ukrainian answer");

    // The App language is Ukrainian, but the message is clearly English.
    const englishSession = await t.session({ stubs: readToolStubs });

    const english = await englishSession.send(
      "How long should I rest between sets when training for strength?",
      { clientContext: { language: "uk" } }
    );

    english.notCalledTool("display_workout_plan");
    t.check(english.reply, satisfies(isEnglish, "answered in English")).label(
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
        { appLanguage: "fr", language: "French", message: "💪" },
        { appLanguage: "de", language: "German", message: "💪" },
        { appLanguage: "it", language: "Italian", message: "💪" },
        {
          appLanguage: "pt-BR",
          language: "Brazilian Portuguese",
          message: "💪",
          variantOf: "European Portuguese",
        },
        {
          appLanguage: "pt-PT",
          language: "European Portuguese",
          message: "💪",
          variantOf: "Brazilian Portuguese",
        },
        { appLanguage: "pl", language: "Polish", message: "💪" },
        {
          appLanguage: "zh-Hans",
          language: "Simplified Chinese",
          message: "💪",
          variantOf: "Traditional Chinese",
        },
        {
          appLanguage: "zh-Hant",
          language: "Traditional Chinese",
          message: "💪",
          variantOf: "Simplified Chinese",
        },
        { appLanguage: "ja", language: "Japanese", message: "💪" },
        { appLanguage: "ko", language: "Korean", message: "💪" },
        { appLanguage: "nl", language: "Dutch", message: "💪" },
      ].map(async ({ appLanguage, language, message, variantOf }) => {
        const session = await t.session({ stubs: readToolStubs });

        const turn = await session.send(message, {
          clientContext: { language: appLanguage },
        });

        turn.succeeded();
        const label = `${language} response to ${message}`;

        if (!variantOf) {
          t.judge(
            `The assistant's response is written in ${language}. ${NAMES_MAY_STAY_ENGLISH}`,
            { on: turn.reply }
          )
            .label(label)
            .gate(0.9);

          return;
        }

        // A one-line answer to an emoji gives a boolean judge few words to
        // tell two variants of one language apart by, so it hedges below the
        // gate on a correct answer (0.79–0.88 measured for "Vamos a isso! …
        // o teu treino" and "準備好訓練了嗎？"). Asked to pick between the two,
        // it picks, and a choice scores 1 or 0, so the wrong variant fails.
        t.judge(
          {
            criteria: {
              expected: language,
              other: variantOf,
              neither: "Another language, or a mix of languages",
            },
            expected: "expected",
            instructions: `Which language is the assistant's response written in? ${NAMES_MAY_STAY_ENGLISH}`,
            type: "choice",
          },
          { on: turn.reply }
        )
          .label(label)
          .gate();
      })
    );

    t.succeeded();
  },
});
