// The AGENTS.md Shell rules as a matcher over a Bash command. Pure string
// matching, no subprocess: the PreToolUse hook (check-shell-command.mjs) runs
// it before every Bash call. Rules only look at command words (the start of
// the command, or after &&, ||, ;, |, &, a newline, a parenthesis or a
// reserved word such as `then`), never at quoted strings, heredoc bodies or
// comments. The commands inside a substitution (`$(…)`, `` `…` ``, `<(…)`),
// quoted or not, are checked as commands of their own.

/**
 * @typedef {{ type: "word", raw: string, value: string }} WordToken
 * @typedef {WordToken | { type: "operator", value: string }} Token
 * @typedef {{ delimiter: string, stripTabs: boolean }} Heredoc
 * @typedef {{ comments: boolean, heredocs: Heredoc[] | null }} GroupContext
 * @typedef {{ end: number, body?: string }} Substitution
 * @typedef {{ background: boolean, operator: string | null, words: string[] }} SimpleCommand
 * @typedef {{ closer: string | null, definition: boolean, casePart: string | null, commands: SimpleCommand[], list: SimpleCommand[], inLoopHeader?: boolean, loopHeader?: WordToken[] }} Frame
 * @typedef {{ assignments: string[], commands: SimpleCommand[], everyCommand: string[][], loops: WordToken[][] }} Parsed
 * @typedef {Parsed & { substitutions: string[] }} ParsedShell
 * @typedef {{ background?: boolean, projectDir?: string }} Options
 * @typedef {SimpleCommand & { line: string, name: string, projectDir?: string }} Command
 * @typedef {{ rule: string, reason: string } & (
 *   { scope?: "command", breaks: (command: Command) => boolean } |
 *   { scope: "pipeline", breaks: (pipeline: Command[]) => boolean } |
 *   { scope: "loop", breaks: (header: WordToken[]) => boolean } |
 *   { scope: "parsed", breaks: (parsed: ParsedShell) => boolean }
 * )} Check
 */

// `NAME=…`, `NAME+=…` or `NAME[i]=…`.
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=/u;

// `2>…` or `{fd}>…`: the descriptor a redirection opens, no command word.
const FD_NUMBER = /^(?:\d+|\{[A-Za-z_][A-Za-z0-9_]*\})$/u;
const LEADING_TABS = /^\t+/u;
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

const UNTERMINATED = new Error("unterminated quote or substitution");

UNTERMINATED.name = "UnterminatedError";

/** @type {() => never} */
const unterminated = () => {
  throw UNTERMINATED;
};

// The index just past the `'…'` opened at `start`.
/** @type {(source: string, start: number) => number} */
const skipSingleQuoted = (source, start) => {
  const end = source.indexOf("'", start + 1);

  return end === -1 ? unterminated() : end + 1;
};

// The index just past the `` `…` ``, or `$'…'` quote (backslash escapes, no
// substitutions) opened at `start`.
/** @type {(source: string, start: number) => number} */
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

