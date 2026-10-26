import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { findShellRuleViolations } from "./shell-rules.mjs";

const REASON = /^AGENTS\.md Shell: /;
const TIMEOUT_REASON = /macOS has neither `timeout` nor `gtimeout`/;
const WORD_SPLIT_REASON = /zsh doesn't word-split/;
const OUTPUT_FORMAT_REASON = /--output-format json/;

const rulesBroken = (command, options) =>
  findShellRuleViolations(command, options).map((violation) => violation.rule);

describe("timeout", () => {
  for (const command of [
    "timeout 90 pnpm test",
    "gtimeout 60 pnpm test",
    "pnpm install && timeout 120 pnpm test",
    "FOO=1 timeout 5 node x.js",
    "echo start; timeout 5 node x.js",
    "ls | timeout 5 cat",
  ]) {
    test(`refuses ${command}`, () => {
      assert.deepEqual(rulesBroken(command), ["timeout"]);
    });
  }

  for (const command of [
    "pnpm test",
    'echo "timeout 90 is not on macOS"',
    "git commit -m 'drop timeout 60'",
    "grep -n timeout src/app.ts",
    "pnpm test --testTimeout 5000",
  ]) {
    test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

describe("cd", () => {
  for (const command of [
    "cd apps/mobile && pnpm test",
    "cd ../.. && pnpm install",
    "cd apps/mobile; pnpm test",
    "pnpm install && cd apps/api && pnpm test",
    "cd -P apps/mobile && ls",
    "(cd apps/mobile && pnpm test)",
  ]) {
    test(`refuses ${command}`, () => {
      assert.deepEqual(rulesBroken(command), ["cd"]);
    });
  }

  for (const command of [
    "cd /Users/me/fitme/apps/mobile && pnpm test",
    "cd ~/fitme && pnpm test",
    "cd $HOME/fitme && pnpm test",
    "cd apps/mobile",
    "cd && ls",
    "git -C apps/mobile status",
    "pnpm --filter @fitme/mobile test",
    'echo "cd apps/mobile && pnpm test"',
    "gh pr create --body 'run cd apps/mobile && pnpm test; done'",
  ]) {
    test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

describe("pkill and pgrep", () => {
  for (const command of [
    "pkill -f ultracite",
    "pkill -f 'tsx watch'",
    "pgrep -f vitest",
    "pgrep -fl vitest",
    "pkill -9 -f expo",
    "pkill -u me -f expo",
    "sleep 1; pkill -f 'node .*eve'",
  ]) {
    test(`refuses ${command}`, () => {
      assert.deepEqual(rulesBroken(command), ["pkill"]);
    });
  }

  for (const command of [
    "pkill -f '[u]ltracite'",
    "pgrep -f '[t]sx watch'",
    "pkill ultracite",
    "pgrep node",
    "kill 12345",
    "pkill -F /tmp/dev.pid",
    'echo "pkill -f ultracite"',
  ]) {
    test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

describe("sleep", () => {
  for (const command of [
    "sleep 5",
    "sleep 30 && gh pr checks 12",
    "sleep 1m",
    "sleep 2 3",
    "sleep 0.1h",
    "sleep infinity",
    "while true; do gh pr checks 12; sleep 60; done",
  ]) {
    test(`refuses ${command}`, () => {
      assert.deepEqual(rulesBroken(command), ["sleep"]);
    });
  }

  for (const command of [
    "sleep 1",
    "sleep 4.5",
    "sleep 2 && curl localhost:3003/health",
    "sleep 60 &",
    "sleep 30 && echo done &",
    'echo "sleep 60"',
    "sleep $DELAY",
  ]) {
    test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  test("allows a long sleep the Bash tool runs in the background", () => {
    assert.deepEqual(
      rulesBroken("sleep 60 && gh pr checks 12", { background: true }),
      []
    );
  });
});

describe("text that isn't a command", () => {
  for (const command of [
    "cat > notes.md <<'EOF'\ntimeout 90 pnpm test\ncd apps/mobile && pnpm test\npkill -f ultracite\nsleep 60\nEOF",
    "cat <<-EOF\n\tsleep 60\n\tEOF\necho ok",
    'gh pr create --title "chore: hook" --body "$(cat <<\'EOF\'\nBlocks `timeout 90`, `cd apps/mobile && …` and `sleep 60`.\nEOF\n)"',
    'gh pr comment 12 --body "Ran timeout 60; cd apps/mobile; pkill -f x"',
    "git commit -m 'fix: no more sleep 30 && retry'",
    "# sleep 60 first\npnpm test",
    "grep -rn 'cd apps' docs <<< 'sleep 60'",
    "echo $(echo 'sleep 60')",
    "echo 'unterminated && sleep 60",
  ]) {
    test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  test("checks the commands after a heredoc", () => {
    assert.deepEqual(
      rulesBroken("cat <<EOF > x\nhello\nEOF\ntimeout 5 pnpm test"),
      ["timeout"]
    );
  });

  test("reports every rule a command breaks, each with its reason", () => {
    const violations = findShellRuleViolations(
      "cd apps/mobile && timeout 90 pnpm test"
    );
    assert.deepEqual(
      violations.map((violation) => violation.rule),
      ["cd", "timeout"]
    );
    for (const { reason } of violations) {
      assert.match(reason, REASON);
    }
  });
});

describe("the PreToolUse hook", () => {
  const runHook = (input) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL("check-shell-command.mjs", import.meta.url))],
      {
        encoding: "utf8",
        input: JSON.stringify(input),
      }
    );

  test("blocks a broken rule with exit 2 and the reason on stderr", () => {
    const result = runHook({
      tool_input: { command: "timeout 90 pnpm test" },
      tool_name: "Bash",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, TIMEOUT_REASON);
  });

  test("lets an allowed command through", () => {
    const result = runHook({
      tool_input: { command: "pnpm test" },
      tool_name: "Bash",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  });

  test("lets a long sleep run in the background", () => {
    const result = runHook({
      tool_input: { command: "sleep 60", run_in_background: true },
      tool_name: "Bash",
    });
    assert.equal(result.status, 0);
  });
});

describe("wrapped and compound commands", () => {
  for (const [command, rules] of [
    ["env timeout 5 node x.js", ["timeout"]],
    ["sudo -n timeout 5 node x.js", ["timeout"]],
    ["nohup timeout 5 node x.js", ["timeout"]],
    ["command timeout 5 node x.js", ["timeout"]],
    ["/usr/bin/timeout 5 node x.js", ["timeout"]],
    ["exec sleep 60", ["sleep"]],
    ["cd apps/mobile\npnpm test", ["cd"]],
    ["while true; do sleep 60; done", ["sleep"]],
    ["(sleep 60; echo hi)", ["sleep"]],
  ]) {
    test(`refuses ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }

  for (const command of [
    `git commit -m "$(cat <<'EOF'\nBlocks "cd\n\ntimeout 5 x\nand " here\nEOF\n)"`,
    `gh pr create --body "$(cat <<'EOF'\nDon't "sleep 60\nEOF\n)"`,
    "echo $'it\\'s && sleep 60'",
    "while true; do sleep 10; done &",
    "for f in a b; do sleep 10; done &",
    "{ sleep 10; } &",
    "(sleep 60) &",
    "(sleep 60; echo hi) &",
    "if true; then sleep 10; fi &",
    "wait_up() { sleep 10; }",
    "case $x in a) sleep 1;; esac",
  ]) {
    test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

describe("heredocs inside substitutions", () => {
  test("allows an apostrophe and blocked words in the body", () => {
    const command = `git commit -m "$(cat <<'EOF'\nDon't run \`sleep 60\` or timeout 5.\nEOF\n)" && git push`;
    assert.deepEqual(rulesBroken(command), []);
  });

  test("checks the command after the substitution", () => {
    const command = "x=$(cat <<'EOF'\nDon't\nEOF\n); timeout 5 y";
    assert.deepEqual(rulesBroken(command), ["timeout"]);
  });
});

describe("self-matching patterns, introspection, continued lines and case patterns", () => {
  for (const [command, rules] of [
    ["pkill -f 'node.*[0-9]'", ["pkill"]],
    ["pgrep -f 'v[i]test.*'", []],
    ["command -v timeout", []],
    ["command -V gtimeout || echo missing", []],
    ["command timeout 5 x", ["timeout"]],
    ["sleep 60 &&\necho done &", []],
    ["sleep 60 |\ncat &", []],
    ["sleep 60 &&\necho done", ["sleep"]],
    ['case "$cmd" in a) echo a;; timeout) echo unavailable;; esac', []],
    [
      "case $x in\n  sleep|pkill) echo no ;;\n  *) timeout 5 y ;;\nesac",
      ["timeout"],
    ],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

describe("expressions, function keywords and long wrapper options", () => {
  for (const [command, rules] of [
    ['[[ "$status" == ok || timeout == "$status" ]]', []],
    ["(( timeout > 0 ))", []],
    ["[[ -n $x ]] && timeout 5 y", ["timeout"]],
    ["(( n > 0 )) && sleep 60", ["sleep"]],
    ["for ((i = 0; i < 3; i++)); do echo $i; done", []],
    ["function noop { :; }; sleep 60", ["sleep"]],
    ["function noop() { sleep 60; }; noop &", []],
    ["env --unset NODE_OPTIONS sleep 60", ["sleep"]],
    ["sudo --user root timeout 5 node x.js", ["timeout"]],
    ["sudo --user=root timeout 5 node x.js", ["timeout"]],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

describe("loop headers, arrays, comments in substitutions and regex dialects", () => {
  for (const [command, rules] of [
    ["env -v sleep 60", ["sleep"]],
    ['for timeout in 1 2; do echo "$timeout"; done', []],
    ['for sleep in 1 5 10; do echo "$sleep"; done', []],
    ["for f in a b; do timeout 5 $f; done", ["timeout"]],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    ['checks=(timeout gtimeout); printf "%s\\n" "${checks[@]}"', []],
    ["x=$(printf ok # don't wait here\n); sleep 60", ["sleep"]],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    ['echo "${#x}" && echo $#', []],
    ["pkill -f 'node.*[[:alpha:]]{3}'", ["pkill"]],
    ["pkill -f '[[:alpha:]]ltracite'", []],
    ["pkill -if ULTRACITE", ["pkill"]],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

describe("shifts, time options and named descriptors", () => {
  for (const [command, rules] of [
    ["x=$((1 <<\n2)); sleep 60", ["sleep"]],
    ["time -p sleep 60", ["sleep"]],
    ["time -p timeout 5 x", ["timeout"]],
    ["time pnpm test", []],
    ["{fd}>/dev/null sleep 60", ["sleep"]],
    ["{fd}>/dev/null timeout 5 x", ["timeout"]],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

describe("expansion hashes, escaped delimiters and append assignments", () => {
  for (const [command, rules] of [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    ['echo "${label:-hello # world}"; sleep 60', ["sleep"]],
    ["x=$(cat <<\\EOF\ndon't\nEOF\n); sleep 60", ["sleep"]],
    ["PATH+=:/tmp sleep 60", ["sleep"]],
    ["LOG+=more timeout 5 x", ["timeout"]],
    ["list[0]=a timeout 5 x", ["timeout"]],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

describe("expansion shifts, timed groups and older-than options", () => {
  for (const [command, rules] of [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    ['echo "${x:-a << b}"; sleep 60', ["sleep"]],
    ["time { sleep 60; }", ["sleep"]],
    ["time -p { timeout 5 x; }", ["timeout"]],
    ["time { sleep 60; } &", []],
    ["pgrep -O 0 -f ultracite", ["pkill"]],
    ["pgrep --older 0 -f ultracite", ["pkill"]],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

describe("zsh word-splitting in loop headers", () => {
  for (const command of [
    "for f in $files; do echo $f; done",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    "for t in ${ids}; do gh api graphql -f id=$t; done",
    "for f in $files\ndo\n  echo $f\ndone",
    "select f in $files; do echo $f; done",
  ]) {
    test(`refuses ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), ["word-split"]);
    });
  }

  for (const command of [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    'for f in "${files[@]}"; do echo $f; done',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    "for f in ${=files}; do echo $f; done",
    'for f in "$file"; do echo $f; done',
    "for f in $a $b; do echo $f; done",
    "for f in a b c; do echo $f; done",
    "for f in $(git ls-files); do echo $f; done",
    "for f; do echo $f; done",
    "for ((i = 0; i < 3; i++)); do echo $i; done",
    "echo 'for f in $files; do x; done'",
  ]) {
    test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  test("says how to iterate instead", () => {
    const [violation] = findShellRuleViolations("for f in $files; do x; done");
    assert.match(violation.reason, WORD_SPLIT_REASON);
  });
});

describe("the Supabase CLI's legacy output flag", () => {
  for (const command of [
    "supabase status -o json",
    "supabase status --output json",
    "supabase status --output=json",
    "supabase status -ojson",
    "pnpm exec supabase status -o json",
    "npx supabase status -o env",
    "pnpm --filter @fitme/supabase exec supabase status -o json",
    "pnpm db status -o json",
  ]) {
    test(`refuses ${command}`, () => {
      assert.deepEqual(rulesBroken(command), ["supabase-output"]);
    });
  }

  for (const command of [
    "supabase status --output-format json",
    "pnpm exec supabase status --output-format=json",
    "pnpm --filter @fitme/supabase exec supabase start",
    "curl -o out.json localhost:54321",
    'echo "supabase status -o json"',
  ]) {
    test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  test("points at --output-format json", () => {
    const [violation] = findShellRuleViolations("supabase status -o json");
    assert.match(violation.reason, OUTPUT_FORMAT_REASON);
  });
});

describe("prod secrets in a local shell", () => {
  for (const command of [
    "infisical secrets get X --env=prod",
    "infisical secrets get X --env prod",
    "infisical secrets --env=prod",
    "infisical --env=prod secrets get X",
    "infisical export --env=prod --path=/Api",
    "infisical run --env=prod -- curl https://library.fitmeproject.com",
    'TOKEN=$(infisical secrets get LIBRARY_MCP_SECRET --env=prod --plain); curl -H "Authorization: Bearer $TOKEN" x',
    "for name in A B; do infisical secrets get $name --env=prod --plain; done",
    "infisical secrets set X=1 --env=prod",
    "pnpm exec infisical export --env=prod",
  ]) {
    test(`refuses ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), ["infisical-prod"]);
    });
  }

  for (const command of [
    "infisical secrets get X --env=dev",
    "infisical export --env=dev --path=/Api",
    "infisical run --env=dev -- pnpm dev",
    "infisical secrets set X=1 --env=dev",
    "infisical secrets folders get --env=prod",
    "infisical login",
    'echo "infisical secrets get X --env=prod"',
  ]) {
    test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

describe("printing env file values", () => {
  for (const command of [
    "cat apps/api/.env",
    "cat .env.local",
    "head -5 apps/arnold/.env.local",
    "tail apps/mcp/.env",
    "grep SECRET apps/api/.env",
    "less apps/webhooks/.env",
    "sed 's/\\(SECRET\\|KEY\\)=.*/x/' apps/library/.env",
    "sed -n 1,5p apps/api/.env",
    "cut -d= -f2 apps/api/.env",
    "awk -F= '{print $2}' apps/api/.env",
    "cat apps/api/.env | sed 's/=.*//' | cat apps/mcp/.env",
    "cat apps/api/.env | grep LIBRARY",
    "pnpm install && cat apps/api/.env",
  ]) {
    test(`refuses ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), ["env-file"]);
    });
  }

  for (const command of [
    "cut -d= -f1 apps/api/.env",
    "cut -d '=' -f 1 apps/api/.env",
    "sed -E 's/=.*/=…/' apps/api/.env",
    "sed 's/=.*//' apps/api/.env",
    "awk -F= '{print $1}' apps/api/.env",
    "cat apps/api/.env | cut -d= -f1",
    "grep -v '^#' apps/api/.env | cut -d= -f1",
    "grep -q '^CLERK_JWT_KEY=' apps/api/.env",
    "grep -c LIBRARY apps/api/.env",
    "grep -l LIBRARY apps/api/.env apps/mcp/.env",
    "sed -i '' 's/^PORT=.*/PORT=3010/' apps/api/.env",
    "cat apps/api/.env.example",
    "cat apps/api/src/env.ts",
    "cat .envrc",
    "ls -la apps/api/.env",
    'echo "cat apps/api/.env"',
  ]) {
    test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

describe("commands inside substitutions", () => {
  for (const [command, rules] of [
    ["x=$(cat apps/api/.env)", ["env-file"]],
    ['echo "values: $(grep KEY apps/api/.env)"', ["env-file"]],
    ["echo `cat apps/api/.env`", ["env-file"]],
    ["diff <(cat apps/api/.env) <(cat apps/mcp/.env)", ["env-file"]],
    ['echo "$(sleep 60)"', ["sleep"]],
    ["x=$(echo $(timeout 5 y))", ["timeout"]],
    ["echo '$(cat apps/api/.env)'", []],
    ['echo "<(cat apps/api/.env)"', []],
    ["echo $((1 + 2)) && echo $'it\\'s $(x)'", []],
    ["names=$(cut -d= -f1 apps/api/.env)", []],
    [
      "gh pr create --body \"$(cat <<'EOF'\nNever `cat apps/api/.env` or `infisical export --env=prod`.\nEOF\n)\"",
      [],
    ],
  ]) {
    test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});
