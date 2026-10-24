import { z } from "zod";
import { storage } from "~/lib/mmkv";

/** The User's model pick, a model id; kept even once it leaves the list. */
export const SELECTED_MODEL_KEY = "arnold.model";
/** The last list `GET /v1/arnold/models` answered, the same for every User. */
export const MODELS_KEY = "arnold.models";

const arnoldModelSchema = z.object({
  description: z.string(),
  id: z.string(),
  label: z.string(),
});

/** Arnold models served by `GET /v1/arnold/models` in `apps/api`. */
export const arnoldModelListSchema = z
  .object({
    defaultId: z.string(),
    models: z.array(arnoldModelSchema).min(1),
  })
  .refine(({ defaultId, models }) => models.some(({ id }) => id === defaultId));

export type ArnoldModelOption = z.infer<typeof arnoldModelSchema>;
export type ArnoldModelList = z.infer<typeof arnoldModelListSchema>;

/**
 * The model a turn runs on: the saved pick when it's in the list, otherwise
 * the list's default. No list, no model: Arnold then picks its own default.
 */
export function resolveArnoldModel(
  savedId: string | undefined,
  list: ArnoldModelList | undefined
): ArnoldModelOption | undefined {
  if (!list) {
    return;
  }
  return (
    list.models.find(({ id }) => id === savedId) ??
    list.models.find(({ id }) => id === list.defaultId)
  );
}

/** The cached list; an unreadable or malformed value counts as none. */
export function readCachedArnoldModels(): ArnoldModelList | undefined {
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
  const parsed = arnoldModelListSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function writeCachedArnoldModels(list: ArnoldModelList) {
  storage.set(MODELS_KEY, JSON.stringify(list));
}

/**
 * Non-reactive read of the model to send, safe to call from request builders
 * outside React. The cache holds the last fetched list, so it's current.
 */
export function getSelectedArnoldModelId(): string | undefined {
  return resolveArnoldModel(
    storage.getString(SELECTED_MODEL_KEY),
    readCachedArnoldModels()
  )?.id;
}
