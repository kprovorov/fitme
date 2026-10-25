import type { Gender, MeasurementSystem, Profile } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { getClerk } from "~/lib/clerk";
import { publicApi } from "~/lib/public-api";
import { splitFullName } from "~/lib/user-name";

export interface StoreProfileData {
  age: number;
  gender: Gender;
  height: number;
  /** Measurement system the weight and height were entered in. */
  measurementSystem: MeasurementSystem;
  weight: number;
}

/**
 * Creates the User's Profile through `PUT /v1/profile`, or replaces the one
 * they have (the API converts their stored heights and weights to a new
 * measurement system), so running onboarding again never makes a second one.
 * Nothing from the answer is kept: the caller reads the Profile again.
 */
const putProfile = async ({
  measurementSystem,
  ...fields
}: StoreProfileData): Promise<void> => {
  await publicApi().PUT("/v1/profile", {
    body: { ...fields, measurement_system: measurementSystem },
  });
};

export const useStoreProfileMutation = createMutation<void, StoreProfileData>({
  mutationFn: putProfile,
});

const EDITABLE_FIELDS = ["age", "gender", "height", "weight"] as const;

/** The Profile fields edit-profile changes. */
type EditableFields = Pick<StoreProfileData, (typeof EDITABLE_FIELDS)[number]>;

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

export interface UpdateProfileData extends StoreProfileData {
  name: string;
  /** The saved Profile the form started from, or `null` without one. */
  profile: Profile | null;
}

/**
 * Saves edit-profile: without a saved Profile (onboarding was skipped) the
 * whole Profile through `PUT /v1/profile`; with one, the changed fields
 * through `PATCH /v1/profile` (no request when nothing changed). Then the
 * name to Clerk. A failure rejects with its `ApiError`. Nothing from the
 * answer is kept: the caller reads the Profile again.
 */
export const useUpdateProfileMutation = createMutation<void, UpdateProfileData>(
  {
    mutationFn: async ({
      measurementSystem,
      name,
      profile,
      ...values
    }: UpdateProfileData): Promise<void> => {
      if (profile) {
        const changes = profileChanges(profile, values);
        if (Object.keys(changes).length > 0) {
          await publicApi().PATCH("/v1/profile", { body: changes });
        }
      } else {
        await putProfile({ ...values, measurementSystem });
      }

      // The name lives in Clerk, not in the profiles table
      const { user } = getClerk();
      if (user && name !== (user.fullName ?? "")) {
        await user.update(splitFullName(name));
      }
    },
  }
);
