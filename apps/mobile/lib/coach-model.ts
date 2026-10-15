import { z } from "zod";
import { storage } from "~/lib/mmkv";

/** The User's model pick, a model id; kept even once it leaves the list. */
export const SELECTED_MODEL_KEY = "coach.model";
/** The last list `GET /v1/coach/models` answered, the same for every User. */
export const MODELS_KEY = "coach.models";

const coachModelSchema = z.object({
  description: z.string(),
  id: z.string(),
  label: z.string(),
});

/** The Coach models served by `GET /v1/coach/models` in `apps/api`. */
export const coachModelListSchema = z
  .object({
    defaultId: z.string(),
    models: z.array(coachModelSchema).min(1),
  })
  .refine(({ defaultId, models }) => models.some(({ id }) => id === defaultId));

export type CoachModelOption = z.infer<typeof coachModelSchema>;
export type CoachModelList = z.infer<typeof coachModelListSchema>;

/**
 * The model a turn runs on: the saved pick when it's in the list, otherwise
 * the list's default. No list, no model: the Coach then picks its own default.
 */
export function resolveCoachModel(
  savedId: string | undefined,
  list: CoachModelList | undefined
): CoachModelOption | undefined {
  if (!list) {
    return;
  }
  return (
    list.models.find(({ id }) => id === savedId) ??
    list.models.find(({ id }) => id === list.defaultId)
  );
}

/** The cached list; an unreadable or malformed value counts as none. */
export function readCachedCoachModels(): CoachModelList | undefined {
  const raw = storage.getString(MODELS_KEY);
  if (!raw) {
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  const parsed = coachModelListSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function writeCachedCoachModels(list: CoachModelList) {
  storage.set(MODELS_KEY, JSON.stringify(list));
}

/**
 * Non-reactive read of the model to send, safe to call from request builders
 * outside React. The cache holds the last fetched list, so it's current.
 */
export function getSelectedCoachModelId(): string | undefined {
  return resolveCoachModel(
    storage.getString(SELECTED_MODEL_KEY),
    readCachedCoachModels()
  )?.id;
}
