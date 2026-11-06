/// <reference types="node" />
/// <reference lib="es2023.array" />

// Every project skill lives in .agents/skills/<name> (Codex reads it there),
// and Claude Code only sees it through a .claude/skills/<name> symlink to
// ../../.agents/skills/<name>. skillLinkProblems lists every way the two
// directories disagree, one line each; an empty list means they match.
import fs from "node:fs";
import path from "node:path";

const SKILLS_DIR = ".agents/skills";
const LINKS_DIR = ".claude/skills";

/** @param {string} dir Directory to list. */
const entries = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];

const expectedTarget = (name) => `../../${SKILLS_DIR}/${name}`;

const lnCommand = (name) =>
  `ln -s ${expectedTarget(name)} ${LINKS_DIR}/${name}`;

/**
 * @param {string} root Repository root.
 * @param {string} name Skill name.
 */
const linkProblem = (root, name) => {
  const link = path.join(root, LINKS_DIR, name);
  let stat;

  try {
    stat = fs.lstatSync(link);
  } catch {
    return `${LINKS_DIR}/${name} is missing: run \`${lnCommand(name)}\``;
  }

  if (!stat.isSymbolicLink()) {
    return `${LINKS_DIR}/${name} is not a symlink: replace it with \`${lnCommand(name)}\``;
  }

  const target = fs.readlinkSync(link);

  if (!fs.existsSync(link)) {
    return `${LINKS_DIR}/${name} points at nothing (${target})`;
  }

  if (target !== expectedTarget(name)) {
    return `${LINKS_DIR}/${name} points at ${target}, not ${expectedTarget(name)}`;
  }

  return null;
};

/** @param {string} root Repository root. */
export const skillLinkProblems = (root) => {
  const skills = entries(path.join(root, SKILLS_DIR))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const linked = entries(path.join(root, LINKS_DIR)).map((entry) => entry.name);
  const names = [...new Set([...skills, ...linked])].toSorted();

  return names.flatMap((name) => {
    const problem = linkProblem(root, name);

    return problem === null ? [] : [problem];
  });
};
