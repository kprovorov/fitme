import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodTypeAny } from "zod";
import { contextFor, userIdFields } from "./tool-context";

const db = vi.hoisted(() => ({ asUser: vi.fn() }));
const services = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock("@fitme/db", () => db);
vi.mock("@fitme/services/profile", () => services);

const { default: updateUserProfile } = await import(
  "../agent/tools/update_user_profile"
);

const tx = { fake: "transaction" };

const profile = {
  age: 30,
  gender: "female",
  height: 66.93,
  measurement_system: "us",
  units: { height: "in", weight: "lbs" },
  weight: 132.28,
};

const parse = (input: unknown) =>
  (updateUserProfile.inputSchema as ZodTypeAny).parse(input);

beforeEach(() => {
  db.asUser.mockImplementation((_userId, fn) => fn(tx));
  services.updateProfile.mockResolvedValue(profile);
});

describe("update_user_profile", () => {
  it("updates the Profile as the session's User", async () => {
    const changes = { measurement_system: "us", weight: 132.28 } as const;

    const result = await updateUserProfile.execute(
      changes,
      contextFor("user_alice")
    );

    expect(result).toEqual({ profile, success: true });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.updateProfile).toHaveBeenCalledWith(
      tx,
      "user_alice",
      changes
    );
  });

  it("ignores any User id in its input", async () => {
    const input = parse({ ...userIdFields, age: 31 });

    await updateUserProfile.execute(input, contextFor("user_alice"));

    expect(input).toEqual({ age: 31 });
    expect(services.updateProfile).toHaveBeenCalledWith(tx, "user_alice", {
      age: 31,
    });
    expect(
      JSON.stringify([db.asUser.mock.calls, services.updateProfile.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("keeps the inputs it had in ai-agent", () => {
    expect(
      parse({
        age: 30,
        gender: "male",
        height: 180,
        measurement_system: "uk",
        weight: 80,
      })
    ).toEqual({
      age: 30,
      gender: "male",
      height: 180,
      measurement_system: "uk",
      weight: 80,
    });
    for (const invalid of [
      { age: 9 },
      { age: 30.5 },
      { gender: "other" },
      { height: 0 },
      { measurement_system: "imperial" },
      { weight: -1 },
    ]) {
      expect(
        (updateUserProfile.inputSchema as ZodTypeAny).safeParse(invalid).success
      ).toBe(false);
    }
  });

  it("tells the model when the User has no Profile yet", async () => {
    services.updateProfile.mockResolvedValue(null);

    expect(
      await updateUserProfile.execute({ age: 31 }, contextFor("user_alice"))
    ).toEqual({ error: "Profile not found" });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      updateUserProfile.execute({ age: 31 }, contextFor(null))
    ).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
