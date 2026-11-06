/**
 * The pending weighed refresh (FIT-553): a measurement system switch whose
 * answer couldn't be checked is finished by the next Profile read that
 * lands. Driven at its own seam, on a bare query cache: the Screen test
 * (`__tests__/measurement-system-refresh.test.tsx`) covers it end to end,
 * and a sign-out is only observable here, where no Screen re-reads
 * everything the moment the cache is cleared.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";

import { useActivePlanQuery } from "~/hooks/queries/plans";
import type { Profile } from "~/hooks/queries/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { rememberWriteStarter } from "~/lib/write-answers";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { signInAs } from "~/test-utils/signed-in-user";

import { rememberPendingWeighedRefresh } from "../settings";

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

/** A Profile saved in `system`; only its measurement system is read. */
const profileIn = (system: string) =>
  ({ measurement_system: system }) as unknown as Profile;

let client = new QueryClient();

/**
 * Remembers a switch to pounds, as the measurement system Screen does once
 * the saved system can't be read back, and answers what it does next: the
 * Profile dropped and a weighed query showing a weight from before it.
 */
const rememberSwitchToPounds = () => {
  const starter = rememberWriteStarter(client, [useProfileQuery.getKey()]);
  rememberPendingWeighedRefresh(client, "us", starter);
};

/** A weighed query holding numbers from before the switch. */
const seedWeighedQuery = () => {
  client.setQueryData(useActivePlanQuery.getKey(), null);
};

/** Whether the weighed query has been marked for re-reading. */
const isWeighedQueryStale = () =>
  client.getQueryState(useActivePlanQuery.getKey())?.isInvalidated === true;

/** A Profile read landing in the cache. */
const profileRead = (system: string) => {
  client.setQueryData(useProfileQuery.getKey(), profileIn(system));
};

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  signInAs(FAKE_USER_ID);
});

describe("a switch whose answer couldn't be checked", () => {
  it("re-reads the weighed queries once a Profile read shows the new system", () => {
    profileRead("metric");
    seedWeighedQuery();
    rememberSwitchToPounds();

    profileRead("us");

    expect(isWeighedQueryStale()).toBe(true);
  });

  it("re-reads nothing once a Profile read shows the old system", () => {
    profileRead("metric");
    seedWeighedQuery();
    rememberSwitchToPounds();

    profileRead("metric");

    expect(isWeighedQueryStale()).toBe(false);
  });

  it("is forgotten by a sign-out, even when the same User signs back in", () => {
    profileRead("metric");
    seedWeighedQuery();
    rememberSwitchToPounds();

    // Signing out clears the cache; signing back in reads the Profile again,
    // which by then says pounds. Nothing cached predates the switch any more,
    // so that read is no reason to re-read anything.
    client.clear();
    seedWeighedQuery();
    profileRead("us");

    expect(isWeighedQueryStale()).toBe(false);
  });

  it("is replaced by a later unchecked switch, not added to", () => {
    profileRead("us");
    seedWeighedQuery();
    rememberSwitchToPounds();
    // A second unchecked switch, back to metric: the system that counts is
    // this one's. Were the first still pending, a metric read would say its
    // switch didn't land and re-read nothing.
    const starter = rememberWriteStarter(client, [useProfileQuery.getKey()]);
    rememberPendingWeighedRefresh(client, "metric", starter);

    profileRead("metric");

    expect(isWeighedQueryStale()).toBe(true);
  });

  it("is consumed by the first Profile read, whichever system it shows", () => {
    profileRead("metric");
    seedWeighedQuery();
    rememberSwitchToPounds();

    // The switch didn't land, so this read finishes it. A later read showing
    // pounds is then a switch of its own, not this one landing late.
    profileRead("metric");
    expect(isWeighedQueryStale()).toBe(false);

    profileRead("us");

    expect(isWeighedQueryStale()).toBe(false);
  });
});
