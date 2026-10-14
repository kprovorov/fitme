import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodTypeAny } from "zod";

const db = vi.hoisted(() => ({ asUser: vi.fn() }));
const services = vi.hoisted(() => ({ getProfile: vi.fn() }));
vi.mock("@fitme/db", () => db);
vi.mock("@fitme/services/profile", () => services);

const { default: getUserProfile } = await import(
  "../agent/tools/get_user_profile"
);

const tx = { fake: "transaction" };

const clerkUser = (principalId: string) => ({
  attributes: {},
  authenticator: "clerk",
  principalId,
  principalType: "user",
});

/** A tool context whose session was started by `owner`. */
const contextFor = (owner: string | null): ToolContext =>
  ({
    session: {
      auth: {
        current: owner ? clerkUser(owner) : null,
        initiator: owner ? clerkUser(owner) : null,
      },
      id: "wrun_test",
      turn: { id: "turn_1", sequence: 1 },
    },
  }) as unknown as ToolContext;

const profile = {
  age: 30,
  gender: "female",
  height: 170,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60,
};

beforeEach(() => {
  db.asUser.mockImplementation((_userId, fn) => fn(tx));
  services.getProfile.mockResolvedValue(profile);
});

describe("get_user_profile", () => {
  it("reads the Profile as the session's User", async () => {
    const result = await getUserProfile.execute({}, contextFor("user_alice"));

    expect(result).toEqual(profile);
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.getProfile).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("ignores any User id in its input", async () => {
    // What eve hands execute after validating the model's input
    const input = (getUserProfile.inputSchema as ZodTypeAny).parse({
      user: "user_mallory",
      user_id: "user_mallory",
      userId: "user_mallory",
    });

    await getUserProfile.execute(input, contextFor("user_alice"));

    expect(input).toEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.getProfile).toHaveBeenCalledWith(tx, "user_alice");
    expect(
      JSON.stringify([db.asUser.mock.calls, services.getProfile.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("tells the model when the User has no Profile yet", async () => {
    services.getProfile.mockResolvedValue(null);

    expect(await getUserProfile.execute({}, contextFor("user_alice"))).toEqual({
      error: "Profile not found",
    });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getUserProfile.execute({}, contextFor(null))
    ).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
