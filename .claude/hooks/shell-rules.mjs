// The AGENTS.md Shell rules as a matcher over a Bash command. Pure string
// matching, no subprocess: the PreToolUse hook (check-shell-command.mjs) runs
// it before every Bash call. Rules only look at command words (the start of
// the command, or after &&, ||, ;, |, &, a newline or a parenthesis), never at
// quoted strings, heredoc bodies, comments or command substitutions.

const RULES = {
  cd: "AGENTS.md Shell: never `cd` to a relative path in a `&&` or `;` chain, the working directory carries over between calls: use an absolute path, `git -C <path>` or `pnpm --filter <package>`.",
  pkill:
    "AGENTS.md Shell: `pkill -f` / `pgrep -f` match your own shell, whose command line holds the pattern: bracket a letter (`'[u]ltracite'`) or kill a saved PID.",
  sleep:
    "AGENTS.md Shell: no foreground `sleep` of 5 s or more: use Monitor, a background command (`run_in_background`) or `watch_pull_request`.",
  timeout:
    "AGENTS.md Shell: macOS has neither `timeout` nor `gtimeout`: use the Bash tool's own timeout.",
};

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const FD_NUMBER = /^\d+$/;
const LEADING_TABS = /^\t+/;
const WHITESPACE = new Set([" ", "\t"]);
const QUOTES = new Set(["'", '"', "`"]);

class UnterminatedError extends Error {}

const unterminated = () => {
  throw new UnterminatedError("unterminated quote or substitution");
};

// The index just past the `'…'` opened at `start`.
const skipSingleQuoted = (source, start) => {
  const end = source.indexOf("'", start + 1);
  return end === -1 ? unterminated() : end + 1;
};

// The index just past the `"…"` or `` `…` `` opened at `start`.
const skipEscapable = (source, start) => {
  const close = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === close) {
      return index + 1;
    }
    index += source[index] === "\\" ? 2 : 1;
  }
  return unterminated();
};

const skipQuote = (source, start) =>
  source[start] === "'"
    ? skipSingleQuoted(source, start)
    : skipEscapable(source, start);

// The index just past the `(…)` or `{…}` opened at `start`, nesting and
// quotes inside included.
const skipGroup = (source, start) => {
  const open = source[start];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (QUOTES.has(char)) {
      index = skipQuote(source, index);
      continue;
    }
    depth += (char === open ? 1 : 0) - (char === close ? 1 : 0);
    index += 1;
    if (depth === 0) {
      return index;
    }
  }
  return unterminated();
};

