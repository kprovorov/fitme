import type * as Db from "@fitme/db";
import type * as ProfileServices from "@fitme/services/profile";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

type AsUser = (
  userId: string,
  fn: (
    transaction: Db.Transaction | typeof tx
  ) => Promise<ProfileServices.ProfileWithUnits | null>
) => Promise<ProfileServices.ProfileWithUnits | null>;

const db = vi.hoisted(() => ({ asUser: vi.fn<AsUser>() }));

const services = vi.hoisted(() => ({
  updateProfile: vi.fn<typeof ProfileServices.updateProfile>(),
}));

vi.mock<{ asUser: AsUser }>(import("@fitme/db"), () => db);

vi.mock<typeof ProfileServices>(
  import("@fitme/services/profile"),
  () => services
);

const { default: updateUserProfile } =
  await import("../agent/tools/update_user_profile");

const tx = { fake: "transaction" };

const profile: ProfileServices.ProfileWithUnits = {
  age: 30,
  gender: "female",
  height: 66.93,
  measurement_system: "us",
  units: { height: "in", weight: "lbs" },
  weight: 132.28,
};

describe("update_user_profile", () => {
  beforeEach(() => {
    db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
    services.updateProfile.mockResolvedValue(profile);
  });

  it("updates the Profile as the session's User", async () => {
    const changes = { measurement_system: "us", weight: 132.28 } as const;

    const result = await updateUserProfile.execute(
      changes,
      contextFor("user_alice")
    );

    expect(result).toStrictEqual({ profile, success: true });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.updateProfile).toHaveBeenCalledWith(
      tx,
      "user_alice",
      changes
    );
  });

  it("ignores any User id in its input", async () => {
    const input = inputSchemaOf(updateUserProfile).parse({
      ...userIdFields,
      age: 31,
    });

    await updateUserProfile.execute(input, contextFor("user_alice"));

    expect(input).toStrictEqual({ age: 31 });
    expect(services.updateProfile).toHaveBeenCalledWith(tx, "user_alice", {
      age: 31,
    });
    expect(
      JSON.stringify([db.asUser.mock.calls, services.updateProfile.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("keeps the inputs it had in ai-agent", () => {
    expect(
      inputSchemaOf(updateUserProfile).parse({
        age: 30,
        gender: "male",
        height: 180,
        measurement_system: "uk",
        weight: 80,
      })
    ).toStrictEqual({
      age: 30,
      gender: "male",
      height: 180,
      measurement_system: "uk",
      weight: 80,
    });
  });

  it.each([
    { age: 9 },
    { age: 30.5 },
    { gender: "other" },
    { height: 0 },
    { measurement_system: "imperial" },
    { weight: -1 },
  ])("rejects invalid Profile changes: %j", (invalid) => {
    expect(
      inputSchemaOf(updateUserProfile).safeParse(invalid).success
    ).toBeFalsy();
  });

  it("tells the model when the User has no Profile yet", async () => {
    services.updateProfile.mockResolvedValue(null);

    await expect(
      updateUserProfile.execute({ age: 31 }, contextFor("user_alice"))
    ).resolves.toStrictEqual({ error: "Profile not found" });
  });

  it("acts as the session's owner, never the turn's caller", async () => {
    await updateUserProfile.execute(
      { age: 31 },
      contextFor("user_alice", "user_mallory")
    );

    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(
      JSON.stringify([db.asUser.mock.calls, services.updateProfile.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      updateUserProfile.execute({ age: 31 }, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
