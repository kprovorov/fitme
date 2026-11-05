// Every project skill lives in .agents/skills/<name> (Codex reads it there),
// and Claude Code only sees it through a .claude/skills/<name> symlink to
// ../../.agents/skills/<name>. skillLinkProblems lists every way the two
// directories disagree, one line each; an empty list means they match.
import fs from "node:fs";
import path from "node:path";

const SKILLS_DIR = ".agents/skills";
const LINKS_DIR = ".claude/skills";

const entries = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];

const expectedTarget = (name) => `../../${SKILLS_DIR}/${name}`;

const lnCommand = (name) =>
  `ln -s ${expectedTarget(name)} ${LINKS_DIR}/${name}`;

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

export const skillLinkProblems = (root) => {
  const skills = entries(path.join(root, SKILLS_DIR))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const linked = entries(path.join(root, LINKS_DIR)).map((entry) => entry.name);
  const names = [...new Set([...skills, ...linked])].sort();

  return names.map((name) => linkProblem(root, name)).filter(Boolean);
};