// Splits a command into words and control operators the way the shell does:
// quotes removed, redirections and their targets dropped, heredoc bodies and
// comments skipped. Substitutions (`$(…)`, `` `…` ``, `<(…)`) stay opaque.
class Lexer {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.tokens = [];
    this.heredocs = [];
    this.word = null;
    // What the next word is: a "word", a redirection target to "skip", or a
    // "heredoc" / "heredoc-tabs" delimiter.
    this.next = "word";
  }

  run() {
    while (this.index < this.source.length) {
      this.step(this.source[this.index], this.source[this.index + 1]);
    }
    this.flush();
    return this.tokens;
  }

  step(char, following) {
    if (char === "\\") {
      this.escape(following);
    } else if (QUOTES.has(char)) {
      this.quote(char);
    } else if ("$<>".includes(char) && "({".includes(following)) {
      this.substitution(char, following);
    } else if (char === "#" && this.word === null) {
      this.comment();
    } else if (WHITESPACE.has(char)) {
      this.flush();
      this.index += 1;
    } else if (char === "\n") {
      this.newline();
    } else if (char === "<" || char === ">") {
      this.redirection();
    } else if (char === "&" || char === "|" || char === ";") {
      this.control(char, following);
    } else if (char === "(" || char === ")") {
      this.operator(char, 1);
    } else {
      this.append(char);
      this.index += 1;
    }
  }

  append(text) {
    this.word = (this.word ?? "") + text;
  }

  flush() {
    if (this.word !== null) {
      if (this.next === "word") {
        this.tokens.push({ type: "word", value: this.word });
      } else if (this.next !== "skip") {
        this.heredocs.push({
          delimiter: this.word,
          stripTabs: this.next === "heredoc-tabs",
        });
      }
      this.next = "word";
    }
    this.word = null;
  }

  operator(value, length) {
    this.flush();
    this.tokens.push({ type: "operator", value });
    this.index += length;
  }

  escape(following) {
    if (following !== "\n") {
      this.append(following ?? "");
    }
    this.index += 2;
  }

  quote(char) {
    const end = skipQuote(this.source, this.index);
    this.append(
      char === "`"
        ? this.source.slice(this.index, end)
        : this.source.slice(this.index + 1, end - 1)
    );
    this.index = end;
  }

  substitution(char, following) {
    if (char !== "$" && following === "{") {
      // `<{` / `>{` is a redirection followed by a word, not a substitution.
      this.redirection();
      return;
    }
    const end = skipGroup(this.source, this.index + 1);
    this.append(this.source.slice(this.index, end));
    this.index = end;
  }

  comment() {
    const end = this.source.indexOf("\n", this.index);
    this.index = end === -1 ? this.source.length : end;
  }

  newline() {
    this.operator("\n", 1);
    for (const { delimiter, stripTabs } of this.heredocs.splice(0)) {
      this.skipHeredoc(delimiter, stripTabs);
    }
  }

  skipHeredoc(delimiter, stripTabs) {
    while (this.index < this.source.length) {
      const end = this.source.indexOf("\n", this.index);
      const lineEnd = end === -1 ? this.source.length : end;
      const line = this.source.slice(this.index, lineEnd);
      this.index = Math.min(lineEnd + 1, this.source.length);
      if ((stripTabs ? line.replace(LEADING_TABS, "") : line) === delimiter) {
        return;
      }
    }
  }

  redirection() {
    if (this.word !== null && FD_NUMBER.test(this.word)) {
      this.word = null;
    }
    this.flush();
    const rest = this.source.slice(this.index, this.index + 3);
    if (rest.startsWith("<<<")) {
      this.index += 3;
      this.next = "skip";
    } else if (rest.startsWith("<<-")) {
      this.index += 3;
      this.next = "heredoc-tabs";
    } else if (rest.startsWith("<<")) {
      this.index += 2;
      this.next = "heredoc";
    } else {
      this.index += ">&|<".includes(rest[1]) ? 2 : 1;
      this.next = "skip";
    }
  }

  control(char, following) {
    if (char === "&" && following === ">") {
      // `&>` / `&>>`: both streams to a file.
      this.flush();
      this.index += this.source[this.index + 2] === ">" ? 3 : 2;
      this.next = "skip";
    } else if (char === following && char !== ";") {
      this.operator(char + char, 2);
    } else {
      // `|&` pipes like `|`, `;;` ends a case branch like `;`.
      const doubled = (char === "|" && following === "&") || following === ";";
      this.operator(char, doubled ? 2 : 1);
    }
  }
}

// Reserved words and prefixes after which the next word is still a command.
const COMMAND_PREFIXES = new Set([
  "!",
  "{",
  "}",
  "do",
  "elif",
  "else",
  "if",
  "then",
  "time",
  "until",
  "while",
]);
const AND_OR_PIPE = new Set(["&&", "||", "|"]);

const commandWords = (words) => {
  let start = 0;
  while (
    start < words.length &&
    (ASSIGNMENT.test(words[start]) || COMMAND_PREFIXES.has(words[start]))
  ) {
    start += 1;
  }
  return words.slice(start);
};

// Each simple command: its words (assignments and prefixes stripped), the
// operator right after it, and whether its list runs in the background (`&`).
const simpleCommands = (tokens) => {
  const commands = [];
  let words = [];
  const end = (operator) => {
    const command = commandWords(words);
    if (command.length > 0) {
      commands.push({ background: false, operator, words: command });
    }
    words = [];
  };
  for (const token of tokens) {
    if (token.type === "word") {
      words.push(token.value);
    } else {
      end(token.value);
    }
  }
  end(null);

  // `a && b &` backgrounds the whole and-or list, `a | b` included.
  let background = false;
  for (const command of commands.toReversed()) {
    if (command.operator === "&") {
      background = true;
    } else if (!AND_OR_PIPE.has(command.operator)) {
      background = false;
    }
    command.background = background;
  }
  return commands;
};

// `$VAR/…` may well be absolute: only a plain relative path is refused.
const NOT_RELATIVE = /^[/~$]/;

// The directory `cd` changes to: its first operand, past options like `-P`.
const cdTarget = (words) =>
  words.slice(1).find((word) => !word.startsWith("-"));

