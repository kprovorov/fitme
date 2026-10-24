// Claude Code PreToolUse hook on Bash (.claude/settings.json): refuses a
// command that breaks the AGENTS.md Shell rules. Exit 2 blocks the call and
// shows stderr to the agent; anything unreadable is let through.
import { readFileSync } from "node:fs";
import { findShellRuleViolations } from "./shell-rules.mjs";

const readInput = () => {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
};

const input = readInput();
const command = input?.tool_input?.command;

if (input?.tool_name === "Bash" && typeof command === "string") {
  const violations = findShellRuleViolations(command, {
    background: input.tool_input.run_in_background === true,
  });
  if (violations.length > 0) {
    process.stderr.write(
      `${violations.map((violation) => violation.reason).join("\n")}\n`
    );
    process.exit(2);
  }
}
