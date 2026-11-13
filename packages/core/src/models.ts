export const goals = [
  "muscle-gain",
  "fat-loss",
  "recomposition",
  "strength-performance",
  "general-health-fitness",
] as const;

export type Goal = (typeof goals)[number];

export const places = ["gym", "home"] as const;

export type Place = (typeof places)[number];

export const experienceLevels = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type ExperienceLevel = (typeof experienceLevels)[number];

export const genders = ["male", "female"] as const;

export type Gender = (typeof genders)[number];

export const measurementSystems = ["metric", "us", "uk"] as const;

export type MeasurementSystem = (typeof measurementSystems)[number];

export const muscleGroups = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "traps",
  "lats",
  "lower-back",
  "cardio",
  "full-body",
] as const;

export type MuscleGroup = (typeof muscleGroups)[number];

/**
 * The gear an Exercise needs (GLOSSARY.md: Equipment). The only list of
 * Equipment in the codebase: the Library, the SDK, MCP, Arnold, i18n and the
 * app all read it from here, so a new value goes in here first and into the
 * content after. `bodyweight` means an Exercise needs no gear.
 */
export const equipment = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "smith_machine",
  "bench",
  "pull_up_bar",
  "landmine",
  "bodyweight",
] as const;

export type Equipment = (typeof equipment)[number];

export const isEquipment = (value: unknown): value is Equipment =>
  equipment.some((item) => item === value);

/** The languages Fitme speaks to a User in (GLOSSARY.md: App language). */
export const appLanguages = [
  "en",
  "uk",
  "es",
  "ca",
  "fr",
  "de",
  "it",
  "pt-BR",
  "pt-PT",
  "pl",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "nl",
] as const;

export type AppLanguage = (typeof appLanguages)[number];

/** The App language for every device language Fitme doesn't support. */
export const defaultAppLanguage: AppLanguage = "en";

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  appLanguages.some((language) => language === value);

const TRADITIONAL_CHINESE_REGIONS = new Set(["tw", "hk", "mo"]);

const languageFromTag = (tag: string): AppLanguage | undefined => {
  const [language, scriptOrRegion, regionAfterScript] = tag
    .replaceAll("_", "-")
    .toLowerCase()
    .split("-");

  const region =
    scriptOrRegion?.length === 4 ? regionAfterScript : scriptOrRegion;

  if (language === "pt") {
    return region === "pt" ? "pt-PT" : "pt-BR";
  }

  if (language === "zh") {
    if (scriptOrRegion === "hans") {
      return "zh-Hans";
    }

    return scriptOrRegion === "hant" ||
      TRADITIONAL_CHINESE_REGIONS.has(region ?? "")
      ? "zh-Hant"
      : "zh-Hans";
  }

  return isAppLanguage(language) ? language : undefined;
};

/**
 * The App language for a device's preferred languages (BCP 47 tags, most
 * preferred first): the first supported language (`uk-UA` → `uk`), or the
 * default. Portuguese follows its region (Brazilian without Portugal);
 * Chinese follows an explicit script, then TW/HK/MO for Traditional,
 * otherwise Simplified. No language stands in for another, so
 * Russian gets English. Walking the list in order matches how iOS and
 * Android pick an app's bundle language.
 */
export const resolveAppLanguage = (
  preferredLanguages: readonly string[]
): AppLanguage => {
  for (const tag of preferredLanguages) {
    const language = languageFromTag(tag);

    if (language) {
      return language;
    }
  }

  return defaultAppLanguage;
};

export interface Identifiable {
  id: string;
}

/**
 * Every table carrying `created_at` / `updated_at` has them nullable
 * (`database.types.ts`), so a row can come back without either.
 */
export interface Timestamped {
  created_at: string | null;
  updated_at: string | null;
}

export type Model = Identifiable & Timestamped;

export type Profile = Model & {
  // User id (JWT sub claim)
  user_id: string;
  gender: Gender;
  age: number;
  height: number;
  weight: number;
  measurement_system: MeasurementSystem;
};

export type Plan = Model & {
  // User id (JWT sub claim)
  user_id: string;
  /** `plans.name` is nullable, so a Plan can carry `null`. */
  name: string | null;
  /** `plans.description` is nullable, so a Plan can carry `null`. */
  description: string | null;
  /** Unset on a Plan built by hand (ADR 0017): it isn't shown. */
  goal: Goal | null;
  /** Unset on a Plan built by hand (ADR 0017): it isn't shown. */
  place: Place | null;
  frequency: number;
  /** Unset on a Plan built by hand (ADR 0017): it isn't shown. */
  experience_level: ExperienceLevel | null;
  /** Minutes, unset on a Plan built by hand (ADR 0017): it isn't shown. */
  workout_duration: number | null;
  /** `plans.note` is nullable: a Plan without a note carries `null`. */
  note: string | null;
  is_active: boolean;
  workouts: Workout[];
};

