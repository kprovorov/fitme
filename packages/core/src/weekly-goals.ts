import {
  type ProgressSession,
  qualifiesForProgress,
} from "./training-progress";

const CALENDAR_OFFSET = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/;

/** Expo's fixed-offset calendar IDs use the ISO sign: GMT+1 is east of UTC. */
export function calendarOffsetMinutes(timeZone: string): number | null {
  const match = CALENDAR_OFFSET.exec(timeZone);
  if (!match) {
    return null;
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return (match[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

/**
 * One change of the User's Weekly goal (ADR 0015), as the Public API answers
 * it: the active Plan's training frequency from `recorded_at` on, `null` once
 * no Plan is active.
 */
export interface WeeklyGoalChange {
  recorded_at: string;
  target: number | null;
}

/**
 * How a week's goal is known:
 * - `tracked`: a full week with the goal in effect when it began;
 * - `firstPartial`: the week tracking started in, with that first goal; it
 *   can be hit but its miss is never held against the User, and it never
 *   counts toward the weeks-hit summary;
 * - `unknown`: before tracking, or begun without an active Plan: its
 *   Workout Sessions count, but nothing is judged.
 */
export type WeekGoalKind = "firstPartial" | "tracked" | "unknown";

/** One Monday–Sunday week of the Weekly goal chart. */
export interface GoalWeek {
  /** Qualifying Workout Sessions started in it. */
  count: number;
  /** Whether it's the week `now` falls in (still running). */
  current: boolean;
  /** Its own goal; `null` when `kind` is `unknown`. */
  goal: number | null;
  /** Whether `count` reached its known goal. */
  hit: boolean;
  kind: WeekGoalKind;
  /** Monday 00:00 on the device's clock. */
  start: Date;
}

export interface WeeklyGoalOverview {
  /** The weeks counted by the weeks-hit summary: completed, fully tracked. */
  eligibleWeeks: number;
  /** The goal to show: this week's, or the active Plan's when this week has none. */
  goal: number;
  /** Of `eligibleWeeks`, those whose goal was hit. */
  hitWeeks: number;
  /** Oldest first, this week last. */
  weeks: GoalWeek[];
}

const DAYS_PER_WEEK = 7;

/** The Monday 00:00 starting the week `date` falls in, on the device's clock. */
export const startOfGoalWeek = (date: Date): Date => {
  const daysSinceMonday = (date.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - daysSinceMonday
  );
};

/**
 * `weeks` Mondays from `start` (negative: earlier), by the calendar, so a
 * daylight-saving change never moves one off midnight.
 */
const addWeeks = (start: Date, weeks: number): Date =>
  new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + weeks * DAYS_PER_WEEK
  );

/** The goal a week starting at `start` (ending at `end`) has, and how it's known. */
const goalOfWeek = (
  changes: { at: number; target: number | null }[],
  start: number,
  end: number
): Pick<GoalWeek, "goal" | "kind"> => {
  const [first] = changes;
  if (!first || first.at >= end) {
    return { goal: null, kind: "unknown" };
  }
  if (first.at >= start) {
    return first.target === null
      ? { goal: null, kind: "unknown" }
      : {
          goal: first.target,
          kind: first.at === start ? "tracked" : "firstPartial",
        };
  }
  // Every later change takes effect the Monday after it, so the goal is the
  // last one recorded before the week began.
  let target: number | null = null;
  for (const change of changes) {
    if (change.at >= start) {
      break;
    }
    ({ target } = change);
  }
  return target === null
    ? { goal: null, kind: "unknown" }
    : { goal: target, kind: "tracked" };
};

/**
 * The Weekly goal chart: the `weekCount` Monday–Sunday weeks up to the one
 * `now` falls in, on the device's clock, each with its own retained goal and
 * the qualifying Workout Sessions started in it (from every Plan). The
 * weeks-hit summary counts the completed, fully tracked weeks among them.
 * `null` without an active Plan (no changes, or the last one `null`), when
 * History shows no goal at all.
 */
export function weeklyGoalOverview(
  changes: WeeklyGoalChange[],
  sessions: ProgressSession[],
  now: Date = new Date(),
  weekCount = 8
): WeeklyGoalOverview | null {
  const latest = changes.at(-1)?.target ?? null;
  if (latest === null) {
    return null;
  }
  const log = changes
    .map((change) => ({
      at: new Date(change.recorded_at).getTime(),
      target: change.target,
    }))
    .sort((a, b) => a.at - b.at);
  const starts = sessions
    .filter(qualifiesForProgress)
    .map((session) => new Date(session.started_at).getTime());

  const thisWeek = startOfGoalWeek(now);
  const weeks: GoalWeek[] = [];
  for (let offset = 1 - weekCount; offset <= 0; offset += 1) {
    const start = addWeeks(thisWeek, offset);
    const from = start.getTime();
    const to = addWeeks(start, 1).getTime();
    const { goal, kind } = goalOfWeek(log, from, to);
    const count = starts.filter((at) => at >= from && at < to).length;
    weeks.push({
      count,
      current: offset === 0,
      goal,
      hit: goal !== null && count >= goal,
      kind,
      start,
    });
  }

  const eligible = weeks.filter(
    (week) => !week.current && week.kind === "tracked"
  );
  return {
    eligibleWeeks: eligible.length,
    goal: weeks.at(-1)?.goal ?? latest,
    hitWeeks: eligible.filter((week) => week.hit).length,
    weeks,
  };
}
