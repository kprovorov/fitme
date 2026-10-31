import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// No connection string or project environment is used. This starts a fresh
// local cluster, listening only on its private Unix socket, and stops it.
export function replay(indexSql, out) {
	const bin = process.env.PG_BIN;
	const command = (name) => (bin ? join(bin, name) : name);
	// libpq can prefer PGHOSTADDR over an explicit -h socket, and PGSERVICE
	// can load connection settings. No inherited PG* settings reach a child.
	const postgresEnv = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.startsWith("PG")),
	);
	const data = join(out, "postgres");
	const socket = join(out, "socket");
	mkdirSync(socket, { mode: 0o700 });
	const run = (name, args, options = {}) =>
		execFileSync(command(name), args, {
			encoding: "utf8",
			timeout: 15000,
			stdio: "pipe",
			env: postgresEnv,
			...options,
		});
	run("initdb", [
		"-D",
		data,
		"-A",
		"trust",
		"-U",
		"fitme_formal",
		"--no-locale",
		"--encoding=UTF8",
	]);
	const options = `-h '' -k '${socket}' -c fsync=off`;
	run("pg_ctl", [
		"-D",
		data,
		"-l",
		join(out, "postgres.log"),
		"-o",
		options,
		"-w",
		"start",
	]);
	const args = [
		"-X",
		"-h",
		socket,
		"-U",
		"fitme_formal",
		"-d",
		"postgres",
		"-v",
		"ON_ERROR_STOP=1",
		"-At",
	];
	const sql = (text) => run("psql", [...args, "-c", text]);
	let violation = false;
	const evidence = [];
	try {
		sql(
			`CREATE TABLE public.workout_sessions (id integer PRIMARY KEY, user_id text NOT NULL, workout_id text, finished_at timestamptz); ${indexSql}`,
		);
		// Both preflight reads see empty; two raw writers then commit different
		// Workouts. This is a path allowed by the model's direct-insert actions.
		evidence.push(
			`Preflight A: ${sql("SELECT count(*) FROM workout_sessions;").trim()}`,
		);
		evidence.push(
			`Preflight B: ${sql("SELECT count(*) FROM workout_sessions;").trim()}`,
		);
		sql("INSERT INTO workout_sessions VALUES (1, 'user1', 'workoutA', NULL);");
		const second = (() => {
			try {
				sql(
					"INSERT INTO workout_sessions VALUES (2, 'user1', 'workoutB', NULL);",
				);
				return "committed";
			} catch (error) {
				if (
					!String(error.stderr).includes(
						"duplicate key value violates unique constraint",
					)
				)
					throw error;
				return "rejected by unique index";
			}
		})();
		const count = Number(
			sql(
				"SELECT count(*) FROM workout_sessions WHERE user_id='user1' AND finished_at IS NULL;",
			).trim(),
		);
		violation ||= count > 1;
		evidence.push(`A commits; B ${second}; open for user1: ${count}`);
		// Replay TLC's shortest counterexample: an orphan is already open;
		// a writer inserts a session for Workout A and commits it.
		sql(
			"TRUNCATE workout_sessions; INSERT INTO workout_sessions VALUES (0, 'user1', NULL, NULL);",
		);
		try {
			sql(
				"INSERT INTO workout_sessions VALUES (3, 'user1', 'workoutA', NULL);",
			);
		} catch (error) {
			if (
				!String(error.stderr).includes(
					"duplicate key value violates unique constraint",
				)
			)
				throw error;
		}
		const orphanCount = Number(
			sql(
				"SELECT count(*) FROM workout_sessions WHERE finished_at IS NULL;",
			).trim(),
		);
		violation ||= orphanCount > 1;
		evidence.push(
			`Orphan already open, another Workout starts; committed open rows: ${orphanCount}`,
		);
		sql("TRUNCATE workout_sessions;");
		sql(
			"BEGIN; INSERT INTO workout_sessions VALUES (1, 'user1', 'workoutA', NULL); ROLLBACK; INSERT INTO workout_sessions VALUES (2, 'user1', 'workoutB', NULL);",
		);
		evidence.push(
			`Rollback releases key: ${sql("SELECT count(*) FROM workout_sessions;").trim()} row`,
		);
		sql(
			"UPDATE workout_sessions SET finished_at=now(); INSERT INTO workout_sessions VALUES (3, 'user1', 'workoutA', NULL);",
		);
		evidence.push(
			`Finish releases key: ${sql("SELECT count(*) FROM workout_sessions WHERE finished_at IS NULL;").trim()} open row`,
		);
		sql("INSERT INTO workout_sessions VALUES (4, 'user2', 'workoutC', NULL);");
		evidence.push(
			`Another User starts: ${sql("SELECT count(*) FROM workout_sessions WHERE finished_at IS NULL;").trim()} total open rows`,
		);
	} finally {
		run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
		rmSync(data, { recursive: true, force: true });
		writeFileSync(join(out, "sql-replay.txt"), `${evidence.join("\n")}\n`);
	}
	console.log(`SQL replay: ${violation ? "FAIL OneOpenPerUser" : "PASS"}`);
	return violation;
}
