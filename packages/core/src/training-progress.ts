/**
 * What a Workout Session needs to count toward training progress: when it
 * started and finished, the reps it completed and the weight × reps it
 * moved, as the Public API's Workout Session summaries carry them.
 */
export interface ProgressSession {
  completed_rep_count: number;
  finished_at: string | null;
  started_at: string;
  volume: number;
}

/**
 * Whether a Workout Session counts toward progress (monthly totals, Weekly
 * goals): it's finished and at least one set has positive reps. An empty
 * completion stays in History but earns nothing.
 */
export const qualifiesForProgress = (session: ProgressSession): boolean =>
  session.finished_at !== null && session.completed_rep_count > 0;

/** A calendar month's training: qualifying sessions, their time and volume. */
export interface MonthlyTotals {
  /** The full start-to-finish time of every qualifying session, summed. */
  elapsedMs: number;
  /** Weight × reps, in the unit the sessions' volumes are in. */
  volume: number;
  workouts: number;
}

const isSameLocalMonth = (date: Date, other: Date) =>
  date.getFullYear() === other.getFullYear() &&
  date.getMonth() === other.getMonth();

/**
 * The totals of the calendar month `now` falls in, on the device's clock:
 * each qualifying session counts wholly toward the month it started in, its
 * elapsed time measured between the two instants (so a daylight-saving
 * change in between doesn't stretch or shrink it).
 */
export function monthlyTotals(
  sessions: ProgressSession[],
  now: Date = new Date()
): MonthlyTotals {
  let elapsedMs = 0;
  let volume = 0;
  let workouts = 0;
  for (const session of sessions) {
    const startedAt = new Date(session.started_at);
    // `finished_at` again only for the type: a qualifying session has one.
    if (
      session.finished_at === null ||
      !qualifiesForProgress(session) ||
      !isSameLocalMonth(startedAt, now)
    ) {
      continue;
    }
    workouts += 1;
    elapsedMs += Math.max(
      0,
      new Date(session.finished_at).getTime() - startedAt.getTime()
    );
    volume += session.volume;
  }
  return { elapsedMs, volume: Math.round(volume * 100) / 100, workouts };
}
