// The AGENTS.md Shell rules as a matcher over a Bash command. Pure string
// matching, no subprocess: the PreToolUse hook (check-shell-command.mjs) runs
// it before every Bash call. Rules only look at command words (the start of
// the command, or after &&, ||, ;, |, &, a newline, a parenthesis or a
// reserved word such as `then`), never at quoted strings, heredoc bodies or
// comments. The commands inside a substitution (`$(…)`, `` `…` ``, `<(…)`),
// quoted or not, are checked as commands of their own.

// `NAME=…`, `NAME+=…` or `NAME[i]=…`.
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;
// `2>…` or `{fd}>…`: the descriptor a redirection opens, no command word.
const FD_NUMBER = /^(\d+|\{[A-Za-z_][A-Za-z0-9_]*\})$/;
const LEADING_TABS = /^\t+/;
const WHITESPACE = new Set([" ", "\t"]);
const QUOTES = new Set(["'", '"', "`"]);
const AND_OR_PIPE = new Set(["&&", "||", "|"]);
// Characters after which a `#` starts a comment inside a substitution.
const COMMENT_AFTER = new Set([" ", "\t", "\n", ";"]);
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

// The commands inside each substitution of a word as written: `$(…)`,
// `` `…` ``, `<(…)` and `>(…)`, in or out of double quotes, never in single
// quotes or arithmetic (`$((…))`).
const substitutionsIn = (raw) => {
  const bodies = [];
  let inDouble = false;
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    const opensGroup = "$<>".includes(char) && raw[index + 1] === "(";
    if (char === "\\") {
      index += 2;
    } else if (char === "$" && raw[index + 1] === "'" && !inDouble) {
      index = skipEscaped(raw, index + 1);
    } else if (char === '"') {
      inDouble = !inDouble;
      index += 1;
    } else if (char === "'" && !inDouble) {
      index = skipSingleQuoted(raw, index);
    } else if (char === "`") {
      const end = skipEscaped(raw, index);
      bodies.push(raw.slice(index + 1, end - 1));
      index = end;
    } else if (opensGroup && raw[index + 2] !== "(") {
      const end = skipGroup(raw, index + 1);
      bodies.push(raw.slice(index + 2, end - 1));
      index = end;
    } else if (opensGroup) {
      index = skipGroup(raw, index + 1);
    } else {
      index += 1;
    }
  }
  return bodies;
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
    } else if (source[index] === "\\") {
      // `<<\EOF` quotes the delimiter: the backslash is removed.
      delimiter += source[index + 1] ?? "";
      index += 2;
    } else {
      delimiter += source[index];
      index += 1;
    }
  }
  return { end: index, heredoc: { delimiter, stripTabs } };
};