const PROCESS_MATCHERS = new Set(["pkill", "pgrep"]);
// Short options of pkill / pgrep (macOS and procps) that take a value.
const VALUE_OPTIONS = new Set(["F", "G", "P", "U", "d", "g", "s", "t", "u"]);
const VALUE_LONG_OPTIONS = new Set([
  "--cgroup",
  "--delimiter",
  "--env",
  "--euid",
  "--group",
  "--ns",
  "--nslist",
  "--parent",
  "--pgroup",
  "--pidfile",
  "--session",
  "--signal",
  "--terminal",
  "--uid",
]);
// `-9`, `-KILL`, `-SIGTERM`: pkill's signal, not an option.
const SIGNAL = /^-(\d+|[A-Z]{2,}[A-Z0-9+-]*)$/;
const BRACKET_TRICK = /\[[^\]]+\]/;

// One option word of pkill / pgrep: whether it asks for `-f`, and how many
// of the following words it takes as its value.
const readOption = (word) => {
  if (word.startsWith("--")) {
    return {
      full: word === "--full",
      values: VALUE_LONG_OPTIONS.has(word) ? 1 : 0,
    };
  }
  let full = false;
  const letters = [...word.slice(1)];
  for (const [position, letter] of letters.entries()) {
    if (VALUE_OPTIONS.has(letter)) {
      // `-u me` takes the next word, `-ume` holds its own value.
      return { full, values: position === letters.length - 1 ? 1 : 0 };
    }
    full ||= letter === "f";
  }
  return { full, values: 0 };
};

const isOption = (word) =>
  word.startsWith("-") && word.length > 1 && !SIGNAL.test(word);

// Whether pkill / pgrep match the full command line (`-f`), and the pattern.
const processMatch = (words) => {
  let full = false;
  let index = 1;
  while (index < words.length && words[index] !== "--") {
    const word = words[index];
    if (!(isOption(word) || SIGNAL.test(word))) {
      return { full, pattern: word };
    }
    const option = isOption(word)
      ? readOption(word)
      : { full: false, values: 0 };
    full ||= option.full;
    index += 1 + option.values;
  }
  return { full, pattern: words[index + 1] };
};

const LONG_SLEEP_SECONDS = 5;
const SLEEP_UNITS = { "": 1, d: 86_400, h: 3600, m: 60, s: 1 };
const SLEEP_DURATION = /^(\d+(?:\.\d*)?|\.\d+)([smhd]?)$/;
const SLEEP_FOREVER = new Set(["inf", "infinity"]);

// How long `sleep` waits: the sum of its operands (`sleep 1m 30`), skipping
// any it can't read (`$DELAY`).
const sleepSeconds = (words) => {
  let seconds = 0;
  for (const word of words.slice(1)) {
    if (SLEEP_FOREVER.has(word)) {
      return Number.POSITIVE_INFINITY;
    }
    const match = SLEEP_DURATION.exec(word);
    if (match) {
      seconds += Number(match[1]) * SLEEP_UNITS[match[2]];
    }
  }
  return seconds;
};

const CHECKS = [
  {
    breaks: ({ words, operator }) => {
      if (words[0] !== "cd" || !(operator === "&&" || operator === ";")) {
        return false;
      }
      const target = cdTarget(words);
      return target !== undefined && !NOT_RELATIVE.test(target);
    },
    rule: "cd",
  },
  {
    breaks: ({ words }) => {
      if (!PROCESS_MATCHERS.has(words[0])) {
        return false;
      }
      const { full, pattern } = processMatch(words);
      return full && pattern !== undefined && !BRACKET_TRICK.test(pattern);
    },
    rule: "pkill",
  },
  {
    breaks: ({ words, background }) =>
      words[0] === "sleep" &&
      !background &&
      sleepSeconds(words) >= LONG_SLEEP_SECONDS,
    rule: "sleep",
  },
  {
    breaks: ({ words }) => words[0] === "timeout" || words[0] === "gtimeout",
    rule: "timeout",
  },
];

const parse = (command) => {
  try {
    return simpleCommands(new Lexer(command).run());
  } catch (error) {
    if (error instanceof UnterminatedError) {
      return [];
    }
    throw error;
  }
};

/**
 * The AGENTS.md Shell rules `command` breaks, each with its reason. An
 * unparseable command (an unterminated quote) breaks none: the shell will
 * refuse it anyway.
 *
 * @param {string} command
 * @param {{ background?: boolean }} [options] `background`: the Bash tool runs
 *   the whole command in the background (`run_in_background`).
 * @returns {{ rule: string, reason: string }[]}
 */
export const findShellRuleViolations = (command, options = {}) => {
  const commands = parse(command).map((simple) => ({
    ...simple,
    background: simple.background || options.background === true,
  }));
  return CHECKS.filter(({ breaks }) => commands.some(breaks)).map(
    ({ rule }) => ({ reason: RULES[rule], rule })
  );
};
