// The AGENTS.md Shell rules as a matcher over a Bash command. Pure string
// matching, no subprocess: the PreToolUse hook (check-shell-command.mjs) runs
// it before every Bash call. Rules only look at command words (the start of
// the command, or after &&, ||, ;, |, &, a newline, a parenthesis or a
// reserved word such as `then`), never at quoted strings, heredoc bodies,
// comments or command substitutions.

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const FD_NUMBER = /^\d+$/;
const LEADING_TABS = /^\t+/;
const WHITESPACE = new Set([" ", "\t"]);
const QUOTES = new Set(["'", '"', "`"]);
const AND_OR_PIPE = new Set(["&&", "||", "|"]);
const DELIMITER_END = new Set([
  " ",
  "\t",
  "\n",
  ";",
  "&",
  "|",
  "<",
  ">",
  "(",
  ")",
]);

class UnterminatedError extends Error {}

const unterminated = () => {
  throw new UnterminatedError("unterminated quote or substitution");
};

// The index just past the `'…'` opened at `start`.
const skipSingleQuoted = (source, start) => {
  const end = source.indexOf("'", start + 1);
  return end === -1 ? unterminated() : end + 1;
};

// The index just past the `` `…` ``, or `$'…'` quote (backslash escapes, no
// substitutions) opened at `start`.
const skipEscaped = (source, start) => {
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

// The index just past the `"…"` opened at `start`: a `$(…)`, `${…}` or
// `` `…` `` inside it is skipped whole, so its own quotes don't end the string.
const skipDoubleQuoted = (source, start) => {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      return index + 1;
    }
    if (char === "\\") {
      index += 2;
    } else if (char === "$" && "({".includes(source[index + 1])) {
      index = skipGroup(source, index + 1);
    } else if (char === "`") {
      index = skipEscaped(source, index);
    } else {
      index += 1;
    }
  }
  return unterminated();
};

const skipQuote = (source, start) => {
  if (source[start] === "'") {
    return skipSingleQuoted(source, start);
  }
  return source[start] === '"'
    ? skipDoubleQuoted(source, start)
    : skipEscaped(source, start);
};

// The index just past the heredoc body starting at `start`: the line equal
// to its delimiter included.
const skipHeredocBody = (source, start, { delimiter, stripTabs }) => {
  let index = start;
  while (index < source.length) {
    const end = source.indexOf("\n", index);
    const lineEnd = end === -1 ? source.length : end;
    const line = source.slice(index, lineEnd);
    index = Math.min(lineEnd + 1, source.length);
    if ((stripTabs ? line.replace(LEADING_TABS, "") : line) === delimiter) {
      break;
    }
  }
  return index;
};

// The heredoc a `<<` at `start` opens, and the index just past its delimiter.
const readHeredoc = (source, start) => {
  let index = start + 2;
  const stripTabs = source[index] === "-";
  index += stripTabs ? 1 : 0;
  while (WHITESPACE.has(source[index])) {
    index += 1;
  }
  let delimiter = "";
  while (index < source.length && !DELIMITER_END.has(source[index])) {
    if (QUOTES.has(source[index])) {
      const end = skipQuote(source, index);
      delimiter += source.slice(index + 1, end - 1);
      index = end;
    } else {
      delimiter += source[index];
      index += 1;
    }
  }
  return { end: index, heredoc: { delimiter, stripTabs } };
};

// Inside a group: the index just past the escape, quote or heredoc at
// `index` (a newline skips the heredoc bodies it starts), or -1 for a plain
// character.
const skipInGroup = (source, index, heredocs) => {
  const char = source[index];
  if (char === "\\") {
    return index + 2;
  }
  if (QUOTES.has(char)) {
    return skipQuote(source, index);
  }
  if (source.startsWith("<<", index) && source[index + 2] !== "<") {
    const { end, heredoc } = readHeredoc(source, index);
    heredocs.push(heredoc);
    return end;
  }
  if (char === "\n") {
    let next = index + 1;
    for (const heredoc of heredocs.splice(0)) {
      next = skipHeredocBody(source, next, heredoc);
    }
    return next;
  }
  return -1;
};

