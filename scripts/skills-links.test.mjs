import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { skillLinkProblems } from "./skills-links.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** @type {string[]} */
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

// A repo root with .agents/skills/<name>/SKILL.md for each skill and the
// .claude/skills symlinks given as name → target.
/** @param {{ skills: string[], links: Record<string, string> }} options Skills and symlink targets. */
const fixture = ({ skills, links }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-links-"));
  tempDirs.push(root);

  for (const name of skills) {
    const dir = path.join(root, ".agents/skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${name}\n`);
  }

  const linkDir = path.join(root, ".claude/skills");
  fs.mkdirSync(linkDir, { recursive: true });

  for (const [name, target] of Object.entries(links)) {
    fs.symlinkSync(target, path.join(linkDir, name));
  }

  return root;
};

const linkTo = (name) => `../../.agents/skills/${name}`;

void describe("skillLinkProblems", () => {
  test("every project skill in this repo has its .claude/skills symlink", () => {
    assert.deepEqual(skillLinkProblems(REPO_ROOT), []);
  });

  test("passes when every skill has its link", () => {
    const root = fixture({
      links: { alpha: linkTo("alpha"), beta: linkTo("beta") },
      skills: ["alpha", "beta"],
    });

    assert.deepEqual(skillLinkProblems(root), []);
  });

  test("fails for a skill without a link", () => {
    const root = fixture({
      links: { alpha: linkTo("alpha") },
      skills: ["alpha", "beta"],
    });

    assert.deepEqual(skillLinkProblems(root), [
      ".claude/skills/beta is missing: run `ln -s ../../.agents/skills/beta .claude/skills/beta`",
    ]);
  });

  test("fails for a link pointing at nothing", () => {
    const root = fixture({
      links: { alpha: linkTo("alpha"), gone: linkTo("gone") },
      skills: ["alpha"],
    });

    assert.deepEqual(skillLinkProblems(root), [
      ".claude/skills/gone points at nothing (../../.agents/skills/gone)",
    ]);
  });

  test("fails for a link pointing at another skill", () => {
    const root = fixture({
      links: { alpha: linkTo("beta"), beta: linkTo("beta") },
      skills: ["alpha", "beta"],
    });

    assert.deepEqual(skillLinkProblems(root), [
      ".claude/skills/alpha points at ../../.agents/skills/beta, not ../../.agents/skills/alpha",
    ]);
  });

  test("fails for a copy instead of a symlink", () => {
    const root = fixture({ links: {}, skills: ["alpha"] });
    fs.mkdirSync(path.join(root, ".claude/skills/alpha"));
    assert.deepEqual(skillLinkProblems(root), [
      ".claude/skills/alpha is not a symlink: replace it with `ln -s ../../.agents/skills/alpha .claude/skills/alpha`",
    ]);
  });
});
