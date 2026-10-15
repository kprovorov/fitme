import { defineEvalConfig } from "eve/evals";

// Run locally with `pnpm coach eval` before prompt or model changes, not in
// CI: every eval talks to a real model (OPENAI_API_KEY / ANTHROPIC_API_KEY in
// apps/coach/.env.local). Tools are stubbed per session, so no database or
// Clerk token is needed (agent/lib/eval-runner.ts).
export default defineEvalConfig({});
