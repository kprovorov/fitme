/// <reference types="node" />

// Claude Code PreToolUse hook on Bash (.claude/settings.json): refuses a
// command that breaks the AGENTS.md Shell rules. Exit 2 blocks the call and
// shows stderr to the agent; anything unreadable is let through.
import { readFileSync } from "node:fs";
import process from "node:process";

import { z } from "zod";

import { findShellRuleViolations } from "./shell-rules.mjs";

const bashInput = z.object({
  tool_input: z.object({
    command: z.string(),
    run_in_background: z
      .unknown()
      .optional()
      .transform((value) => value === true),
  }),
  tool_name: z.literal("Bash"),
});

const readInput = () => {
  try {
    return bashInput.parse(JSON.parse(readFileSync(0, "utf-8")));
  } catch {
    return null;
  }
};

const input = readInput();

if (input !== null) {
  const violations = findShellRuleViolations(input.tool_input.command, {
    background: input.tool_input.run_in_background,
    projectDir: process.env.CLAUDE_PROJECT_DIR,
  });

  if (violations.length > 0) {
    process.stderr.write(
      `${violations.map((violation) => violation.reason).join("\n")}\n`
    );
    process.exit(2);
  }
}