const scanner = {
  // The index just past the `"…"` opened at `start`: a `$(…)`, `${…}` or
  // `` `…` `` inside it is skipped whole, so its own quotes don't end the string.
  /**
   * @param {string} source The shell source.
   * @param {number} start The opening quote index.
   * @returns {number} The position after the scanned construct.
   */
  skipDoubleQuoted(source, start) {
    let index = start + 1;

    while (index < source.length) {
      const char = source[index];

      if (char === '"') {
        return index + 1;
      }

      if (char === "\\") {
        index += 2;
      } else if (char === "$" && "({".includes(source[index + 1])) {
        index = this.skipGroup(source, index + 1);
      } else if (char === "`") {
        index = skipEscaped(source, index);
      } else {
        index += 1;
      }
    }

    return unterminated();
  },

  /**
   * @param {string} source The shell source.
   * @param {number} start The opening quote index.
   * @returns {number} The position after the scanned construct.
   */
  skipQuote(source, start) {
    if (source[start] === "'") {
      return skipSingleQuoted(source, start);
    }

    return source[start] === '"'
      ? this.skipDoubleQuoted(source, start)
      : skipEscaped(source, start);
  },

  // The index just past the heredoc body starting at `start`: the line equal
  // to its delimiter included.
  /**
   * @param {string} source The shell source.
   * @param {number} start The body start index.
   * @param {Heredoc} heredoc The delimiter and tab handling.
   * @returns {number} The position after the scanned construct.
   */
  skipHeredocBody(source, start, { delimiter, stripTabs }) {
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
  },

  // The heredoc a `<<` at `start` opens, and the index just past its delimiter.
  /**
   * @param {string} source The shell source.
   * @param {number} start The redirection start index.
   * @returns {{ end: number, heredoc: Heredoc }} The position after the scanned construct.
   */
  readHeredoc(source, start) {
    let index = start + 2;
    const stripTabs = source[index] === "-";
    index += stripTabs ? 1 : 0;

    while (WHITESPACE.has(source[index])) {
      index += 1;
    }

    let delimiter = "";

    while (index < source.length && !DELIMITER_END.has(source[index])) {
      if (QUOTES.has(source[index])) {
        const end = this.skipQuote(source, index);
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
  },

  // Inside a group: the index just past the escape, quote, comment or heredoc
  // at `index` (a newline skips the heredoc bodies it starts), or -1 for a plain
  // character. `comments` and `heredocs` (null: none) come from the group.
  /**
   * @param {string} source The shell source.
   * @param {number} index The current index.
   * @param {GroupContext} context The group comments and heredocs.
   * @returns {number} The position after the scanned construct.
   */
  skipInGroup(source, index, { comments, heredocs }) {
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
      return this.skipQuote(source, index);
    }

    const opensHeredoc =
      heredocs !== null &&
      source.startsWith("<<", index) &&
      source[index + 2] !== "<";

    if (opensHeredoc) {
      const { end, heredoc } = this.readHeredoc(source, index);
      heredocs.push(heredoc);

      return end;
    }

    if (char === "\n") {
      let next = index + 1;

      for (const heredoc of heredocs?.splice(0) ?? []) {
        next = this.skipHeredocBody(source, next, heredoc);
      }

      return next;
    }

    return -1;
  },

  // The index just past the `(…)` or `{…}` opened at `start`, nesting, quotes
  // and heredoc bodies inside included.
  /**
   * @param {string} source The shell source.
   * @param {number} start The opening group index.
   * @returns {number} The position after the scanned construct.
   */
  skipGroup(source, start) {
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
      const skipped = this.skipInGroup(source, index, context);

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
  },
};

// The `$(…)`, `<(…)` or `>(…)` at `index`; arithmetic (`$((…))`) holds no
// commands.
/** @type {(raw: string, index: number) => Substitution} */
const groupAt = (raw, index) => {
  const end = scanner.skipGroup(raw, index + 1);

  return raw[index + 2] === "("
    ? { end }
    : { body: raw.slice(index + 2, end - 1), end };
};

// The substitution or quote starting at `index` of a word as written: where
// it ends, and the commands inside a substitution. Null for anything else.
/** @type {(raw: string, index: number, inDouble: boolean) => Substitution | null} */
const substitutionAt = (raw, index, inDouble) => {
  const char = raw[index];
  const following = raw[index + 1];

  if (char === "`") {
    const end = skipEscaped(raw, index);

    return { body: raw.slice(index + 1, end - 1), end };
  }

  if (inDouble) {
    // In double quotes `'` is text, and only `$(…)` substitutes.
    return char === "$" && following === "(" ? groupAt(raw, index) : null;
  }

  if (char === "'") {
    return { end: skipSingleQuoted(raw, index) };
  }

  if (char === "$" && following === "'") {
    return { end: skipEscaped(raw, index + 1) };
  }

  return "$<>".includes(char) && following === "(" ? groupAt(raw, index) : null;
};

// The commands inside each substitution of a word as written: `$(…)`,
// `` `…` ``, `<(…)` and `>(…)`, in or out of double quotes, never in single
// quotes or arithmetic.
/** @type {(raw: string) => string[]} */
const substitutionsIn = (raw) => {
  const bodies = [];
  let inDouble = false;
  let index = 0;

  while (index < raw.length) {
    const found = substitutionAt(raw, index, inDouble);

    if (found === null) {
      inDouble = raw[index] === '"' ? !inDouble : inDouble;
      index += raw[index] === "\\" ? 2 : 1;
    } else {
      if (found.body !== undefined) {
        bodies.push(found.body);
      }

      index = found.end;
    }
  }

  return bodies;
};

const EXPRESSION_START = new Set([" ", "\t", "\n"]);

// The index just past the `[[ … ]]` opened at `start`, quotes inside skipped.
/** @type {(source: string, start: number) => number} */
const skipConditional = (source, start) => {
  let index = start + 2;

  while (index < source.length) {
    if (source.startsWith("]]", index)) {
      return index + 2;
    }

    if (source[index] === "\\") {
      index += 2;
    } else if (QUOTES.has(source[index])) {
      index = scanner.skipQuote(source, index);
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
  /** @param {string} source The shell source. */
  constructor(source) {
    this.source = source;
    this.index = 0;
    /** @type {Token[]} */
    this.tokens = [];
    /** @type {string[]} */
    this.substitutions = [];
    /** @type {Heredoc[]} */
    this.heredocs = [];
    /** @type {string | null} */
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

  /**
   * @param {string} char The char to process.
   * @param {string | undefined} following The following to process.
   */
  step(char, following) {
    if (char === "\\") {
      this.escape(following);
    } else if (this.word === null && this.startsExpression(char, following)) {
      this.expression(char);
    } else if (QUOTES.has(char) || (char === "$" && following === "'")) {
      this.quote(char);
    } else if (
      "$<>".includes(char) &&
      following !== undefined &&
      "({".includes(following)
    ) {
      this.substitution(char, following ?? "");
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
  /**
   * @param {string} char The char to process.
   * @param {string | undefined} following The following to process.
   */
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

  /**
   * @param {string} char The char to process.
   */
  expression(char) {
    const end =
      char === "("
        ? scanner.skipGroup(this.source, this.index)
        : skipConditional(this.source, this.index);

    this.append(this.source.slice(this.index, end));
    this.index = end;
  }

  /**
   * @param {string} char The char to process.
   */
  parenthesis(char) {
    if (char === "(" && this.word?.endsWith("=") === true) {
      // `name=(…)`: an array assignment, its elements no commands.
      const end = scanner.skipGroup(this.source, this.index);
      this.append(this.source.slice(this.index, end));
      this.index = end;
    } else {
      this.operator(char, 1);
    }
  }

  /**
   * @param {string} text The text to process.
   */
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

  /**
   * @param {string} value The value to process.
   * @param {number} length The length to process.
   */
  operator(value, length) {
    this.flush();
    this.tokens.push({ type: "operator", value });
    this.index += length;
  }

  /**
   * @param {string | undefined} following The following to process.
   */
  escape(following) {
    if (following !== "\n") {
      this.append(following ?? "");
    }

    this.index += 2;
  }

  /**
   * @param {string} char The char to process.
   */
  quote(char) {
    // `$'…'` (ANSI-C quoting) takes backslash escapes, like a backquote.
    const start = char === "$" ? this.index + 1 : this.index;

    const end =
      char === "$"
        ? skipEscaped(this.source, start)
        : scanner.skipQuote(this.source, start);

    this.append(
      char === "`"
        ? this.source.slice(start, end)
        : this.source.slice(start + 1, end - 1)
    );
    this.index = end;
  }

  /**
   * @param {string} char The char to process.
   * @param {string} following The following to process.
   */
  substitution(char, following) {
    if (char !== "$" && following === "{") {
      // `<{` / `>{` is a redirection followed by a word, not a substitution.
      this.redirection();

      return;
    }

    const end = scanner.skipGroup(this.source, this.index + 1);
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
      this.index = scanner.skipHeredocBody(this.source, this.index, heredoc);
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

  /**
   * @param {string} char The char to process.
   * @param {string | undefined} following The following to process.
   */
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
// tokens, raw text included. What sets a shell variable is kept apart too,
// function bodies included (a helper runs once it's called): each simple
// command's words and each leading `NAME=…` assignment.
/** @type {(closer: string | null, definition: boolean) => Frame} */
const createFrame = (closer, definition) => ({
  // Where a `case` is: its "subject", a "pattern" or a branch "body".
  casePart: closer === "esac" ? "subject" : null,
  closer,
  commands: [],
  definition,
  list: [],
});

const createParser = () => ({
  frames: [createFrame(null, false)],
  /** @type {string[]} */
  assignments: [],
  /** @type {string[][]} */
  everyCommand: [],
  /** @type {WordToken[][]} */
  loops: [],
  /** @type {string[]} */
  words: [],
  definesFunction: false,
  skipsOperator: false,
  skipsWord: false,
  timed: false,

  get inCaseHeader() {
    return this.top.casePart === "subject" || this.top.casePart === "pattern";
  },

  get top() {
    // A parser always keeps its root frame while reading commands.
    return /** @type {Frame} */ (this.frames.at(-1));
  },

  /**
   * @param {Token[]} tokens The tokens to process.
   */
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

    return {
      assignments: this.assignments,
      commands: this.top.commands,
      everyCommand: this.everyCommand,
      loops: this.loops,
    };
  },

  /**
   * @param {WordToken} token The token to process.
   */
  word(token) {
    const { value } = token;
    const { timed } = this;
    this.timed = false;

    if (this.skipsWord) {
      this.skipsWord = false;
    } else if (this.top.inLoopHeader === true) {
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
      this.open(/** @type {string} */ (OPENERS.get(value)));
      // `for name in …; do`: the header names no command.
      this.top.inLoopHeader = LOOP_HEADERS.has(value);
      this.top.loopHeader = [];
    } else if (value === this.top.closer) {
      this.close();
    } else if (ASSIGNMENT.test(value)) {
      this.assignments.push(value);
    } else if (!COMMAND_PREFIXES.has(value)) {
      this.words.push(value);
    }
  },

  /**
   * @param {WordToken} token The token to process.
   */
  loopHeaderWord(token) {
    // open() initialized the header before inLoopHeader was set.
    const header = /** @type {WordToken[]} */ (this.top.loopHeader);

    if (token.value === "do") {
      this.top.inLoopHeader = false;
      this.loops.push(header);
    } else {
      header.push(token);
    }
  },

  /**
   * @param {string} value The value to process.
   */
  caseWord(value) {
    if (this.top.casePart === "subject" && value === "in") {
      this.top.casePart = "pattern";
    } else if (this.top.casePart === "pattern" && value === "esac") {
      this.close();
    }
  },

  /**
   * @param {string} value The value to process.
   * @param {Token | undefined} following The following to process.
   */
  operator(value, following) {
    if (this.top.inLoopHeader === true) {
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
  },

  /**
   * @param {Token | undefined} following The following to process.
   */
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
  },

  /**
   * @param {string} closer The closer to process.
   */
  open(closer) {
    this.frames.push(createFrame(closer, this.definesFunction));
    this.definesFunction = false;
  },

  close() {
    this.end(null);
    const frame = /** @type {Frame} */ (this.frames.pop());

    if (!frame.definition) {
      this.top.commands.push(...frame.commands);
      this.top.list.push(...frame.commands);
    }
  },

  /**
   * @param {string | null} operator The operator to process.
   */
  end(operator) {
    if (this.words.length === 0 || this.definesFunction) {
      return;
    }

    const command = { background: false, operator, words: this.words };
    this.top.commands.push(command);
    this.top.list.push(command);
    this.everyCommand.push(this.words);
    this.words = [];
  },
});

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

/** @type {(word: string) => string} */
const commandName = (word) =>
  // Splitting even an empty word yields at least one component.
  /** @type {string} */ (word.split("/").at(-1));

// The words of the command a simple command runs, past its wrappers.
/** @type {(words: string[]) => string[]} */
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

    const valueOptions = /** @type {Set<string>} */ (
      WRAPPERS.get(commandName(words[index]))
    );

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
const NOT_RELATIVE = /^[/~$]/u;
const CD_CHAINS = new Set(["&&", ";", "\n"]);

// The directory `cd` changes to: its first operand, past options like `-P`.
/** @type {(words: string[]) => string | undefined} */
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
const SIGNAL = /^-(?:\d+|[A-Z]{2,}[A-Z0-9+-]*)$/u;

const POSIX_CLASS = /\[:(?<name>[a-z]+):\]/gu;

/** @type {Record<string, string>} */
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
/** @type {(pattern: string, line: string) => boolean} */
const matchesItself = (pattern, line) => {
  const translated = pattern.replaceAll(
    POSIX_CLASS,
    /** @type {(match: string, name: string) => string} */
    (match, name) => POSIX_CLASSES[name] ?? match
  );

  try {
    return new RegExp(translated, "u").test(line);
  } catch {
    return true;
  }
};

// One option word of pkill / pgrep: whether it asks for `-f`, and how many
// of the following words it takes as its value.
/** @type {(word: string) => { full: boolean, valueWords: number }} */
const readOption = (word) => {
  if (word.startsWith("--")) {
    return {
      full: word === "--full",
      valueWords: VALUE_LONG_OPTIONS.has(word) ? 1 : 0,
    };
  }

  let full = false;
  const letters = word.slice(1);

  for (let position = 0; position < letters.length; position += 1) {
    const letter = letters[position];

    if (VALUE_OPTIONS.has(letter)) {
      // `-u me` takes the next word, `-ume` holds its own value.
      return { full, valueWords: position === letters.length - 1 ? 1 : 0 };
    }

    full ||= letter === "f";
  }

  return { full, valueWords: 0 };
};

/** @type {(word: string) => boolean} */
const isOption = (word) =>
  word.startsWith("-") && word.length > 1 && !SIGNAL.test(word);

// Whether pkill / pgrep match the full command line (`-f`), and the pattern.
/** @type {(words: string[]) => { full: boolean, pattern: string | undefined }} */
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

/** @type {Record<string, number>} */
const SLEEP_UNITS = { "": 1, d: 86_400, h: 3600, m: 60, s: 1 };
const SLEEP_DURATION = /^(?<duration>\d+(?:\.\d*)?|\.\d+)(?<unit>[smhd]?)$/u;
const SLEEP_FOREVER = new Set(["inf", "infinity"]);

// How long `sleep` waits: the sum of its operands (`sleep 1m 30`), skipping
// any it can't read (`$DELAY`).
/** @type {(words: string[]) => number} */
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
const BARE_VARIABLE =
  /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})$/u;

// `for name in $var`: the whole word list one bare, unquoted variable.
/** @type {(header: WordToken[]) => boolean} */
const loopsOverBareVariable = (header) => {
  const [, keyword, ...list] = header;

  return (
    keyword?.value === "in" &&
    list.length === 1 &&
    BARE_VARIABLE.test(list[0].raw)
  );
};

// zsh ties the lowercase array `path` to `PATH`: setting it replaces the
// command search path. `path+=(dir)` only appends, so it's left alone.
const PATH_ASSIGNMENT = /^path(?:\[[^\]]*\])?=/u;

// Builtins whose operands name the variables they set (`local path=x`,
// `typeset -a path`, `read -r path`).
const VARIABLE_SETTERS = new Set([
  "declare",
  "export",
  "float",
  "integer",
  "local",
  "private",
  "read",
  "readonly",
  "typeset",
]);

/** @type {(word: string) => boolean} */
const isPathVariable = (word) => word === "path" || PATH_ASSIGNMENT.test(word);

// Whether anything sets zsh's `path`: a `path=…` assignment, a builtin
// declaring it, or a `for` / `select` naming it as its loop variable.
/** @type {(parsed: ParsedShell) => boolean} */
const setsZshPath = ({ assignments, everyCommand, loops }) =>
  assignments.some((word) => PATH_ASSIGNMENT.test(word)) ||
  everyCommand.some(
    (words) =>
      VARIABLE_SETTERS.has(words[0]) && words.slice(1).some(isPathVariable)
  ) ||
  loops.some(([name]) => name?.value === "path");

// Package runners that run the command named after them (`pnpm exec x`).
const RUNNERS = new Set(["bunx", "npx", "pnpm", "yarn"]);

// Root scripts that run a tool's package scripts: `pnpm db status` runs
// `supabase status`.
const TOOL_ALIASES = new Map([["supabase", "db"]]);

// The arguments a command gives `tool`, run directly, through a package
// runner (`pnpm exec supabase status`) or a root alias (`pnpm db status`), or
// null when it doesn't run it.
/** @type {(name: string, words: string[], tool: string) => string[] | null} */
const toolArguments = (name, words, tool) => {
  if (name === tool) {
    return words.slice(1);
  }

  if (name === "pnpm" && words[1] === TOOL_ALIASES.get(tool)) {
    return words.slice(2);
  }

  const index = RUNNERS.has(name) ? words.indexOf(tool) : -1;

  return index > 0 ? words.slice(index + 1) : null;
};

/** @type {(words: string[]) => string[]} */
const beforeDoubleDash = (words) => {
  const end = words.indexOf("--");

  return end === -1 ? words : words.slice(0, end);
};

// The Supabase CLI's legacy `-o` / `--output` flag (not `--output-format`).
/** @type {(word: string) => boolean} */
const isLegacyOutputFlag = (word) =>
  word === "--output" ||
  word.startsWith("--output=") ||
  (word.startsWith("-o") && !word.startsWith("--"));

const PROD_ENVIRONMENT = /^prod(?:uction)?$/u;

// Splits `--env=prod` into the flag and its value.
const FIRST_EQUALS = /[=](?<value>.*)/su;
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

// `infisical secrets <these>` handle no value; anything else (listing, `get`,
// `set`) prints one or takes one on the command line.
const INFISICAL_VALUELESS = new Set([
  "delete",
  "folders",
  "generate-example-env",
]);

// Whether `infisical …` handles the `prod` environment's values: `secrets`
// (listing), `secrets get` / `set`, `export` or `run`, with `--env=prod`.
/** @type {(args: string[]) => boolean} */
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
    (command === "secrets" && !INFISICAL_VALUELESS.has(subcommand));

  return prod && reads;
};

// gitleaks' own flags, by the shape they take on the command line. Anything
// else, a grouped or attached shorthand (`-vh`, `-s.`) or a boolean with an
// explicit value (`--help=false`) included, is a word this rule won't read:
// pflag accepts those, and each one hides which scan really runs, so the
// command is refused rather than guessed at. gitleaks refuses an unknown flag
// itself, so refusing one here costs nothing either.
const GITLEAKS_BOOLEAN_FLAGS = new Set([
  "--follow-symlinks",
  "--help",
  "--ignore-gitleaks-allow",
  "--no-banner",
  "--no-color",
  "--no-git",
  "--pipe",
  "--pre-commit",
  "--staged",
  "--verbose",
  "--version",
]);

const GITLEAKS_VALUE_FLAGS = new Set([
  "--baseline-path",
  "--config",
  "--diagnostics",
  "--diagnostics-dir",
  "--enable-rule",
  "--exit-code",
  "--gitleaks-ignore-path",
  "--log-level",
  "--log-opts",
  "--max-archive-depth",
  "--max-decode-depth",
  "--max-target-megabytes",
  "--platform",
  "--report-format",
  "--report-path",
  "--report-template",
  "--source",
  "--timeout",
]);

const GITLEAKS_BOOLEAN_SHORTHANDS = new Map([
  ["-h", "--help"],
  ["-v", "--verbose"],
]);

const GITLEAKS_VALUE_SHORTHANDS = new Map([
  ["-b", "--baseline-path"],
  ["-c", "--config"],
  ["-f", "--report-format"],
  ["-i", "--gitleaks-ignore-path"],
  ["-l", "--log-level"],
  ["-r", "--report-path"],
  ["-s", "--source"],
]);

// Subcommands that scan nothing, so they print no secret.
const GITLEAKS_HARMLESS = new Set(["completion", "help", "version"]);

// The subcommands that walk a directory, gitignored files included.
const GITLEAKS_DIR_SUBCOMMANDS = new Set(["dir", "directory", "file"]);

// The ones that read git history, which holds no gitignored file. `detect`
// only does so without `--no-git`.
const GITLEAKS_HISTORY_SUBCOMMANDS = new Set(["detect", "git", "stdin"]);

// One flag word of a `gitleaks …` command as the flag it sets, the value it
// sets it to and how many following words it takes, or null for a word this
// rule won't read.
/** @type {(word: string, next: string | undefined) => { name: string, taken: number, value: string | true } | null} */
const readGitleaksFlag = (word, next) => {
  const [name, value] = word.split(FIRST_EQUALS);

  // pflag reads `--redact`'s value with Go's `ParseUint(s, 0, 64)`, so the
  // base comes from the prefix and `--redact=0100` is octal 64, masking 64%
  // and printing the rest. Only its two unambiguous full forms count.
  if (name === "--redact") {
    const full = value === undefined || value === "100";

    return full ? { name, taken: 0, value: true } : null;
  }

  if (GITLEAKS_BOOLEAN_FLAGS.has(name)) {
    return value === undefined ? { name, taken: 0, value: true } : null;
  }

  const booleanShorthand = GITLEAKS_BOOLEAN_SHORTHANDS.get(word);

  if (booleanShorthand !== undefined) {
    return { name: booleanShorthand, taken: 0, value: true };
  }

  const valueShorthand = GITLEAKS_VALUE_SHORTHANDS.get(word);

  if (valueShorthand === undefined && !GITLEAKS_VALUE_FLAGS.has(name)) {
    return null;
  }

  const given = value ?? next;

  if (given === undefined) {
    return null;
  }

  const taken = value === undefined ? 1 : 0;

  return { name: valueShorthand ?? name, taken, value: given };
};

// Every word of a `gitleaks …` command as its flags and its positionals, or
// null for a command holding a word this rule won't read. `--` only ends the
// flags (gitleaks wraps no command of its own), so every word after it is a
// positional. A repeated flag keeps its last value, as pflag does.
/** @type {(args: string[]) => { flags: Map<string, string | true>, positionals: string[] } | null} */
const readGitleaks = (args) => {
  /** @type {Map<string, string | true>} */
  const flags = new Map();
  const positionals = [];
  let flagsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === "--" && !flagsEnded) {
      flagsEnded = true;
    } else if (flagsEnded || !word.startsWith("-")) {
      positionals.push(word);
    } else {
      const flag = readGitleaksFlag(word, args[index + 1]);

      if (flag === null) {
        return null;
      }

      flags.set(flag.name, flag.value);
      index += flag.taken;
    }
  }

  return { flags, positionals };
};

// A path written plainly enough to read: no glob (`apps/*` is one word here
// and several arguments to gitleaks, which then scans the working directory),
// no variable, no substitution, no `~`.
const PLAIN_PATH = /^\/?[\w.-]+(?:\/[\w.-]+)*\/?$/u;

// `path`'s components with its `.` and `..` segments resolved, or null when
// it isn't plain enough to read or climbs above its own root.
/** @type {(path: string) => string[] | null} */
const pathComponents = (path) => {
  if (!PLAIN_PATH.test(path)) {
    return null;
  }

  const components = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment !== "..") {
      components.push(segment);
    } else if (components.pop() === undefined) {
      return null;
    }
  }

  return components;
};