// The index just past the `(…)` or `{…}` opened at `start`, nesting, quotes
// and heredoc bodies inside included.
const skipGroup = (source, start) => {
  const open = source[start];
  const close = open === "(" ? ")" : "}";
  const heredocs = [];
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const skipped = skipInGroup(source, index, heredocs);
    if (skipped === -1) {
      const char = source[index];
      depth += (char === open ? 1 : 0) - (char === close ? 1 : 0);
      index += 1;
      if (depth === 0) {
        return index;
      }
    } else {
      index = skipped;
    }
  }
  return unterminated();
};

// What the lexer's next word is.
const NEXT = {
  heredoc: "heredoc delimiter",
  heredocTabs: "heredoc delimiter, tabs stripped",
  skip: "redirection target",
  word: "word",
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
    this.next = NEXT.word;
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
    } else if (QUOTES.has(char) || (char === "$" && following === "'")) {
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
      if (this.next === NEXT.word) {
        this.tokens.push({ type: "word", value: this.word });
      } else if (this.next !== NEXT.skip) {
        this.heredocs.push({
          delimiter: this.word,
          stripTabs: this.next === NEXT.heredocTabs,
        });
      }
      this.next = NEXT.word;
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
    // `$'…'` (ANSI-C quoting) takes backslash escapes, like a backquote.
    const start = char === "$" ? this.index + 1 : this.index;
    const end =
      char === "$"
        ? skipEscaped(this.source, start)
        : skipQuote(this.source, start);
    this.append(
      char === "`"
        ? this.source.slice(start, end)
        : this.source.slice(start + 1, end - 1)
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
    this.flush();
    const last = this.tokens.at(-1);
    if (last?.type === "operator" && AND_OR_PIPE.has(last.value)) {
      // A newline after `&&`, `||` or `|` continues the list.
      this.index += 1;
    } else {
      this.operator("\n", 1);
    }
    for (const heredoc of this.heredocs.splice(0)) {
      this.index = skipHeredocBody(this.source, this.index, heredoc);
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
      this.next = NEXT.skip;
    } else if (rest.startsWith("<<-")) {
      this.index += 3;
      this.next = NEXT.heredocTabs;
    } else if (rest.startsWith("<<")) {
      this.index += 2;
      this.next = NEXT.heredoc;
    } else {
      this.index += ">&|<".includes(rest[1]) ? 2 : 1;
      this.next = NEXT.skip;
    }
  }

  control(char, following) {
    if (char === "&" && following === ">") {
      // `&>` / `&>>`: both streams to a file.
      this.flush();
      this.index += this.source[this.index + 2] === ">" ? 3 : 2;
      this.next = NEXT.skip;
    } else if (char === following) {
      // `&&`, `||`, or `;;` ending a case branch.
      this.operator(char + char, 2);
    } else {
      // `|&` pipes like `|`.
      this.operator(char, char === "|" && following === "&" ? 2 : 1);
    }
  }
}

// Reserved words that open a compound command, each with the word closing it.
const OPENERS = new Map([
  ["case", "esac"],
  ["for", "done"],
  ["if", "fi"],
  ["select", "done"],
  ["until", "done"],
  ["while", "done"],
  ["{", "}"],
]);
// Reserved words and prefixes after which the next word is still a command.
const COMMAND_PREFIXES = new Set(["!", "do", "elif", "else", "then", "time"]);

// Groups the tokens into simple commands, each with its words, the operator
// right after it, and whether it runs in the background: a `&` backgrounds
// the whole and-or list before it, compound commands (`while …; done &`,
// `( … ) &`, `{ …; } &`) included. Function bodies never run, so they're
// left out, and so are a `case`'s subject and patterns (`timeout) …;;`).
class Parser {
  constructor() {
    this.frames = [this.frame(null, false)];
    this.words = [];
    this.definesFunction = false;
    this.skipsOperator = false;
  }

