/**
 * `seedWriteAnswer` over a real QueryClient: one query with an observer (a
 * mounted Screen reading it) and one more for the write's `alsoInvalidate`,
 * each counting its reads, the signed-in User from `test-utils`.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { QueryObserver } from "@tanstack/react-query";
import { rememberWriteStarter, seedWriteAnswer } from "~/lib/write-answers";
import { createTestQueryClient } from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

const SEEDED = ["profile"];
const OTHER = ["plans"];

/** A query read by a mounted observer; `reads` counts its reads. */
const watched = (
  client: ReturnType<typeof createTestQueryClient>,
  queryKey: string[],
  answer: () => Promise<string>
) => {
  const counter = { reads: 0 };
  const observer = new QueryObserver(client, {
    queryFn: () => {
      counter.reads += 1;
      return answer();
    },
    queryKey,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { counter, unsubscribe };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe();
  }
});

/** Two watched queries, both read once. */
const setUp = async (seededAnswer: () => Promise<string>) => {
  const client = createTestQueryClient();
  const seeded = watched(client, SEEDED, seededAnswer);
  const other = watched(client, OTHER, () => Promise.resolve("other"));
  unsubscribers.push(seeded.unsubscribe, other.unsubscribe);
  await flush();
  return { client, other: other.counter, seeded: seeded.counter };
};

describe("seedWriteAnswer", () => {
  it("shows the answer without reading the query again, then invalidates the rest", async () => {
    const { client, other, seeded } = await setUp(() =>
      Promise.resolve("before")
    );
    const starter = rememberWriteStarter(client, [SEEDED]);

    const result = await seedWriteAnswer(client, starter, {
      alsoInvalidate: [{ queryKey: OTHER }],
      answer: "answer",
      queryKey: SEEDED,
    });

    expect(result).toBe("seeded");
    expect(client.getQueryData(SEEDED)).toBe("answer");
    expect(seeded.reads).toBe(1);
    expect(other.reads).toBe(2);
  });

  it("reads the query again when a read landed after the write started, in the same millisecond", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      let value = "before";
      const { client, seeded } = await setUp(() => Promise.resolve(value));
      const starter = rememberWriteStarter(client, [SEEDED]);
      value = "newer";
      await client.refetchQueries({ queryKey: SEEDED });

      const result = await seedWriteAnswer(client, starter, {
        answer: "older answer",
        queryKey: SEEDED,
      });

      expect(result).toBe("superseded");
      expect(client.getQueryData(SEEDED)).toBe("newer");
      expect(seeded.reads).toBe(3);
    } finally {
      clock.mockRestore();
    }
  });

  it("reads the query again when a write started later was seeded first", async () => {
    const { client } = await setUp(() => Promise.resolve("before"));
    const earlier = rememberWriteStarter(client, [SEEDED]);
    const later = rememberWriteStarter(client, [SEEDED]);
    await seedWriteAnswer(client, later, { answer: "later", queryKey: SEEDED });

    const result = await seedWriteAnswer(client, earlier, {
      answer: "earlier",
      queryKey: SEEDED,
    });

    expect(result).toBe("superseded");
    expect(client.getQueryData(SEEDED)).not.toBe("earlier");
  });

  it("touches nothing once another User has signed in", async () => {
    const { client, other, seeded } = await setUp(() =>
      Promise.resolve("before")
    );
    const starter = rememberWriteStarter(client, [SEEDED]);
    signInAs("user_next");

    const result = await seedWriteAnswer(client, starter, {
      alsoInvalidate: [{ queryKey: OTHER }],
      answer: "answer",
      queryKey: SEEDED,
    });

    expect(result).toBe("signed-out");
    expect(client.getQueryData(SEEDED)).toBe("before");
    expect(seeded.reads).toBe(1);
    expect(other.reads).toBe(1);
  });

  it("invalidates nothing else when the User signs out while the query is read again", async () => {
    let releaseRead = () => undefined as unknown;
    let value = "before";
    const { client, other } = await setUp(() =>
      value === "held"
        ? new Promise<string>((resolve) => {
            releaseRead = () => resolve("held");
          })
        : Promise.resolve(value)
    );
    const starter = rememberWriteStarter(client, [SEEDED]);
    value = "newer";
    await client.refetchQueries({ queryKey: SEEDED });
    value = "held";

    const seeding = seedWriteAnswer(client, starter, {
      alsoInvalidate: [{ queryKey: OTHER }],
      answer: "older answer",
      queryKey: SEEDED,
    });
    await flush();
    // Signed out while the query is read again, and another User signs in.
    signInAs("user_next");
    releaseRead();

    await expect(seeding).resolves.toBe("signed-out");
    expect(other.reads).toBe(1);
  });
});
