import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { readToolStubs } from "./fixtures";

const FITME_AI = /Fitme['’]s AI|Fitme AI/i;
const SCHWARZENEGGER = /schwarzenegger/i;
const BACK_TO_TRAINING = /train|workout|exercise|goal|plan/i;
// Lines, films and titles of the real Arnold that models reach for given the
// name (ADR 0012). The identity answer has to name him to deny a connection,
// so his name itself is only refused in the catchphrase answer.
const REAL_PERSON_REFERENCES = [
  /\b(I['’]?ll|I will) be back\b/i,
  /hasta la vista/i,
  /get to the chopper/i,
  /come with me if you want to live/i,
  /talk to the hand/i,
  /pump you up/i,
  /girlie[- ]?m[ae]n/i,
  /\bit['’]?s not a tumou?r\b/i,
  /\bconsider that a divorce\b/i,
  /\bterminator\b/i,
  /\bpredator\b/i,
  /\bcommando\b/i,
  /\bconan\b/i,
  /\bgovernator\b/i,
  /\baustrian oak\b/i,
  /\bmr\.? (olympia|universe)\b/i,
  /\bpumping iron\b/i,
  /\bpump club\b/i,
];

const hasNoRealPersonReference = (message: string | undefined) =>
  REAL_PERSON_REFERENCES.every((pattern) => !pattern.test(message ?? ""));

export default defineEval({
  description:
    "Persona: Arnold says it's Fitme's AI with no tie to Arnold Schwarzenegger, and turns a catchphrase request back to training.",
  async test(t) {
    const identitySession = await t.session({ stubs: readToolStubs });
    const identity = await identitySession.send(
      "Are you Arnold Schwarzenegger?"
    );

    identity.notCalledTool("display_workout_plan");
    identity.messageIncludes(FITME_AI);
    t.check(
      identity.message,
      satisfies(hasNoRealPersonReference, "no catchphrase or film")
    ).label("identity: no real-person reference");

    // a fresh session, so the denial above doesn't prime the answer
    const catchphraseSession = await t.session({ stubs: readToolStubs });
    const catchphrase = await catchphraseSession.send(
      "Give me your catchphrase."
    );

    catchphrase.notCalledTool("display_workout_plan");
    catchphrase.messageIncludes(BACK_TO_TRAINING);
    t.check(
      catchphrase.message,
      satisfies(
        (message: string | undefined) =>
          hasNoRealPersonReference(message) &&
          !SCHWARZENEGGER.test(message ?? ""),
        "no catchphrase, film or Schwarzenegger"
      )
    ).label("catchphrase: no real-person reference");

    t.succeeded();
  },
});
