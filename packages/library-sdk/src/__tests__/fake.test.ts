import { describe, expect, it } from "vitest";

import {
  createLibrary,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "..";
import { createFakeLibrary } from "../fake";
import { cover, stubApi } from "./stub-api";

const covers = [
  cover("3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b", {
    muscle_groups: ["quadriceps", "glutes"],
  }),
  cover("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d", { muscle_groups: ["chest"] }),
];

const realOver = (served: typeof covers) =>
  createLibrary({
    fetch: stubApi(served).fetch,
    token: async () => await Promise.resolve("secret"),
    url: "https://library.test",
  });

describe("covers", () => {
  it("answers every Cover like the real client, in the order given", async () => {
    const answer = await createFakeLibrary(covers).covers();

    expect(answer).toStrictEqual(await realOver(covers).covers());
    expect(answer.map((c) => c.id)).toStrictEqual(covers.map((c) => c.id));
  });

  it("answers an empty list like the real client without Covers", async () => {
    await expect(createFakeLibrary().covers()).resolves.toStrictEqual(
      await realOver([]).covers()
    );
    await expect(createFakeLibrary().covers()).resolves.toStrictEqual([]);
  });

  it("answers copies, so a caller changing one leaves the fake alone", async () => {
    const library = createFakeLibrary(covers);
    const [first] = await library.covers();
    first?.muscle_groups.push("abs");

    await expect(library.covers()).resolves.toStrictEqual(covers);
  });
});

describe("failing", () => {
  describe.each([
    { failure: new LibraryUnauthorizedError() },
    { failure: new LibraryRateLimitedError(30) },
    { failure: new LibraryUnavailableError() },
  ])("with $failure.name", ({ failure }) => {
    it("fails every call", async () => {
      const library = createFakeLibrary(covers);

      library.failWith(failure);

      await expect(library.covers()).rejects.toBe(failure);
    });

    it("answers again when told to stop failing", async () => {
      const library = createFakeLibrary(covers);

      library.failWith(failure);
      await expect(library.covers()).rejects.toBe(failure);
      library.failWith(null);

      await expect(library.covers()).resolves.toStrictEqual(covers);
    });
  });
});
