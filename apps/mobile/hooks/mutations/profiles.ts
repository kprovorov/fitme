import type { Gender, MeasurementSystem, Profile } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { getClerk } from "~/lib/clerk";
import { publicApi } from "~/lib/public-api";
import { splitFullName } from "~/lib/user-name";

const EDITABLE_FIELDS = ["age", "gender", "height", "weight"] as const;

/** The Profile fields the Profile form edits. */
type EditableFields = Pick<Profile, (typeof EDITABLE_FIELDS)[number]>;

export type ProfileChanges = Partial<EditableFields>;

/**
 * The fields of `values` that differ from the saved `profile`. Unchanged
 * fields are never sent, so a value saved before today's bounds doesn't fail
 * an unrelated edit.
 */
export const profileChanges = (
  profile: Profile,
  values: EditableFields
): ProfileChanges => {
  const changes: ProfileChanges = {};
  for (const field of EDITABLE_FIELDS) {
    if (profile[field] !== values[field]) {
      Object.assign(changes, { [field]: values[field] });
    }
  }
  return changes;
};

export interface StoreProfileData extends EditableFields {
  gender: Gender;
  /** Measurement system the weight and height were entered in. */
  measurementSystem: MeasurementSystem;
  /** The saved Profile the form started from, or `null` without one. */
  profile: Profile | null;
}

/**
 * Saves the Profile form: without a saved Profile, the whole Profile through
 * `PUT /v1/profile`, which creates it (or replaces one saved meanwhile, so
 * there's never a second one); with one, only the changed fields through
 * `PATCH /v1/profile` (no request when nothing changed), the way edit-profile
 * and a re-run onboarding alike keep a value saved before today's bounds.
 * A failure rejects with its `ApiError`. Nothing from the answer is kept:
 * the caller reads the Profile again.
 */
const saveProfile = async ({
  measurementSystem,
  profile,
  ...values
}: StoreProfileData): Promise<void> => {
  if (!profile) {
    await publicApi().PUT("/v1/profile", {
      body: { ...values, measurement_system: measurementSystem },
    });
    return;
  }
  const changes = profileChanges(profile, values);
  if (Object.keys(changes).length > 0) {
    await publicApi().PATCH("/v1/profile", { body: changes });
  }
};

/** Onboarding's save: `saveProfile`. */
export const useStoreProfileMutation = createMutation<void, StoreProfileData>({
  mutationFn: saveProfile,
});

export interface UpdateProfileData extends StoreProfileData {
  name: string;
}

/** Edit-profile's save: `saveProfile`, then the name to Clerk. */
export const useUpdateProfileMutation = createMutation<void, UpdateProfileData>(
  {
    mutationFn: async ({ name, ...data }: UpdateProfileData): Promise<void> => {
      await saveProfile(data);

      // The name lives in Clerk, not in the profiles table
      const { user } = getClerk();
      if (user && name !== (user.fullName ?? "")) {
        await user.update(splitFullName(name));
      }
    },
  }
);
