import { qualifiesForProgress } from "./training-progress";
import type { ProgressSession } from "./training-progress";

const CALENDAR_OFFSET =
  /^(?:GMT|UTC)(?<sign>[+-])(?<hours>\d{1,2})(?::?(?<minutes>\d{2}))?$/u;

/** Expo's fixed-offset calendar IDs use the ISO sign: GMT+1 is east of UTC. */
export const calendarOffsetMinutes = (timeZone: string): number | null => {
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
};

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
  /** Monday 00:00 in the overview's time zone (the device's clock without one). */
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

/** A calendar day, `month` 1–12 (`day` may run past the month's end). */
interface CalendarDay {
  day: number;
  month: number;
  year: number;
}

/** A time zone's calendar: the day an instant falls on, and a day's 00:00. */
interface ZoneCalendar {
  dayOf: (instant: number) => CalendarDay;
  midnightOf: (day: CalendarDay) => number;
}

const MS_PER_MINUTE = 60_000;
const DAY_MS = 86_400_000;

const fixedOffsetCalendar = (offsetMinutes: number): ZoneCalendar => {
  const offset = offsetMinutes * MS_PER_MINUTE;

  return {
    dayOf: (instant) => {
      const shifted = new Date(instant + offset);

      return {
        day: shifted.getUTCDate(),
        month: shifted.getUTCMonth() + 1,
        year: shifted.getUTCFullYear(),
      };
    },
    midnightOf: ({ day, month, year }) =>
      Date.UTC(year, month - 1, day) - offset,
  };
};

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's wall clock; an unknown zone throws `Intl`'s `RangeError`. */
const zoneFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = zoneFormatters.get(timeZone);

  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      minute: "numeric",
      month: "numeric",
      second: "numeric",
      timeZone,
      year: "numeric",
    });
    zoneFormatters.set(timeZone, formatter);
  }

  return formatter;
};

const ianaCalendar = (timeZone: string): ZoneCalendar => {
  const formatter = zoneFormatter(timeZone);

  /** The zone's wall clock at `instant`, read as if it were UTC. */
  const wallClock = (instant: number): number => {
    const parts: Record<string, number> = {};

    for (const part of formatter.formatToParts(instant)) {
      if (part.type !== "literal") {
        parts[part.type] = Number(part.value);
      }
    }

    return Date.UTC(
      parts.year ?? 0,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0
    );
  };

  /** How far the zone's clock is ahead of UTC at `instant`. */
  const offsetAt = (instant: number): number =>
    wallClock(instant) - (instant - (((instant % 1000) + 1000) % 1000));

  return {
    dayOf: (instant) => {
      const wall = new Date(wallClock(instant));

      return {
        day: wall.getUTCDate(),
        month: wall.getUTCMonth() + 1,
        year: wall.getUTCFullYear(),
      };
    },
    midnightOf: ({ day, month, year }) => {
      const wall = Date.UTC(year, month - 1, day);
      const asked = new Date(wall).getUTCDate();

      // 00:00 at each offset the zone has around that day. The earliest that
      // falls on the day is its first instant: the clocks' jump when 00:00
      // itself is skipped.
      const offsets = [-DAY_MS, 0, DAY_MS].map((shift) =>
        offsetAt(wall + shift)
      );

      const onTheDay = [
        ...offsets.map((offset) => wall - offset),
        wall - offsetAt(wall - offsetAt(wall)),
      ].filter(
        (candidate) => new Date(wallClock(candidate)).getUTCDate() === asked
      );

      return Math.min(...onTheDay);
    },
  };
};

/** `timeZone`'s calendar: one of Expo's fixed-offset ids, or an IANA zone. */
const zoneCalendar = (timeZone: string): ZoneCalendar => {
  const offset = calendarOffsetMinutes(timeZone);

  return offset === null ? ianaCalendar(timeZone) : fixedOffsetCalendar(offset);
};

/** Days since the Monday of the week `day` falls in. */
const daysSinceMonday = ({ day, month, year }: CalendarDay): number =>
  (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + DAYS_PER_WEEK - 1) %
  DAYS_PER_WEEK;

/** The Monday of the week `date` falls in, on `calendar`. */
const mondayOf = (date: Date, calendar: ZoneCalendar): CalendarDay => {
  const day = calendar.dayOf(date.getTime());

  return { ...day, day: day.day - daysSinceMonday(day) };
};

/** 00:00 of the Monday `weeks` weeks from `monday` (negative: earlier). */
const zonedWeekStart = (
  monday: CalendarDay,
  weeks: number,
  calendar: ZoneCalendar
): Date =>
  new Date(
    calendar.midnightOf({ ...monday, day: monday.day + weeks * DAYS_PER_WEEK })
  );

/**
 * The Monday 00:00 starting the week `date` falls in: in `timeZone` (an IANA
 * zone, or one of Expo's fixed-offset ids) when given, on the device's clock
 * otherwise. An unknown `timeZone` throws a `RangeError`.
 */
export const startOfGoalWeek = (date: Date, timeZone?: string): Date => {
  if (timeZone !== undefined) {
    const calendar = zoneCalendar(timeZone);

    return zonedWeekStart(mondayOf(date, calendar), 0, calendar);
  }

  const sinceMonday = (date.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - sinceMonday
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

/**
 * The Monday 00:00 `weeks` weeks from the week `now` falls in (negative:
 * earlier), each worked out from this week's Monday, never from the week
 * before it, so a skipped midnight can't shift the weeks after it.
 */
const weekStarts = (
  now: Date,
  timeZone: string | undefined
): ((weeks: number) => Date) => {
  if (timeZone === undefined) {
    const thisWeek = startOfGoalWeek(now);

    return (weeks) => addWeeks(thisWeek, weeks);
  }

  const calendar = zoneCalendar(timeZone);
  const monday = mondayOf(now, calendar);

  return (weeks) => zonedWeekStart(monday, weeks, calendar);
};

/** The goal a week starting at `start` (ending at `end`) has, and how it's known. */
const goalOfWeek = (
  changes: { at: number; target: number | null }[],
  start: number,
  end: number
): Pick<GoalWeek, "goal" | "kind"> => {
  const [first] = changes;

  if (first === undefined || first.at >= end) {
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
 * `now` falls in, in `timeZone` (an IANA zone, or one of Expo's fixed-offset
 * ids; an unknown one throws a `RangeError`) or, without one, on the device's
 * clock, each with its own retained goal and
 * the qualifying Workout Sessions started in it (from every Plan). The
 * weeks-hit summary counts the completed, fully tracked weeks among them.
 * `null` without an active Plan (no changes, or the last one `null`), when
 * History shows no goal at all.
 */
export const weeklyGoalOverview = (
  changes: WeeklyGoalChange[],
  sessions: ProgressSession[],
  now: Date = new Date(),
  weekCount = 8,
  timeZone?: string
): WeeklyGoalOverview | null => {
  const latest = changes.at(-1)?.target ?? null;

  if (latest === null) {
    return null;
  }

  const log = changes
    .map((change) => ({
      at: new Date(change.recorded_at).getTime(),
      target: change.target,
    }))
    .toSorted((a, b) => a.at - b.at);

  const starts = sessions.flatMap((session) =>
    qualifiesForProgress(session)
      ? [new Date(session.started_at).getTime()]
      : []
  );

  const weekStart = weekStarts(now, timeZone);
  const weeks: GoalWeek[] = [];

  for (let offset = 1 - weekCount; offset <= 0; offset += 1) {
    const start = weekStart(offset);
    const from = start.getTime();
    const to = weekStart(offset + 1).getTime();
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
};