// Whether `path` is an absolute path holding the project directory: that
// directory itself or one above it, so scanning it walks the whole checkout.
// `projectDir` is `CLAUDE_PROJECT_DIR` (.claude/settings.json).
/** @type {(path: string, projectDir: string | undefined) => boolean} */
const holdsProjectDir = (path, projectDir) => {
  if (projectDir === undefined || !path.startsWith("/")) {
    return false;
  }

  const target = pathComponents(path);
  const project = pathComponents(projectDir);

  return (
    target !== null &&
    project !== null &&
    target.length <= project.length &&
    target.every((part, index) => part === project[index])
  );
};

// Whether `path` certainly names one place inside the checkout. An empty
// path (gitleaks reads it as `.`), `.`, `./.`, `apps/mobile/..`, `..` and `/`
// all resolve to no component at all, so each is the whole checkout.
/** @type {(path: string, projectDir: string | undefined) => boolean} */
const namesOnePlace = (path, projectDir) => {
  const components = pathComponents(path);

  return (
    components !== null &&
    components.length > 0 &&
    !holdsProjectDir(path, projectDir)
  );
};

// Whether `gitleaks …` can print a local secret. Rather than enumerate the
// unsafe ways to write a scan, every command is refused unless this rule can
// read all of it and sees a scan that masks each secret whole and walks one
// named place: FIT-476 showed that the ways to spell "the working directory"
// (an extra path, `./.`, a glob, an attached shorthand) outnumber the ones
// worth listing.
/** @type {(args: string[], projectDir: string | undefined) => boolean} */
const leaksLocalSecrets = (args, projectDir) => {
  const read = readGitleaks(args);

  if (read === null) {
    return true;
  }

  const { flags, positionals } = read;
  const [subcommand, ...paths] = positionals;

  if (subcommand === undefined || GITLEAKS_HARMLESS.has(subcommand)) {
    return false;
  }

  if (flags.has("--help") || flags.has("--version")) {
    return false;
  }

  if (!flags.has("--redact")) {
    return true;
  }

  if (GITLEAKS_DIR_SUBCOMMANDS.has(subcommand)) {
    return paths.length !== 1 || !namesOnePlace(paths[0], projectDir);
  }

  if (!GITLEAKS_HISTORY_SUBCOMMANDS.has(subcommand)) {
    return true;
  }

  if (subcommand === "detect" && flags.has("--no-git")) {
    const source = flags.get("--source");

    return typeof source !== "string" || !namesOnePlace(source, projectDir);
  }

  return false;
};

