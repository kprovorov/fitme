import { ApiError } from "@fitme/api-client";
import type {
  Gender,
  MeasurementSystem,
  Profile as ProfileFields,
} from "@fitme/core";
import type { QueryClient } from "@tanstack/react-query";
import { createMutation } from "react-query-kit";
import { type Profile, useProfileQuery } from "~/hooks/queries/profiles";
import { getClerk } from "~/lib/clerk";
import { publicApi } from "~/lib/public-api";
import { splitFullName } from "~/lib/user-name";
import {
  rememberWriteStarter,
  seedWriteAnswer,
  type WriteStarter,
} from "~/lib/write-answers";

const EDITABLE_FIELDS = ["age", "gender", "height", "weight"] as const;

/** The Profile fields the Profile form edits. */
type EditableFields = Pick<ProfileFields, (typeof EDITABLE_FIELDS)[number]>;

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
 * Answers the saved Profile: the API's answer, or the saved one as it was
 * when nothing changed. A failure rejects with its `ApiError`.
 */
const saveProfile = async ({
  measurementSystem,
  profile,
  ...values
}: StoreProfileData): Promise<Profile> => {
  if (!profile) {
    const { data } = await publicApi().PUT("/v1/profile", {
      body: { ...values, measurement_system: measurementSystem },
    });
    if (!data) {
      throw new ApiError("Public API answered no Profile");
    }
    return data.data;
  }
  const changes = profileChanges(profile, values);
  if (Object.keys(changes).length === 0) {
    return profile;
  }
  const { data } = await publicApi().PATCH("/v1/profile", { body: changes });
  if (!data) {
    throw new ApiError("Public API answered no Profile");
  }
  return data.data;
};

/**
 * The Profile query shows a write's answer as is: no second read. A read of
 * it still in flight was answered before the write, so it's dropped first.
 * Only while `starter`, the User who started the write, is still signed in
 * (`seedWriteAnswer`).
 */
export const seedProfile = (
  client: QueryClient,
  profile: Profile,
  starter: WriteStarter | undefined
) =>
  seedWriteAnswer(starter, async () => {
    const queryKey = useProfileQuery.getKey();
    await client.cancelQueries({ exact: true, queryKey });
    client.setQueryData(queryKey, profile);
  });

/**
 * Onboarding's save: `saveProfile`, whose answer then shows as the Profile.
 * Seeded in the mutation's own `onMutate` and `onSuccess` (a hook-level one
 * would replace it), so a screen passes its `onSuccess` to `mutate`.
 */
export const useStoreProfileMutation = createMutation<
  Profile,
  StoreProfileData,
  Error,
  WriteStarter
>({
  mutationFn: saveProfile,
  onMutate: rememberWriteStarter,
  onSuccess: async (profile, _variables, starter, { client }) => {
    await seedProfile(client, profile, starter);
  },
});

export interface UpdateProfileData extends StoreProfileData {
  name: string;
}

/**
 * Edit-profile's save: `saveProfile`, then the name to Clerk; the Profile's
 * answer then shows as the Profile. If the name fails after the Profile was
 * saved, nothing is seeded: the screen reads the Profile again. Seeded in the
 * mutation's own `onMutate` and `onSuccess`, so a screen passes its
 * `onSuccess` to `mutate`.
 */
export const useUpdateProfileMutation = createMutation<
  Profile,
  UpdateProfileData,
  Error,
  WriteStarter
>({
  mutationFn: async ({
    name,
    ...data
  }: UpdateProfileData): Promise<Profile> => {
    const saved = await saveProfile(data);

    // The name lives in Clerk, not in the Profile
    const { user } = getClerk();
    if (user && name !== (user.fullName ?? "")) {
      await user.update(splitFullName(name));
    }
    return saved;
  },
  onMutate: rememberWriteStarter,
  onSuccess: async (profile, _variables, starter, { client }) => {
    await seedProfile(client, profile, starter);
  },
});
