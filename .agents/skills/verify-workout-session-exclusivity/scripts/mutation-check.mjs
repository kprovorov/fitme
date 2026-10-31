import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const root = resolve(scripts, "../../../..");
const migrations = "packages/supabase/supabase/migrations";
const file = "20261029120000_one_open_session_per_user.sql";
const scratch = mkdtempSync(join(tmpdir(), "fitme-session-mutations-"));
const variants = {
	"non-unique-index": (source) =>
		source.replace(
			"CREATE UNIQUE INDEX workout_sessions_one_open_per_user_idx",
			"CREATE INDEX workout_sessions_one_open_per_user_idx",
		),
	"per-workout-index": (source) =>
		source.replace(
			"ON public.workout_sessions (user_id)",
			"ON public.workout_sessions (workout_id)",
		),
};
for (const [name, mutate] of Object.entries(variants)) {
	const target = join(scratch, name);
	cpSync(join(root, migrations), join(target, migrations), { recursive: true });
	const original = readFileSync(join(target, migrations, file), "utf8");
	const broken = mutate(original);
	if (broken === original)
		throw new Error(
			`${name}: mutation no longer matches the real SQL; update it.`,
		);
	writeFileSync(join(target, migrations, file), broken);
	const result = spawnSync(
		process.execPath,
		[join(scripts, "verify.mjs"), "--source-root", target],
		{ encoding: "utf8", timeout: 90000, maxBuffer: 4 * 1024 * 1024 },
	);
	const log = (result.stdout ?? "") + (result.stderr ?? "");
	writeFileSync(join(scratch, `${name}.out`), log);
	if (result.error) throw result.error;
	if (
		result.status !== 1 ||
		!log.includes("FAIL OneOpenPerUser") ||
		!log.includes("FAIL: model and SQL agree.")
	) {
		throw new Error(
			`${name}: verification failed to catch the real SQL mutation, or could not run. See ${scratch}/${name}.out`,
		);
	}
	console.log(`${name}: detected by TLC and Postgres. ${scratch}/${name}.out`);
}
const baseline = spawnSync(process.execPath, [join(scripts, "verify.mjs")], {
	stdio: "inherit",
	timeout: 90000,
});
if (baseline.error) throw baseline.error;
if (baseline.status !== 0)
	throw new Error(
		"Unmodified source did not pass after the scratch mutations.",
	);
console.log(
	`Both real SQL mutations caught; repository source untouched. Mutation evidence: ${scratch}`,
);