export type Workout = Model & {
  plan_id: string;
  plan: Plan;
  name: string;
  description: string;
  order: number;
  /** Its Library Cover's id (ADR 0014), `null` until one is assigned. */
  cover: string | null;
  exercises: WorkoutExercise[];
};

export type WorkoutExercise = Model & {
  workout_id: string;
  workout: Workout;
  /** The Exercise, by its Exercise slug: details come from the Library API. */
  exercise_slug: string;
  order: number;
  sets: WorkoutExerciseSet[];
};

export type WorkoutExerciseSet = Model & {
  workout_exercise_id: string;
  order: number;
  reps_recommended: number;
  weight_recommended: number;
  rest_recommended: number;
};

export type WorkoutSession = Model & {
  workout_id: string | null;
  plan_id: string | null;
  user_id: string;
  started_at: string;
  /** `null` while the Workout Session is open. */
  finished_at: string | null;
  exercises: WorkoutSessionExercise[];
  workout: Workout | null;
};

export type WorkoutSessionExercise = Model & {
  workout_session_id: string;
  /** The Exercise, by its Exercise slug: details come from the Library API. */
  exercise_slug: string;
  order: number;
  sets: WorkoutSessionExerciseSet[];
};

export type WorkoutSessionExerciseSet = Model & {
  workout_session_exercise_id: string;
  order: number;
  reps_recommended: number | null;
  weight_recommended: number | null;
  rest_recommended: number | null;
  reps_completed: number | null;
  weight_completed: number | null;
  logged_at: string | null;
};

export interface PlanData {
  description: string;
  /** Optional (ADR 0017): left out or `null`, the Plan has none. */
  experience_level?: ExperienceLevel | null;
  frequency: number;
  /** Optional (ADR 0017): left out or `null`, the Plan has none. */
  goal?: Goal | null;
  name: string;
  note?: string;
  /** Optional (ADR 0017): left out or `null`, the Plan has none. */
  place?: Place | null;
  /** Minutes, optional (ADR 0017): left out or `null`, the Plan has none. */
  workout_duration?: number | null;
  workouts: WorkoutData[];
}

export interface WorkoutData {
  description: string;
  exercises: WorkoutExerciseData[];
  name: string;
  order: number;
}

export interface WorkoutExerciseData {
  exercise_slug: string;
  order: number;
  sets: WorkoutExerciseSetData[];
}

export interface WorkoutExerciseSetData {
  order: number;
  reps_recommended: number;
  rest_recommended: number;
  weight_recommended: number;
}

/**
 * Payload for creating or rewriting a Plan (`createPlan` / `updatePlan` in
 * `@fitme/services`). They derive `order` from each item's position in the
 * arrays, so the payload carries no `order` fields.
 */
export interface PlanInput extends Omit<PlanData, "workouts"> {
  workouts: WorkoutInput[];
}

export interface WorkoutInput {
  description: string;
  exercises: WorkoutExerciseInput[];
  name: string;
}

export interface WorkoutExerciseInput {
  exercise_slug: string;
  sets: WorkoutExerciseSetInput[];
}

export type WorkoutExerciseSetInput = Omit<WorkoutExerciseSetData, "order">;

/**
 * Models Arnold can run on, by their Vercel AI Gateway id
 * (`<creator>/<model>`), the only list: `apps/arnold` rejects any id outside
 * it, except the retired ids it still runs on their successor. One medium
 * model per creator, each taking images (Attachments, ADR 0018).
 */
export const arnoldModels = [
  {
    description: "Quick and balanced, the best fit for everyday coaching",
    id: "openai/gpt-6.1-terra",
    label: "GPT-6.1 Terra",
  },
  {
    description: "Clear, natural writing for detailed plans and explanations",
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
  },
  {
    description: "Strong at reading photos, screenshots and documents",
    id: "google/gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
  },
  {
    description: "Direct, thorough answers that double-check the details",
    id: "spacexai/grok-4.7",
    label: "Grok 4.7",
  },
] as const satisfies readonly {
  description: string;
  id: `${string}/${string}`;
  label: string;
}[];

export type ArnoldModel = (typeof arnoldModels)[number];

export type ArnoldModelId = ArnoldModel["id"];

export const defaultArnoldModelId: ArnoldModelId = "openai/gpt-6.1-terra";

export const isArnoldModelId = (value: unknown): value is ArnoldModelId =>
  arnoldModels.some((model) => model.id === value);

/** The RevenueCat entitlement that makes a User Pro (and unlocks Arnold). */
export const proEntitlement = "Fitme Pro";

/**
 * Stable `code`s of Arnold's channel's `{ ok: false, code, error }` refusals:
 * `proRequired` (403) shows the paywall; `proCheckUnavailable` (503) means
 * the subscription couldn't be checked, so retry instead.
 */
export const arnoldErrorCodes = {
  proCheckUnavailable: "arnold_pro_check_unavailable",
  proRequired: "arnold_pro_required",
} as const;
