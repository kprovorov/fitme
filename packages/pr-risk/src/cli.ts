/**
 * Glue between the PR Risk workflow and `decide`.
 *
 * Inputs (env):
 *   PR_TITLE                 the pull request title
 *   CHANGED_FILES_PATH       file with one changed path per line
 *   EVALUATOR_VERDICT_PATH   optional, verdict file written by the evaluator
 *   EVALUATOR_ERROR          optional, why the evaluator produced no verdict
 *   COMMENT_PATH             where to write the sticky comment body
 *   GITHUB_OUTPUT            step outputs: label, source, run_evaluator
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { decide, type EvaluatorResult } from "./decide";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function readEvaluator(): EvaluatorResult | undefined {
  const error = process.env.EVALUATOR_ERROR;
  if (error) {
    return { error };
  }
  const verdictPath = process.env.EVALUATOR_VERDICT_PATH;
  if (!verdictPath) {
    return;
  }
  if (!existsSync(verdictPath)) {
    return { error: "the evaluator wrote no verdict file." };
  }
  return { verdict: readFileSync(verdictPath, "utf8") };
}

const files = readFileSync(requireEnv("CHANGED_FILES_PATH"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const decision = decide({
  evaluator: readEvaluator(),
  files,
  title: requireEnv("PR_TITLE"),
});

writeFileSync(requireEnv("COMMENT_PATH"), decision.comment);
appendFileSync(
  requireEnv("GITHUB_OUTPUT"),
  [
    `label=${decision.label}`,
    `source=${decision.source}`,
    `run_evaluator=${decision.runEvaluator}`,
    "",
  ].join("\n")
);
process.stdout.write(`${decision.comment}\n`);