  frame(closer, definition) {
    return {
      // Where a `case` is: its "subject", a "pattern" or a branch "body".
      casePart: closer === "esac" ? "subject" : null,
      closer,
      commands: [],
      definition,
      list: [],
    };
  }

  get inCaseHeader() {
    return this.top.casePart === "subject" || this.top.casePart === "pattern";
  }

  get top() {
    return this.frames.at(-1);
  }

  run(tokens) {
    for (const [position, token] of tokens.entries()) {
      if (token.type === "word") {
        this.word(token.value);
      } else if (this.skipsOperator) {
        this.skipsOperator = false;
      } else {
        this.operator(token.value, tokens[position + 1]);
      }
    }
    this.end(null);
    while (this.frames.length > 1) {
      this.close();
    }
    return this.top.commands;
  }

  word(value) {
    if (this.inCaseHeader) {
      this.caseWord(value);
    } else if (this.words.length > 0) {
      this.words.push(value);
    } else if (value === "function") {
      this.definesFunction = true;
    } else if (OPENERS.has(value)) {
      this.open(OPENERS.get(value));
    } else if (value === this.top.closer) {
      this.close();
    } else if (!(ASSIGNMENT.test(value) || COMMAND_PREFIXES.has(value))) {
      this.words.push(value);
    }
  }

  caseWord(value) {
    if (this.top.casePart === "subject" && value === "in") {
      this.top.casePart = "pattern";
    } else if (this.top.casePart === "pattern" && value === "esac") {
      this.close();
    }
  }

  operator(value, following) {
    if (this.inCaseHeader) {
      if (value === ")" && this.top.casePart === "pattern") {
        this.top.casePart = "body";
      }
      return;
    }
    if (value === ";;" && this.top.casePart === "body") {
      this.top.casePart = "pattern";
    }
    if (value === "(") {
      this.parenthesis(following);
      return;
    }
    this.end(value);
    if (value === ")" && this.top.closer === ")") {
      this.close();
    } else if (value === "&") {
      for (const command of this.top.list) {
        command.background = true;
      }
      this.top.list = [];
    } else if (!AND_OR_PIPE.has(value)) {
      this.top.list = [];
    }
  }

  parenthesis(following) {
    if (this.words.length === 1 && following?.value === ")") {
      // `name() …`: a function definition, its `)` skipped.
      this.words = [];
      this.definesFunction = true;
      this.skipsOperator = true;
      return;
    }
    this.end("(");
    this.open(")");
  }

  open(closer) {
    if (this.definesFunction && this.words.length > 0) {
      // `function name {`: the name was read as a command word.
      this.words = [];
    }
    this.frames.push(this.frame(closer, this.definesFunction));
    this.definesFunction = false;
  }

  close() {
    this.end(null);
    const frame = this.frames.pop();
    if (!frame.definition) {
      this.top.commands.push(...frame.commands);
      this.top.list.push(...frame.commands);
    }
  }

  end(operator) {
    if (this.words.length === 0 || this.definesFunction) {
      return;
    }
    const command = { background: false, operator, words: this.words };
    this.top.commands.push(command);
    this.top.list.push(command);
    this.words = [];
  }
}

// Commands that run the command after them, each with its options taking a
// value: `sudo -u me timeout 5 x` runs `timeout`.
const WRAPPERS = new Map([
  ["command", new Set()],
  ["env", new Set(["-C", "-S", "-u"])],
  ["exec", new Set(["-a"])],
  ["nice", new Set(["-n"])],
  ["nohup", new Set()],
  ["sudo", new Set(["-C", "-D", "-g", "-h", "-p", "-r", "-t", "-U", "-u"])],
]);

const INTROSPECTION = new Set(["-V", "-v"]);

const commandName = (word) => word.split("/").at(-1);

// The words of the command a simple command runs, past its wrappers.
const unwrap = (words) => {
  let index = 0;
  while (index < words.length && WRAPPERS.has(commandName(words[index]))) {
    if (INTROSPECTION.has(words[index + 1])) {
      // `command -v timeout` describes the command, never runs it.
      return [];
    }
    const valueOptions = WRAPPERS.get(commandName(words[index]));
    index += 1;
    while (
      index < words.length &&
      (words[index].startsWith("-") || ASSIGNMENT.test(words[index]))
    ) {
      index += valueOptions.has(words[index]) ? 2 : 1;
    }
  }
  return words.slice(index);
};

