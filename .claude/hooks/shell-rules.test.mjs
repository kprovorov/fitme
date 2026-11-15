/// <reference types="node" />
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { findShellRuleViolations } from "./shell-rules.mjs";

const REASON = /^AGENTS\.md Shell: /u;
const TIMEOUT_REASON = /macOS has neither `timeout` nor `gtimeout`/u;
const WORD_SPLIT_REASON = /zsh doesn't word-split/u;
const ZSH_PATH_REASON = /zsh ties the lowercase `path` array to `PATH`/u;
const OUTPUT_FORMAT_REASON = /--output-format json/u;
const GITLEAKS_REASON = /gitleaks masks nothing without `--redact`/u;

/**
 * @param {Parameters<typeof findShellRuleViolations>[0]} command The shell command.
 * @param {Parameters<typeof findShellRuleViolations>[1]} [options] The rule options.
 */
const rulesBroken = (command, options) =>
  findShellRuleViolations(command, options).map((violation) => violation.rule);

void describe("timeout", () => {
  for (const command of [
    "timeout 90 pnpm test",
    "gtimeout 60 pnpm test",
    "pnpm install && timeout 120 pnpm test",
    "FOO=1 timeout 5 node x.js",
    "echo start; timeout 5 node x.js",
    "ls | timeout 5 cat",
  ]) {
    void test(`refuses ${command}`, () => {
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
    void test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

void describe("cd", () => {
  for (const command of [
    "cd apps/mobile && pnpm test",
    "cd ../.. && pnpm install",
    "cd apps/mobile; pnpm test",
    "pnpm install && cd apps/api && pnpm test",
    "cd -P apps/mobile && ls",
    "(cd apps/mobile && pnpm test)",
  ]) {
    void test(`refuses ${command}`, () => {
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
    void test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

void describe("pkill and pgrep", () => {
  for (const command of [
    "pkill -f ultracite",
    "pkill -f 'tsx watch'",
    "pgrep -f vitest",
    "pgrep -fl vitest",
    "pkill -9 -f expo",
    "pkill -u me -f expo",
    "sleep 1; pkill -f 'node .*eve'",
  ]) {
    void test(`refuses ${command}`, () => {
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
    void test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

void describe("sleep", () => {
  for (const command of [
    "sleep 5",
    "sleep 30 && gh pr checks 12",
    "sleep 1m",
    "sleep 2 3",
    "sleep 0.1h",
    "sleep infinity",
    "while true; do gh pr checks 12; sleep 60; done",
  ]) {
    void test(`refuses ${command}`, () => {
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
    void test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  void test("allows a long sleep the Bash tool runs in the background", () => {
    assert.deepEqual(
      rulesBroken("sleep 60 && gh pr checks 12", { background: true }),
      []
    );
  });
});

void describe("text that isn't a command", () => {
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
    void test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  void test("checks the commands after a heredoc", () => {
    assert.deepEqual(
      rulesBroken("cat <<EOF > x\nhello\nEOF\ntimeout 5 pnpm test"),
      ["timeout"]
    );
  });

  void test("reports every rule a command breaks, each with its reason", () => {
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

void describe("the PreToolUse hook", () => {
  /**
   * @param {unknown} input The hook payload.
   * @param {NodeJS.ProcessEnv} [env] The environment overrides.
   */
  const runHook = (input, env) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL("check-shell-command.mjs", import.meta.url))],
      {
        encoding: "utf-8",
        env: { ...process.env, ...env },
        input: JSON.stringify(input),
      }
    );

  void test("blocks a broken rule with exit 2 and the reason on stderr", () => {
    const result = runHook({
      tool_input: { command: "timeout 90 pnpm test" },
      tool_name: "Bash",
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, TIMEOUT_REASON);
  });

  void test("lets an allowed command through", () => {
    const result = runHook({
      tool_input: { command: "pnpm test" },
      tool_name: "Bash",
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  });

  void test("lets a long sleep run in the background", () => {
    const result = runHook({
      tool_input: { command: "sleep 60", run_in_background: true },
      tool_name: "Bash",
    });

    assert.equal(result.status, 0);
  });

  void test("reads the project directory from CLAUDE_PROJECT_DIR", () => {
    /** @param {string} command The shell command. */
    const scan = (command) =>
      runHook(
        { tool_input: { command }, tool_name: "Bash" },
        { CLAUDE_PROJECT_DIR: "/Users/me/fitme" }
      ).status;

    assert.equal(scan("gitleaks dir /Users/me/fitme --redact"), 2);
    assert.equal(scan("gitleaks dir /Users/me/fitme/apps/mobile --redact"), 0);
  });
});

void describe("wrapped and compound commands", () => {
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
    void test(`refuses ${JSON.stringify(command)}`, () => {
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
    void test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

void describe("heredocs inside substitutions", () => {
  void test("allows an apostrophe and blocked words in the body", () => {
    const command = `git commit -m "$(cat <<'EOF'\nDon't run \`sleep 60\` or timeout 5.\nEOF\n)" && git push`;
    assert.deepEqual(rulesBroken(command), []);
  });

  void test("checks the command after the substitution", () => {
    const command = "x=$(cat <<'EOF'\nDon't\nEOF\n); timeout 5 y";
    assert.deepEqual(rulesBroken(command), ["timeout"]);
  });
});

void describe("self-matching patterns, introspection, continued lines and case patterns", () => {
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
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("expressions, function keywords and long wrapper options", () => {
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
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("loop headers, arrays, comments in substitutions and regex dialects", () => {
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
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("shifts, time options and named descriptors", () => {
  for (const [command, rules] of [
    ["x=$((1 <<\n2)); sleep 60", ["sleep"]],
    ["time -p sleep 60", ["sleep"]],
    ["time -p timeout 5 x", ["timeout"]],
    ["time pnpm test", []],
    ["{fd}>/dev/null sleep 60", ["sleep"]],
    ["{fd}>/dev/null timeout 5 x", ["timeout"]],
  ]) {
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("expansion hashes, escaped delimiters and append assignments", () => {
  for (const [command, rules] of [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    ['echo "${label:-hello # world}"; sleep 60', ["sleep"]],
    ["x=$(cat <<\\EOF\ndon't\nEOF\n); sleep 60", ["sleep"]],
    ["PATH+=:/tmp sleep 60", ["sleep"]],
    ["LOG+=more timeout 5 x", ["timeout"]],
    ["list[0]=a timeout 5 x", ["timeout"]],
  ]) {
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("expansion shifts, timed groups and older-than options", () => {
  for (const [command, rules] of [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    ['echo "${x:-a << b}"; sleep 60', ["sleep"]],
    ["time { sleep 60; }", ["sleep"]],
    ["time -p { timeout 5 x; }", ["timeout"]],
    ["time { sleep 60; } &", []],
    ["pgrep -O 0 -f ultracite", ["pkill"]],
    ["pgrep --older 0 -f ultracite", ["pkill"]],
  ]) {
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("zsh word-splitting in loop headers", () => {
  for (const command of [
    "for f in $files; do echo $f; done",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
    "for t in ${ids}; do gh api graphql -f id=$t; done",
    "for f in $files\ndo\n  echo $f\ndone",
    "select f in $files; do echo $f; done",
  ]) {
    void test(`refuses ${JSON.stringify(command)}`, () => {
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
    void test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  void test("says how to iterate instead", () => {
    const [violation] = findShellRuleViolations("for f in $files; do x; done");
    assert.match(violation.reason, WORD_SPLIT_REASON);
  });
});

void describe("zsh's `path` variable", () => {
  for (const command of [
    "local path=x",
    "path=apps/api; ls $path",
    "path=x node x.js",
    "typeset path=x",
    "typeset -a path",
    "declare path",
    "export path=x",
    "readonly path=x",
    "for path in a b; do echo $path; done",
    "select path in a b; do echo $path; done",
    "git ls-files | while read -r path; do echo $path; done",
    "check() { local path=$1; ls $path; }",
    'echo "$(path=x; echo $path)"',
  ]) {
    void test(`refuses ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), ["zsh-path"]);
    });
  }

  for (const command of [
    "local filepath=x",
    "local file=x dir=y",
    "PATH=/usr/bin:$PATH node x.js",
    "path+=(/opt/bin)",
    "for file in a b; do echo $file; done",
    "echo path=x",
    "git commit -m 'local path=x'",
    "grep -rn path src",
    "read -r line",
    "node -e 'const path = require(\"node:path\")'",
  ]) {
    void test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  void test("says why and what to name it instead", () => {
    const [violation] = findShellRuleViolations("local path=x");
    assert.match(violation.reason, ZSH_PATH_REASON);
  });
});

void describe("the Supabase CLI's legacy output flag", () => {
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
    void test(`refuses ${command}`, () => {
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
    void test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  void test("points at --output-format json", () => {
    const [violation] = findShellRuleViolations("supabase status -o json");
    assert.match(violation.reason, OUTPUT_FORMAT_REASON);
  });
});

void describe("prod secrets in a local shell", () => {
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
    void test(`refuses ${JSON.stringify(command)}`, () => {
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
    void test(`allows ${command}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

void describe("printing env file values", () => {
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
    void test(`refuses ${JSON.stringify(command)}`, () => {
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
    void test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }
});

void describe("commands inside substitutions", () => {
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
    void test(`${JSON.stringify(command)} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(rulesBroken(command), rules);
    });
  }
});

void describe("gitleaks scanning a whole worktree or printing secrets", () => {
  for (const command of [
    // Unredacted: gitleaks masks nothing unless asked.
    "gitleaks dir apps/mobile",
    "gitleaks dir apps/mobile --redact=0",
    "gitleaks dir apps/mobile --redact=50",
    "gitleaks git --log-opts='origin/main..HEAD' -v",
    "gitleaks detect --no-git --source apps/arnold",
    // pflag reads `--redact`'s value in base 0, so `0100` is octal 64. Only
    // the bare flag and `--redact=100` are read as masking the whole secret.
    "gitleaks dir apps/mobile --redact=0100 -v",
    "gitleaks dir apps/mobile --redact=0x64 -v",
    "gitleaks dir apps/mobile --redact=1e2 -v",
    "gitleaks dir apps/mobile --redact=no -v",
    // Pointed at the working directory, gitignored `.env*` files included.
    "gitleaks dir --redact",
    "gitleaks dir . --redact",
    "gitleaks dir ./ --redact",
    "gitleaks dir $PWD --redact",
    "gitleaks dir --redact --config .gitleaks.toml",
    "gitleaks detect --no-git --redact",
    "gitleaks detect --no-git --source . --redact",
    // The same directory under another name: gitleaks reads an empty path as
    // `.`, and `./.` and `sub/..` resolve to it.
    "gitleaks dir '' --redact -v",
    "gitleaks dir ./. --redact -v",
    "gitleaks dir apps/.. --redact -v",
    "gitleaks dir .. --redact -v",
    "gitleaks dir / --redact -v",
    "gitleaks detect --no-git --source ./. --redact",
    // A glob is one word here and several arguments to gitleaks, which then
    // scans the working directory.
    "gitleaks dir apps/* --redact",
    "gitleaks dir 'apps/**/*.ts' --redact",
    // More than one path: gitleaks ignores every one of them and scans the
    // working directory, which is how FIT-476 printed the local env files.
    "gitleaks dir packages/i18n/src/catalogs apps/mobile --redact",
    "gitleaks dir packages/i18n/src/catalogs apps/mobile --config .gitleaks.toml --redact -v",
    // The FIT-476 command itself.
    "gitleaks dir packages/i18n/src/catalogs apps/mobile --config .gitleaks.toml -v --redact=0 | grep Secret",
    "pnpm exec gitleaks dir . --redact",
    "npx gitleaks dir . --redact",
    // `--` ends the flags; every word after it is another path.
    "gitleaks dir apps/mobile --redact -- apps/arnold",
    "gitleaks dir --redact -- .",
    "gitleaks dir -- apps/mobile --redact",
    // Words the rule can't read, so what really runs can't be known: a
    // boolean with an explicit value, and a grouped or attached shorthand.
    "gitleaks dir apps/mobile --help --help=false -v",
    "gitleaks dir apps/mobile --help=true",
    "gitleaks dir apps/mobile --help=false --redact",
    "gitleaks dir apps/mobile --help -vh=false --redact",
    "gitleaks dir apps/mobile -h=false -v",
    "gitleaks dir apps/mobile -vv --redact",
    "gitleaks detect --no-git=true --redact",
    "gitleaks detect --no-git=false --redact",
    "gitleaks detect --no-git --source apps/arnold -s. --redact",
    "gitleaks dir apps/mobile -capps/x --redact",
    // An unknown flag or subcommand: gitleaks refuses these itself.
    "gitleaks dir apps/mobile --bogus --redact",
    "gitleaks protect --staged --redact",
    "gitleaks dir apps/mobile --config",
  ]) {
    void test(`refuses ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), ["gitleaks"]);
    });
  }

  for (const command of [
    "gitleaks dir apps/mobile --redact",
    "gitleaks dir apps/mobile --redact=100",
    "gitleaks dir apps/arnold/.env.local --redact -v",
    "gitleaks dir packages/i18n/src/catalogs --config .gitleaks.toml --redact -v",
    "gitleaks dir apps/mobile --redact --exit-code 0",
    "gitleaks dir apps/mobile --redact -r - -f json",
    "gitleaks dir /Users/me/fitme/apps/mobile --redact",
    "gitleaks dir apps/mobile/ --redact",
    "gitleaks dir ./apps/mobile --redact",
    "gitleaks dir apps/web/../mobile --redact",
    "gitleaks dir apps/mobile/.. --redact",
    "gitleaks file apps/mobile --redact",
    "gitleaks dir apps/mobile --redact -- ",
    // `--redact` takes no following word, so `apps/mobile` is still the path.
    "gitleaks dir --redact apps/mobile",
    // Git history holds no gitignored env file, so the whole repo is fine.
    "gitleaks git --log-opts='origin/main..HEAD' --redact -v",
    "gitleaks git --pre-commit --staged --redact -v",
    "gitleaks git --redact .",
    "gitleaks detect --redact",
    "gitleaks detect --no-git --source apps/arnold --redact",
    "gitleaks detect --no-git -s apps/arnold --redact",
    "gitleaks stdin --redact",
    "gitleaks dir apps/mobile --help",
    "gitleaks version",
    "gitleaks --version",
    "gitleaks dir --help",
    "gitleaks help dir",
    "gitleaks",
    'echo "gitleaks dir . --redact=0"',
  ]) {
    void test(`allows ${JSON.stringify(command)}`, () => {
      assert.deepEqual(rulesBroken(command), []);
    });
  }

  // The hook knows the project directory, so an absolute path covering it is
  // the whole checkout under another name.
  const PROJECT_DIR = "/Users/me/fitme";

  for (const [command, rules] of [
    ["gitleaks dir /Users/me/fitme --redact", ["gitleaks"]],
    ["gitleaks dir /Users/me/fitme/ --redact", ["gitleaks"]],
    ["gitleaks dir /Users/me/fitme/apps/.. --redact", ["gitleaks"]],
    ["gitleaks dir /Users/me --redact", ["gitleaks"]],
    ["gitleaks dir / --redact", ["gitleaks"]],
    [
      "gitleaks detect --no-git --source /Users/me/fitme --redact",
      ["gitleaks"],
    ],
    ["gitleaks dir /Users/me/fitme/apps/mobile --redact", []],
    ["gitleaks dir /Users/me/fitme-next --redact", []],
    ["gitleaks dir /elsewhere --redact", []],
    ["gitleaks dir apps/mobile --redact", []],
  ]) {
    void test(`${JSON.stringify(command)} under ${PROJECT_DIR} breaks ${JSON.stringify(rules)}`, () => {
      assert.deepEqual(
        rulesBroken(command, { projectDir: PROJECT_DIR }),
        rules
      );
    });
  }

  void test("points at a single path and --redact", () => {
    const [violation] = findShellRuleViolations("gitleaks dir . --redact=0");
    assert.match(violation.reason, REASON);
    assert.match(violation.reason, GITLEAKS_REASON);
  });
});
