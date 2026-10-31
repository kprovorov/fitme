import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { replay } from "./replay.mjs";

const skill = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(skill, "../../..");
const migrationName = "20261029120000_one_open_session_per_user.sql";
const migrationDir = "packages/supabase/supabase/migrations";
const checksum =
	"936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";
const { values } = parseArgs({
	options: {
		"source-root": { type: "string", default: root },
		"prepare-only": { type: "boolean", default: false },
	},
});
const sourceRoot = resolve(values["source-root"]);
const source = readFileSync(
	join(sourceRoot, migrationDir, migrationName),
	"utf8",
);
const uncommented = source
	.replace(/--[^\n]*/g, "")
	.replace(/\/\*[\s\S]*?\*\//g, "");
const declaration = uncommented.match(
	/CREATE\s+(UNIQUE\s+)?INDEX\s+workout_sessions_one_open_per_user_idx\s+ON\s+public\.workout_sessions\s*\(\s*(user_id|workout_id)\s*\)\s+WHERE\s+finished_at\s+IS\s+NULL\s*;/i,
);
if (!declaration)
	throw new Error(
		"Unsupported index declaration: recheck and update the model; refusing to guess.",
	);
const tail = uncommented.slice(declaration.index + declaration[0].length);
if (!/^\s*END\s*\$\$\s*;\s*$/i.test(tail)) {
	throw new Error(
		"Unexpected SQL after the covered index declaration; recheck the migration before trusting this model.",
	);
}
// A later migration that mentions this table requires review before this
// historical declaration can be treated as the current database contract.
for (const name of readdirSync(join(sourceRoot, migrationDir)).sort()) {
	if (name > migrationName && name.endsWith(".sql")) {
		const sql = readFileSync(join(sourceRoot, migrationDir, name), "utf8")
			.replace(/--[^\n]*/g, "")
			.replace(/\/\*[\s\S]*?\*\//g, "");
		if (
			/\bworkout_sessions\b|workout_sessions_one_open_per_user_idx/i.test(sql)
		) {
			throw new Error(
				`${name} touches workout_sessions after the covered migration. Review its effect and update this guard.`,
			);
		}
	}
}
const keyMode = declaration[1]
	? declaration[2].toLowerCase() === "user_id"
		? "user"
		: "workout"
	: "none";
const out = mkdtempSync(join(tmpdir(), "fitme-session-proof-"));
writeFileSync(
	join(out, "WorkoutSessions.tla"),
	readFileSync(join(skill, "WorkoutSessions.tla")),
);
writeFileSync(join(out, "view.mjs"), readFileSync(join(skill, "view.mjs")));
for (const [name, twoUsers] of [
	["same-user", false],
	["two-users", true],
]) {
	writeFileSync(
		join(out, `${name}.cfg`),
		`INIT Init\nNEXT Next\nCONSTANTS\n  KeyMode = "${keyMode}"\n  TwoUsers = ${String(twoUsers).toUpperCase()}\nINVARIANT OneOpenPerUser\n`,
	);
}
writeFileSync(
	join(out, "source.json"),
	JSON.stringify({ sourceRoot, keyMode, index: declaration[0] }, null, 2),
);
console.log(`Index key: ${keyMode}; generated model/configs: ${out}`);
if (values["prepare-only"]) process.exit(0);

const jar =
	process.env.TLA2TOOLS ?? join(tmpdir(), "fitme-tla2tools-1.7.4.jar");
if (!existsSync(jar)) {
	execFileSync(
		"curl",
		[
			"--fail",
			"--location",
			"--silent",
			"--show-error",
			"--max-time",
			"60",
			"https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
			"--output",
			jar,
		],
		{ stdio: "inherit" },
	);
}
if (createHash("sha256").update(readFileSync(jar)).digest("hex") !== checksum) {
	throw new Error(
		`TLC checksum mismatch at ${jar}; expected the pinned 1.7.4 artifact.`,
	);
}
let failed = false;
for (const name of ["same-user", "two-users"]) {
	const result = spawnSync(
		process.env.JAVA ?? "java",
		[
			"-XX:+UseParallelGC",
			"-Xmx512m",
			"-cp",
			jar,
			"tlc2.TLC",
			"-workers",
			"1",
			"-config",
			`${name}.cfg`,
			"-metadir",
			`${name}-states`,
			"WorkoutSessions.tla",
		],
		{ cwd: out, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
	);
	const log = (result.stdout ?? "") + (result.stderr ?? "");
	writeFileSync(join(out, `${name}.out`), log);
	if (result.error) throw result.error;
	const violation = log.includes("Invariant OneOpenPerUser is violated");
	if (result.status !== 0 && !violation)
		throw new Error(`TLC could not check ${name}; see ${out}/${name}.out`);
	if (
		!violation &&
		!log.includes("Model checking completed. No error has been found.")
	) {
		throw new Error(`Incomplete TLC result; see ${out}/${name}.out`);
	}
	console.log(
		`${name}: ${violation ? "FAIL OneOpenPerUser" : "PASS"}; ${log.match(/\d+ states generated, [^\n]*/)?.[0] ?? "see log"}`,
	);
	failed ||= violation;
}
// Replay the same property with the actual index SQL in isolated Postgres.
// A failure must be witnessed in SQL as well as in the model.
const sqlFailure = replay(declaration[0], out);
if (sqlFailure !== failed)
	throw new Error(
		`Model/SQL disagreement: model violation=${failed}, SQL violation=${sqlFailure}. Fix the model or replay before trusting this result.`,
	);
console.log(
	`${failed ? "FAIL" : "PASS"}: model and SQL agree. Evidence: ${out}`,
);
process.exitCode = failed ? 1 : 0;