// A `.env`, `.env.local`, `apps/api/.env.production` … but not the
// committed `.env.example` files, which hold no secret.
const ENV_FILE = /(?:^|\/)\.env(?:\.[^/]+)?$/u;

/** @type {(word: string) => boolean} */
const isEnvFile = (word) => ENV_FILE.test(word) && !word.endsWith(".example");

const FILE_READERS = new Set([
  "awk",
  "bat",
  "cat",
  "cut",
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
const QUIET_GREP_LETTERS = /^-[A-Za-z]*[cLlq]/u;

const QUIET_GREP_OPTIONS = new Set([
  "--count",
  "--files-with-matches",
  "--files-without-match",
  "--quiet",
  "--silent",
]);

// `cut -d= -f1`, `cut -d '=' -f 1`, `cut --delimiter== --fields=1`.
const CUT_EQUALS_DELIMITER = /(?:^| )(?:-d ?|--delimiter[= ])=(?: |$)/u;
const CUT_FIRST_FIELD = /(?:^| )(?:-f ?|--fields[= ])1(?: |$)/u;

// `awk -F= '{print $1}'`, `awk -F '=' '{ print $1 }'`.
const AWK_EQUALS_SEPARATOR = /(?:^| )-F ?=(?: |$)/u;
const AWK_FIRST_FIELD = /^\{ ?print \$1;? ?\}$/u;

// `s/=.*/…/`: a sed script dropping everything from the first `=`.
const STRIPPING_SED_SCRIPT = /^s(?<delimiter>.)=\.\*\k<delimiter>/u;

/** @type {(command: Command) => boolean} */
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

/** @type {(command: Command) => boolean} */
const readsEnvFile = (command) =>
  FILE_READERS.has(command.name) &&
  command.words.slice(1).some(isEnvFile) &&
  printsLines(command);

// `cut -d= -f1`, `awk -F= '{print $1}'` or `sed 's/=.*/…/'`: names only,
// values stripped.
/** @type {(command: Command) => boolean} */
const stripsValues = ({ name, words }) => {
  if (name === "sed") {
    return words.some((word) => STRIPPING_SED_SCRIPT.test(word));
  }

  if (name === "awk") {
    return (
      AWK_EQUALS_SEPARATOR.test(words.slice(1).join(" ")) &&
      words.some((word) => AWK_FIRST_FIELD.test(word))
    );
  }

  if (name !== "cut") {
    return false;
  }

  const joined = words.slice(1).join(" ");

  return CUT_EQUALS_DELIMITER.test(joined) && CUT_FIRST_FIELD.test(joined);
};

// Splits the simple commands into pipelines: runs joined by `|`.
/** @type {(commands: Command[]) => Command[][]} */
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

const WORD_SPLIT_REASON = `AGENTS.md Shell: zsh doesn't word-split an unquoted \`$var\`, so \`for x in $var\` runs once with the whole list as one word: use an array (\`files=(a b); for f in "\${files[@]}"\`), \`\${=var}\`, or pipe NUL-separated names into \`xargs -0\` (\`git ls-files -z\`, \`grep -rlZ\`).`;

// Each rule: its name, the reason the agent is shown, and whether it's broken
// by a simple command (`name` is the command run, past any wrapper), by a
// pipeline (`scope: "pipeline"`, its simple commands) or by a `for` /
// `select` header (`scope: "loop"`, its word tokens), or by the whole parsed
// command (`scope: "parsed"`).
/** @type {Check[]} */
const CHECKS = [
  {
    breaks: setsZshPath,
    reason:
      "AGENTS.md Shell: zsh ties the lowercase `path` array to `PATH`, so `path=…`, `local path`, `for path in …` or `read path` replaces the command search path and every later command fails: name it `file`, `dir` or `p`.",
    rule: "zsh-path",
    scope: "parsed",
  },
  {
    breaks: ({ name, words, operator }) => {
      if (name !== "cd" || operator === null || !CD_CHAINS.has(operator)) {
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
    breaks: loopsOverBareVariable,
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
      readsProdSecrets(toolArguments(name, words, "infisical") ?? []),
    reason:
      "AGENTS.md Shell: `prod` secret values never enter a local shell, file or command line (`infisical secrets get|export|run --env=prod`; docs/agents/secrets.md, Handling values): smoke-test a deployment through `/health`, a development-instance Clerk token or the Vercel MCP and logs, and ask the human when a prod credential is truly needed.",
    rule: "infisical-prod",
  },
  {
    breaks: ({ name, projectDir, words }) =>
      leaksLocalSecrets(
        toolArguments(name, words, "gitleaks") ?? [],
        projectDir
      ),
    reason:
      'AGENTS.md Shell: gitleaks masks nothing without `--redact`, and `gitleaks dir` / `detect --no-git` read gitignored files, so a scan of the working directory prints the local `.env*` values. Pass `--redact` (or `--redact=100`) and name exactly one plain path inside the checkout, in long-form flags: this rule refuses every gitleaks word it cannot read, a glob, a grouped or attached shorthand (`-vh`, `-s.`) and a boolean with a value (`--help=false`) included, since each hides which scan really runs. Reproduce the scan that fired: `gitleaks git --pre-commit --staged --redact -v` (pre-commit hook) or `gitleaks git --log-opts="--diff-merges=first-parent origin/main..HEAD" --redact -v .` (CI), and `gitleaks dir <one path> --redact -v` for untracked files.',
    rule: "gitleaks",
  },
  {
    // A reader is fine when it, or a command after it, strips the values.
    breaks: (pipeline) =>
      pipeline.some(
        (command, index) =>
          readsEnvFile(command) && !pipeline.slice(index).some(stripsValues)
      ),
    reason:
      "AGENTS.md Shell: never print a `.env*` file's values (docs/agents/secrets.md, Handling values): list the names only (`cut -d= -f1 <file>`, or `sed -E 's/=.*/=…/' <file>`), or check one exists with `grep -q '^NAME=' <file>`. BSD sed (macOS) has no `\\|`: use `sed -E` with `|`.",
    rule: "env-file",
    scope: "pipeline",
  },
];

/** @type {(command: string) => ParsedShell} */
const parse = (command) => {
  try {
    const lexer = new Lexer(command.trimEnd());
    const parsed = createParser().run(lexer.run());

    return { ...parsed, substitutions: lexer.substitutions };
  } catch (error) {
    if (error === UNTERMINATED) {
      return {
        assignments: [],
        commands: [],
        everyCommand: [],
        loops: [],
        substitutions: [],
      };
    }

    throw error;
  }
};

// The names of the rules `command` breaks, its substitutions' commands
// included.
/** @type {(command: string, options: Options) => Set<string>} */
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
            projectDir: options.projectDir,
            words,
          },
        ];
  });

  const rules = new Set(
    CHECKS.flatMap((check) => {
      let broken;

      if (check.scope === "loop") {
        broken = parsed.loops.some(check.breaks);
      } else if (check.scope === "parsed") {
        broken = check.breaks(parsed);
      } else if (check.scope === "pipeline") {
        broken = pipelines(commands).some(check.breaks);
      } else {
        broken = commands.some(check.breaks);
      }

      return broken ? [check.rule] : [];
    })
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
 * @param {string} command The Bash command to check.
 * @param {{ background?: boolean, projectDir?: string }} [options]
 *   `background`: the Bash tool runs the whole command in the background
 *   (`run_in_background`). `projectDir`: the checkout the hook runs in
 *   (`CLAUDE_PROJECT_DIR`), so an absolute path holding it is read as the
 *   whole checkout.
 * @returns {{ rule: string, reason: string }[]} The broken rules and their reasons.
 */
export const findShellRuleViolations = (command, options = {}) => {
  const rules = brokenRules(command, options);

  return CHECKS.flatMap(({ reason, rule }) =>
    rules.has(rule) ? [{ reason, rule }] : []
  );
};