// `$VAR/…` may well be absolute: only a plain relative path is refused.
const NOT_RELATIVE = /^[/~$]/;
const CD_CHAINS = new Set(["&&", ";", "\n"]);

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

// The shell running pkill / pgrep has the whole command in its own command
// line, so a pattern matching that text (`ultracite`, `node.*[0-9]`) matches
// the shell itself. The bracket trick (`[u]ltracite`) is safe because it
// doesn't. A pattern JavaScript can't read as a regex is let through.
const matchesItself = (pattern, line) => {
  try {
    return new RegExp(pattern).test(line);
  } catch {
    return false;
  }
};

// One option word of pkill / pgrep: whether it asks for `-f`, and how many
// of the following words it takes as its value.
const readOption = (word) => {
  if (word.startsWith("--")) {
    return {
      full: word === "--full",
      valueWords: VALUE_LONG_OPTIONS.has(word) ? 1 : 0,
    };
  }
  let full = false;
  const letters = [...word.slice(1)];
  for (const [position, letter] of letters.entries()) {
    if (VALUE_OPTIONS.has(letter)) {
      // `-u me` takes the next word, `-ume` holds its own value.
      return { full, valueWords: position === letters.length - 1 ? 1 : 0 };
    }
    full ||= letter === "f";
  }
  return { full, valueWords: 0 };
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
      : { full: false, valueWords: 0 };
    full ||= option.full;
    index += 1 + option.valueWords;
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

// Each rule: its name, the reason the agent is shown, and whether a simple
// command (`name` is the command run, past any wrapper) breaks it.
const CHECKS = [
  {
    breaks: ({ name, words, operator }) => {
      if (name !== "cd" || !CD_CHAINS.has(operator)) {
        return false;
      }
      const target = cdTarget(words);
      return target !== undefined && !NOT_RELATIVE.test(target);
    },
    reason:
      "AGENTS.md Shell: never `cd` to a relative path before `&&`, `;` or another line, the working directory carries over between calls: use an absolute path, `git -C <path>` or `pnpm --filter <package>`.",
    rule: "cd",
  },
  {
    breaks: ({ line, name, words }) => {
      if (!PROCESS_MATCHERS.has(name)) {
        return false;
      }
      const { full, pattern } = processMatch(words);
      return full && pattern !== undefined && matchesItself(pattern, line);
    },
    reason:
      "AGENTS.md Shell: `pkill -f` / `pgrep -f` match your own shell, whose command line holds the pattern: bracket a letter (`'[u]ltracite'`) so the pattern can't match its own text, or kill a saved PID.",
    rule: "pkill",
  },
  {
    breaks: ({ name, words, background }) =>
      name === "sleep" &&
      !background &&
      sleepSeconds(words) >= LONG_SLEEP_SECONDS,
    reason:
      "AGENTS.md Shell: no foreground `sleep` of 5 s or more: use Monitor, a background command (`run_in_background`) or `watch_pull_request`.",
    rule: "sleep",
  },
  {
    breaks: ({ name }) => name === "timeout" || name === "gtimeout",
    reason:
      "AGENTS.md Shell: macOS has neither `timeout` nor `gtimeout`: use the Bash tool's own timeout.",
    rule: "timeout",
  },
];

const parse = (command) => {
  try {
    return new Parser().run(new Lexer(command.trimEnd()).run());
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
  const commands = parse(command).flatMap((simple) => {
    const words = unwrap(simple.words);
    return words.length === 0
      ? []
      : [
          {
            ...simple,
            background: simple.background || options.background === true,
            line: command,
            name: commandName(words[0]),
            words,
          },
        ];
  });
  return CHECKS.filter(({ breaks }) => commands.some(breaks)).map(
    ({ reason, rule }) => ({ reason, rule })
  );
};
