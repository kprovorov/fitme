import { describe, expect, it } from "vitest";

import {
  IdentityMapError,
  mergeIdentities,
  POSTHOG_CAPTURE_URL,
  postHogMerge,
  runRefusal,
} from "../merge-identities.js";
import type { IdentityPair } from "../merge-identities.js";

const A = {
  oldId: "0b5e1c1e-0000-4000-8000-00000000000a",
  userId: "user_alice",
};

const B = {
  oldId: "0b5e1c1e-0000-4000-8000-00000000000b",
  userId: "user_bob",
};

const C = {
  oldId: "0b5e1c1e-0000-4000-8000-00000000000c",
  userId: "user_carol",
};

/** A run over these pairs, recording every merge sent and every line. */
const harness = (pairs: IdentityPair[], failFor: readonly string[] = []) => {
  const sent: IdentityPair[] = [];
  const lines: string[] = [];

  return {
    lines,
    options: {
      log: (line: string) => {
        lines.push(line);
      },
      readPairs: () => Promise.resolve(pairs),
      sendMerge: (pair: IdentityPair) => {
        sent.push(pair);

        return failFor.includes(pair.oldId)
          ? Promise.reject(new Error("PostHog answered 503"))
          : Promise.resolve();
      },
    },
    sent,
  };
};

describe(mergeIdentities, () => {
  it("prints the pairs and their count on a dry run and sends nothing", async () => {
    const { lines, options, sent } = harness([A, B]);

    const report = await mergeIdentities({ ...options, dryRun: true });

    expect(sent).toStrictEqual([]);
    expect(report).toStrictEqual({ failed: [], pairs: [A, B], sent: 0 });
    expect(lines).toStrictEqual([
      `would merge ${A.oldId} -> user_alice`,
      `would merge ${B.oldId} -> user_bob`,
      "2 pairs to merge (dry run, nothing sent)",
    ]);
  });

  it("sends one merge per pair", async () => {
    const { lines, options, sent } = harness([A, B, C]);

    const report = await mergeIdentities(options);

    expect(sent).toStrictEqual([A, B, C]);
    expect(report.sent).toBe(3);
    expect(report.failed).toStrictEqual([]);
    expect(lines.at(-1)).toBe("3 merged, 0 failed, of 3 pairs");
  });

  it("sends only the named old ids, in the order named", async () => {
    const { options, sent } = harness([A, B, C]);

    await mergeIdentities({ ...options, only: [C.oldId, A.oldId, C.oldId] });

    expect(sent).toStrictEqual([C, A]);
  });

  it("refuses a named old id the map hasn't got, sending nothing", async () => {
    const { options, sent } = harness([A, B]);

    await expect(
      mergeIdentities({ ...options, only: [A.oldId, "not-in-the-map"] })
    ).rejects.toThrow(IdentityMapError);
    expect(sent).toStrictEqual([]);
  });

  it("stops before sending anything when a User id appears twice", async () => {
    const { options, sent } = harness([A, { ...B, userId: A.userId }, C]);

    await expect(mergeIdentities(options)).rejects.toThrow(
      /User id user_alice appears 2 times/u
    );
    expect(sent).toStrictEqual([]);
  });

  it("stops before sending anything when an old id appears twice", async () => {
    const { options, sent } = harness([A, { ...C, oldId: A.oldId }]);

    const run = mergeIdentities({ ...options, only: [B.oldId] });

    await expect(run).rejects.toThrow(IdentityMapError);
    await expect(run).rejects.toThrow(`old id ${A.oldId} appears 2 times`);
    expect(sent).toStrictEqual([]);
  });

  it("reports a failed send with its pair and carries on", async () => {
    const { lines, options, sent } = harness([A, B, C], [B.oldId]);

    const report = await mergeIdentities(options);

    expect(sent).toStrictEqual([A, B, C]);
    expect(report.failed).toStrictEqual([B]);
    expect(report.sent).toBe(2);
    expect(lines).toContain(
      `failed ${B.oldId} -> user_bob: PostHog answered 503`
    );
    expect(lines.at(-1)).toBe("2 merged, 1 failed, of 3 pairs");
  });
});

describe(postHogMerge, () => {
  const recordingFetch = (status: number) => {
    const calls: { body: unknown; init: RequestInit; url: string }[] = [];

    const send = (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        body: JSON.parse(typeof init?.body === "string" ? init.body : "null"),
        init: init ?? {},
        url: url instanceof Request ? url.url : url.toString(),
      });

      return Promise.resolve(new Response(null, { status }));
    };

    return { calls, send };
  };

  it("sends $merge_dangerously as the User id with the old id as its alias", async () => {
    const { calls, send } = recordingFetch(200);

    await postHogMerge({ apiKey: "phc_test", fetch: send })(A);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(POSTHOG_CAPTURE_URL);
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.body).toStrictEqual({
      api_key: "phc_test",
      distinct_id: "user_alice",
      event: "$merge_dangerously",
      properties: { alias: A.oldId },
    });
  });

  it("rejects on an answer that isn't 2xx", async () => {
    const { send } = recordingFetch(400);

    await expect(
      postHogMerge({ apiKey: "phc_test", fetch: send })(A)
    ).rejects.toThrow("PostHog answered 400");
  });
});

describe(runRefusal, () => {
  it("refuses without the PostHog key", () => {
    expect(
      runRefusal({
        apiKey: undefined,
        notProduction: true,
        vercelEnv: "production",
      })
    ).toMatch(/POSTHOG_PROJECT_API_KEY/u);
    expect(
      runRefusal({ apiKey: "", notProduction: false, vercelEnv: "production" })
    ).toMatch(/POSTHOG_PROJECT_API_KEY/u);
  });

  it("refuses outside production unless told to", () => {
    expect(
      runRefusal({
        apiKey: "phc_test",
        notProduction: false,
        vercelEnv: undefined,
      })
    ).toMatch(/--not-production/u);
    expect(
      runRefusal({
        apiKey: "phc_test",
        notProduction: false,
        vercelEnv: "preview",
      })
    ).toMatch(/--not-production/u);
    expect(
      runRefusal({ apiKey: "phc_test", notProduction: true, vercelEnv: "" })
    ).toBeNull();
  });

  it("runs on production data with the key", () => {
    expect(
      runRefusal({
        apiKey: "phc_test",
        notProduction: false,
        vercelEnv: "production",
      })
    ).toBeNull();
  });
});
