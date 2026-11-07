import type * as Db from "@fitme/db";
import type * as ProfileServices from "@fitme/services/profile";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

// oxlint-disable-next-line vitest/require-mock-type-parameters -- Vitest cannot preserve asUser's polymorphic return type; the typed profile callback is supplied below.
const db = vi.hoisted(() => ({ asUser: vi.fn() }));

const services = vi.hoisted(() => ({
  getProfile: vi.fn<typeof ProfileServices.getProfile>(),
}));

vi.mock<typeof Db>(import("@fitme/db"), () => db);

vi.mock<typeof ProfileServices>(
  import("@fitme/services/profile"),
  () => services
);

const { default: getUserProfile } =
  await import("../agent/tools/get_user_profile");

const tx = { fake: "transaction" };

const profile: ProfileServices.ProfileWithUnits = {
  age: 30,
  gender: "female",
  height: 170,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60,
};

describe("get_user_profile", () => {
  beforeEach(() => {
    db.asUser.mockImplementation(
      async (
        _userId: string,
        fn: (
          transaction: typeof tx
        ) => Promise<ProfileServices.ProfileWithUnits | null>
      ) => await fn(tx)
    );
    services.getProfile.mockResolvedValue(profile);
  });

  it("reads the Profile as the session's User", async () => {
    const result = await getUserProfile.execute({}, contextFor("user_alice"));

    expect(result).toStrictEqual(profile);
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.getProfile).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("ignores any User id in its input", async () => {
    // What eve hands execute after validating the model's input
    const input = inputSchemaOf(getUserProfile).parse(userIdFields);

    await getUserProfile.execute(input, contextFor("user_alice"));

    expect(input).toStrictEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.getProfile).toHaveBeenCalledWith(tx, "user_alice");
    expect(
      JSON.stringify([db.asUser.mock.calls, services.getProfile.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("tells the model when the User has no Profile yet", async () => {
    services.getProfile.mockResolvedValue(null);

    await expect(
      getUserProfile.execute({}, contextFor("user_alice"))
    ).resolves.toStrictEqual({
      error: "Profile not found",
    });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(getUserProfile.execute({}, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