// Inside a group: the index just past the escape, quote, comment or heredoc
// at `index` (a newline skips the heredoc bodies it starts), or -1 for a plain
// character. `comments` and `heredocs` (null: none) come from the group.
const skipInGroup = (source, index, { comments, heredocs }) => {
  const char = source[index];
  if (char === "\\") {
    return index + 2;
  }
  if (comments && char === "#" && COMMENT_AFTER.has(source[index - 1])) {
    // A comment runs to the end of its line, quotes and all.
    const end = source.indexOf("\n", index);
    return end === -1 ? source.length : end;
  }
  if (QUOTES.has(char)) {
    return skipQuote(source, index);
  }
  const opensHeredoc =
    heredocs !== null &&
    source.startsWith("<<", index) &&
    source[index + 2] !== "<";
  if (opensHeredoc) {
    const { end, heredoc } = readHeredoc(source, index);
    heredocs.push(heredoc);
    return end;
  }
  if (char === "\n") {
    let next = index + 1;
    for (const heredoc of heredocs?.splice(0) ?? []) {
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
  const arithmetic = open === "(" && source[start + 1] === "(";
  const context = {
    // Only commands, in `$(…)` or `(…)`, have comments: in `${…}` and
    // arithmetic a `#` is text.
    comments: open === "(" && !arithmetic,
    // Only commands have heredocs: in `${…}` and arithmetic, `<<` is text or
    // a shift.
    heredocs: open === "(" && !arithmetic ? [] : null,
  };
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const skipped = skipInGroup(source, index, context);
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

const EXPRESSION_START = new Set([" ", "\t", "\n"]);

// The index just past the `[[ … ]]` opened at `start`, quotes inside skipped.
const skipConditional = (source, start) => {
  let index = start + 2;
  while (index < source.length) {
    if (source.startsWith("]]", index)) {
      return index + 2;
    }
    if (source[index] === "\\") {
      index += 2;
    } else if (QUOTES.has(source[index])) {
      index = skipQuote(source, index);
    } else {
      index += 1;
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
    this.substitutions = [];
    this.heredocs = [];
    this.word = null;
    this.wordStart = 0;
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
    } else if (this.word === null && this.startsExpression(char, following)) {
      this.expression(char);
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
      this.parenthesis(char);
    } else {
      this.append(char);
      this.index += 1;
    }
  }

  // `[[ … ]]` or `(( … ))` at a word start: an expression, not commands.
  startsExpression(char, following) {
    if (char === "(") {
      return following === "(";
    }
    return (
      char === "[" &&
      following === "[" &&
      EXPRESSION_START.has(this.source[this.index + 2])
    );
  }

  expression(char) {
    const end =
      char === "("
        ? skipGroup(this.source, this.index)
        : skipConditional(this.source, this.index);
    this.append(this.source.slice(this.index, end));
    this.index = end;
  }

  parenthesis(char) {
    if (char === "(" && this.word?.endsWith("=")) {
      // `name=(…)`: an array assignment, its elements no commands.
      const end = skipGroup(this.source, this.index);
      this.append(this.source.slice(this.index, end));
      this.index = end;
    } else {
      this.operator(char, 1);
    }
  }

  append(text) {
    if (this.word === null) {
      this.wordStart = this.index;
    }
    this.word = (this.word ?? "") + text;
  }

  flush() {
    if (this.word !== null) {
      // `raw`: the word as written, quotes and all (`"$x"` vs `$x`).
      const raw = this.source.slice(this.wordStart, this.index);
      if (this.next !== NEXT.heredoc && this.next !== NEXT.heredocTabs) {
        this.substitutions.push(...substitutionsIn(raw));
      }
      if (this.next === NEXT.word) {
        this.tokens.push({ raw, type: "word", value: this.word });
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
const LOOP_HEADERS = new Set(["for", "select"]);
// Reserved words and prefixes after which the next word is still a command.
const COMMAND_PREFIXES = new Set(["!", "do", "elif", "else", "then"]);

// Groups the tokens into simple commands, each with its words, the operator
// right after it, and whether it runs in the background: a `&` backgrounds
// the whole and-or list before it, compound commands (`while …; done &`,
// `( … ) &`, `{ …; } &`) included. Function bodies never run, so they're
// left out, and so are a `case`'s subject and patterns (`timeout) …;;`).
// Each `for` / `select` header (`name in …`) is kept apart, as its word
// tokens, raw text included.
class Parser {
  constructor() {
    this.frames = [this.frame(null, false)];
    this.loops = [];
    this.words = [];
    this.definesFunction = false;
    this.skipsOperator = false;
    this.skipsWord = false;
    this.timed = false;
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
        this.word(token);
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
    return { commands: this.top.commands, loops: this.loops };
  }

  word(token) {
    const { value } = token;
    const { timed } = this;
    this.timed = false;
    if (this.skipsWord) {
      this.skipsWord = false;
    } else if (this.top.inLoopHeader) {
      this.loopHeaderWord(token);
    } else if (this.inCaseHeader) {
      this.caseWord(value);
    } else if (this.words.length > 0) {
      this.words.push(value);
    } else if (value === "time" || (timed && value.startsWith("-"))) {
      // `time [-p] …`: the timed command comes next, simple or compound.
      this.timed = true;
    } else if (value === "function") {
      // `function name …`: the name is no command.
      this.definesFunction = true;
      this.skipsWord = true;
    } else if (OPENERS.has(value)) {
      this.open(OPENERS.get(value));
      // `for name in …; do`: the header names no command.
      this.top.inLoopHeader = LOOP_HEADERS.has(value);
      this.top.loopHeader = [];
    } else if (value === this.top.closer) {
      this.close();
    } else if (!(ASSIGNMENT.test(value) || COMMAND_PREFIXES.has(value))) {
      this.words.push(value);
    }
  }

  loopHeaderWord(token) {
    if (token.value === "do") {
      this.top.inLoopHeader = false;
      this.loops.push(this.top.loopHeader);
    } else {
      this.top.loopHeader.push(token);
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
    if (this.top.inLoopHeader) {
      return;
    }
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
    const named = this.words.length === 1 || this.definesFunction;
    if (named && following?.value === ")") {
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
  ["env", new Set(["-C", "-S", "-u", "--chdir", "--split-string", "--unset"])],
  ["exec", new Set(["-a"])],
  ["nice", new Set(["-n", "--adjustment"])],
  ["nohup", new Set()],
  ["time", new Set()],
  [
    "sudo",
    new Set([
      "-C",
      "-D",
      "-g",
      "-h",
      "-p",
      "-R",
      "-r",
      "-T",
      "-t",
      "-U",
      "-u",
      "--chdir",
      "--chroot",
      "--close-from",
      "--command-timeout",
      "--group",
      "--host",
      "--other-user",
      "--prompt",
      "--role",
      "--type",
      "--user",
    ]),
  ],
]);

const INTROSPECTION = new Set(["-V", "-v"]);

const commandName = (word) => word.split("/").at(-1);

// The words of the command a simple command runs, past its wrappers.
const unwrap = (words) => {
  let index = 0;
  while (index < words.length && WRAPPERS.has(commandName(words[index]))) {
    if (
      commandName(words[index]) === "command" &&
      INTROSPECTION.has(words[index + 1])
    ) {
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
const VALUE_OPTIONS = new Set([
  "F",
  "G",
  "O",
  "P",
  "U",
  "d",
  "g",
  "r",
  "s",
  "t",
  "u",
]);
const VALUE_LONG_OPTIONS = new Set([
  "--cgroup",
  "--delimiter",
  "--env",
  "--euid",
  "--group",
  "--ns",
  "--nslist",
  "--older",
  "--parent",
  "--pgroup",
  "--pidfile",
  "--runstates",
  "--session",
  "--signal",
  "--terminal",
  "--uid",
]);
// `-9`, `-KILL`, `-SIGTERM`: pkill's signal, not an option.
const SIGNAL = /^-(\d+|[A-Z]{2,}[A-Z0-9+-]*)$/;

const POSIX_CLASS = /\[:([a-z]+):\]/g;
const POSIX_CLASSES = {
  alnum: "A-Za-z0-9",
  alpha: "A-Za-z",
  blank: " \\t",
  cntrl: "\\x00-\\x1f\\x7f",
  digit: "0-9",
  graph: "!-~",
  lower: "a-z",
  print: " -~",
  punct: "!-/:-@\\[-`{-~",
  space: "\\s",
  upper: "A-Z",
  xdigit: "0-9A-Fa-f",
};

// The shell running pkill / pgrep has the whole command in its own command
// line, so a pattern matching that text (`ultracite`, `node.*[0-9]`) matches
// the shell itself. The bracket trick (`[u]ltracite`) is safe because it
// doesn't. POSIX classes (`[:alpha:]`) are read as JavaScript ranges first;
// a pattern JavaScript still can't read counts as matching, since pkill might.
const matchesItself = (pattern, line) => {
  const translated = pattern.replace(
    POSIX_CLASS,
    (match, name) => POSIX_CLASSES[name] ?? match
  );
  try {
    return new RegExp(translated).test(line);
  } catch {
    return true;
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

// `$name` or `${name}` alone: a scalar zsh never word-splits.
const BARE_VARIABLE = /^\$([A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})$/;

// `for name in $var`: the whole word list one bare, unquoted variable.
const loopsOverBareVariable = (header) => {
  const [, keyword, ...list] = header;
  return (
    keyword?.value === "in" &&
    list.length === 1 &&
    BARE_VARIABLE.test(list[0].raw)
  );
};

// Package runners that run the command named after them (`pnpm exec x`).
const RUNNERS = new Set(["bunx", "npx", "pnpm", "yarn"]);

// The arguments a command gives `tool`, run directly or through a package
// runner (`pnpm exec supabase status`), or null when it doesn't run it.
const toolArguments = (name, words, tool) => {
  if (name === tool) {
    return words.slice(1);
  }
  const index = RUNNERS.has(name) ? words.indexOf(tool) : -1;
  return index > 0 ? words.slice(index + 1) : null;
};

const beforeDoubleDash = (words) => {
  const end = words.indexOf("--");
  return end === -1 ? words : words.slice(0, end);
};

// The Supabase CLI's legacy `-o` / `--output` flag (not `--output-format`).
const isLegacyOutputFlag = (word) =>
  word === "--output" ||
  word.startsWith("--output=") ||
  (word.startsWith("-o") && !word.startsWith("--"));

const PROD_ENVIRONMENT = /^prod(uction)?$/;
// Splits `--env=prod` into the flag and its value.
const FIRST_EQUALS = /[=](.*)/s;
const ENV_FLAGS = new Set(["--env", "-e"]);
// Infisical options taking the next word as their value.
const INFISICAL_VALUE_OPTIONS = new Set([
  "--domain",
  "--env",
  "--path",
  "--projectId",
  "--tags",
  "--token",
  "--type",
  "-e",
  "-t",
]);
// `infisical secrets <these>` writes or manages; anything else prints values.
const INFISICAL_SECRET_WRITES = new Set([
  "delete",
  "folders",
  "generate-example-env",
  "set",
]);

// Whether `infisical …` asks for the `prod` environment's values: `secrets`
// (listing), `secrets get`, `export` or `run`, with `--env=prod`.
const readsProdSecrets = (args) => {
  const words = beforeDoubleDash(args);
  let prod = false;
  const positionals = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const [flag, value] = word.split(FIRST_EQUALS);
    if (ENV_FLAGS.has(flag)) {
      prod ||= PROD_ENVIRONMENT.test(value ?? words[index + 1] ?? "");
    }
    if (word.startsWith("-")) {
      index += INFISICAL_VALUE_OPTIONS.has(word) ? 1 : 0;
    } else {
      positionals.push(word);
    }
  }
  const [command, subcommand] = positionals;
  const reads =
    command === "export" ||
    command === "run" ||
    (command === "secrets" && !INFISICAL_SECRET_WRITES.has(subcommand));
  return prod && reads;
};

// A `.env`, `.env.local`, `apps/api/.env.production` … but not the
// committed `.env.example` files, which hold no secret.
const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/;
const isEnvFile = (word) => ENV_FILE.test(word) && !word.endsWith(".example");

const FILE_READERS = new Set([
  "bat",
  "cat",
  "egrep",
  "fgrep",
  "grep",
  "head",
  "less",
  "more",
  "rg",
  "sed",
  "tail",
]);
const GREPS = new Set(["egrep", "fgrep", "grep", "rg"]);
// grep options after which no matched line is printed.
const QUIET_GREP_LETTERS = /^-[A-Za-z]*[cLlq]/;
const QUIET_GREP_OPTIONS = new Set([
  "--count",
  "--files-with-matches",
  "--files-without-match",
  "--quiet",
  "--silent",
]);
// `cut -d= -f1`, `cut -d '=' -f 1`, `cut --delimiter== --fields=1`.
const CUT_EQUALS_DELIMITER = /(^| )(-d ?|--delimiter[= ])=( |$)/;
const CUT_FIRST_FIELD = /(^| )(-f ?|--fields[= ])1( |$)/;
// `s/=.*/…/`: a sed script dropping everything from the first `=`.
const STRIPPING_SED_SCRIPT = /^s(.)=\.\*\1/;

const printsLines = ({ name, words }) => {
  const options = words.slice(1).filter((word) => word.startsWith("-"));
  if (GREPS.has(name)) {
    return !options.some(
      (word) =>
        QUIET_GREP_OPTIONS.has(word) ||
        (!word.startsWith("--") && QUIET_GREP_LETTERS.test(word))
    );
  }
  // `sed -i` edits the file in place and prints nothing.
  return (
    name !== "sed" ||
    !options.some((word) => word.startsWith("-i") || word === "--in-place")
  );
};

const readsEnvFile = (command) =>
  FILE_READERS.has(command.name) &&
  command.words.slice(1).some(isEnvFile) &&
  printsLines(command);

// `cut -d= -f1` or `sed 's/=.*/…/'`: names only, values stripped.
const stripsValues = ({ name, words }) => {
  if (name === "sed") {
    return words.some((word) => STRIPPING_SED_SCRIPT.test(word));
  }
  if (name !== "cut") {
    return false;
  }
  const joined = words.slice(1).join(" ");
  return CUT_EQUALS_DELIMITER.test(joined) && CUT_FIRST_FIELD.test(joined);
};

// Splits the simple commands into pipelines: runs joined by `|`.
const pipelines = (commands) => {
  const groups = [];
  let current = [];
  for (const command of commands) {
    current.push(command);
    if (command.operator !== "|") {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
};

const WORD_SPLIT_REASON =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text, not a template.
  'AGENTS.md Shell: zsh doesn\'t word-split an unquoted `$var`, so `for x in $var` runs once with the whole list as one word: use an array (`files=(a b); for f in "${files[@]}"`), `${=var}`, or pipe NUL-separated names into `xargs -0` (`git ls-files -z`, `grep -rlZ`).';

// Each rule: its name, the reason the agent is shown, and whether it's broken
// by a simple command (`name` is the command run, past any wrapper), by a
// pipeline (`scope: "pipeline"`, its simple commands) or by a `for` /
// `select` header (`scope: "loop"`, its word tokens).
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
  {
    breaks: (header) => loopsOverBareVariable(header),
    reason: WORD_SPLIT_REASON,
    rule: "word-split",
    scope: "loop",
  },
  {
    breaks: ({ name, words }) =>
      beforeDoubleDash(toolArguments(name, words, "supabase") ?? []).some(
        isLegacyOutputFlag
      ),
    reason:
      "AGENTS.md Shell: the Supabase CLI refuses its legacy `-o` / `--output` flag: use `--output-format json`.",
    rule: "supabase-output",
  },
  {
    breaks: ({ name, words }) =>
      name === "infisical" && readsProdSecrets(words.slice(1)),
    reason:
      "AGENTS.md Shell: `prod` secret values never enter a local shell, file or command line (`infisical secrets get|export|run --env=prod`; docs/agents/secrets.md, Handling values): smoke-test a deployment through `/health`, a development-instance Clerk token or the Vercel MCP and logs, and ask the human when a prod credential is truly needed.",
    rule: "infisical-prod",
  },
  {
    breaks: (pipeline) =>
      pipeline.some(readsEnvFile) && !pipeline.some(stripsValues),
    reason:
      "AGENTS.md Shell: never print a `.env*` file's values (docs/agents/secrets.md, Handling values): list the names only (`cut -d= -f1 <file>`, or `sed -E 's/=.*/=…/' <file>`), or check one exists with `grep -q '^NAME=' <file>`. BSD sed (macOS) has no `\\|`: use `sed -E` with `|`.",
    rule: "env-file",
    scope: "pipeline",
  },
];

const parse = (command) => {
  try {
    const lexer = new Lexer(command.trimEnd());
    const parsed = new Parser().run(lexer.run());
    return { ...parsed, substitutions: lexer.substitutions };
  } catch (error) {
    if (error instanceof UnterminatedError) {
      return { commands: [], loops: [], substitutions: [] };
    }
    throw error;
  }
};

// The names of the rules `command` breaks, its substitutions' commands
// included.
const brokenRules = (command, options) => {
  const parsed = parse(command);
  const commands = parsed.commands.flatMap((simple) => {
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
  const scopes = {
    command: commands,
    loop: parsed.loops,
    pipeline: pipelines(commands),
  };
  const rules = new Set(
    CHECKS.filter(({ breaks, scope = "command" }) =>
      scopes[scope].some(breaks)
    ).map(({ rule }) => rule)
  );
  for (const body of parsed.substitutions) {
    for (const rule of brokenRules(body, options)) {
      rules.add(rule);
    }
  }
  return rules;
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
  const rules = brokenRules(command, options);
  return CHECKS.filter(({ rule }) => rules.has(rule)).map(
    ({ reason, rule }) => ({ reason, rule })
  );
};
