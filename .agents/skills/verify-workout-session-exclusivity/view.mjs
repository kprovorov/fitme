export const title = "A User has at most one open Workout Session";

export const state = (v) => {
	const names = [
		"existing orphan",
		"first writer",
		"second writer",
		"third writer",
	];
	const describe = (status) =>
		Object.keys(v.rows)
			.filter((s) => v.rows[s] === status)
			.map((s) => names[s])
			.join(", ") || "none";
	return `Open: ${describe("open")}; uncommitted: ${describe("pending")}`;
};

export const step = (action) => {
	const labels = {
		ReadOpen: "a caller checks for an open Workout Session",
		Insert: "a writer inserts an uncommitted Workout Session",
		Conflict: "the index refuses a conflicting insert",
		Commit: "an insertion commits",
		Rollback: "an insertion rolls back",
		Finish: "a finish commits",
		Delete: "a deletion commits",
		RemoveWorkout: "a Workout is deleted, leaving its Workout Session",
		Done: "all writers have returned",
	};
	return labels[action.replace(/\(.*/, "")] ?? action;
};
