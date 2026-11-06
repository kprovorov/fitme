import { setDeviceConventions } from "@fitme/i18n";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { i18n } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import {
  setDevice24HourClock,
  setDeviceLanguages,
} from "~/test-utils/device-locales";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

import ExerciseHistoryView from "../exercise-history-view";

// A row's set number cell, and a session's date.
const SET_NUMBER = /^#\d$/;

// A date shows its year once it is not this one. An American device puts the
// month first.
const SESSION_DATE = /^October \d+(, \d{4})?$/;

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

let queryClient: QueryClient;

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await settle(queryClient);
};

/**
 * A past Workout Session of one Shoulder Press, its sets' logged reps given
 * and every one of them at 45 kg with the same target, unless `weights` says
 * otherwise.
 */
const seedSession = (
  id: string,
  startedAt: string,
  sets: { reps: number; weight?: number | null }[]
) => {
  backend.seed({
    exercises: [{ name: "Shoulder Press", sets: sets.map(({ reps }) => reps) }],
    finished: true,
    id,
    startedAt,
  });
  sets.forEach(({ weight = 45 }, index) => {
    const set = backend.sets.find(
      (candidate) => candidate.id === `${id}-e1-s${index + 1}`
    );

    Object.assign(set ?? {}, {
      reps_recommended: 12,
      weight_completed: weight,
      weight_recommended: 45,
    });
  });
};

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  backend.seedProfile(FAKE_USER_ID);
});

// The language sync leaves the App language and region where a test put them.
afterEach(async () => {
  await i18n.changeLanguage("en");
  setDeviceConventions(i18n, { region: "US", uses24hourClock: false });
});

describe("ExerciseHistoryView", () => {
  it("shows each past session as a table of its sets under Progress", async () => {
    seedSession("e1", "2026-10-21T10:00:00.000Z", [
      { reps: 12 },
      { reps: 10, weight: 50 },
    ]);
    await mount(<ExerciseHistoryView exerciseSlug="shoulder-press" />);

    expect(screen.getByRole("heading", { name: "Progress" })).toBeTruthy();
    expect(screen.queryByText("History")).toBeNull();
    expect(screen.getByText(SESSION_DATE)).toBeTruthy();

    for (const header of ["#", "target", "reps", "kg"]) {
      // VoiceOver skips the header: each row reads as one sentence.
      expect(
        screen.getByText(header, { includeHiddenElements: true })
      ).toBeTruthy();
    }

    // Rows in set order: number, target, then what was logged.
    expect(
      screen.getAllByText(SET_NUMBER).map((cell) => cell.props.children)
    ).toEqual(["#1", "#2"]);
    expect(screen.getAllByText("12×45kg")).toHaveLength(2);
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    expect(
      screen.getByLabelText("Set 2: 10 reps, 50 kg. Target 12×45kg")
    ).toBeTruthy();
  });

  it("names the year of a session from an earlier year", async () => {
    seedSession("old", "2020-03-02T10:00:00.000Z", [{ reps: 12 }]);
    await mount(<ExerciseHistoryView exerciseSlug="shoulder-press" />);

    expect(screen.getByText("March 2, 2020")).toBeTruthy();
  });

  it("writes the date in the App language and the device region's order", async () => {
    seedSession("old", "2020-03-02T10:00:00.000Z", [{ reps: 12 }]);
    setDeviceLanguages(["uk-UA"]);
    await mount(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );

    expect(screen.getByText("2 березня 2020 р.")).toBeTruthy();
  });

  it("writes the table and its rows in Ukrainian", async () => {
    seedSession("old", "2020-03-02T10:00:00.000Z", [
      { reps: 12 },
      { reps: 10, weight: 50 },
      { reps: 12 },
      { reps: 12 },
    ]);
    seedSession("e2", "2020-03-01T10:00:00.000Z", [{ reps: 12 }]);
    setDeviceLanguages(["uk-UA"]);
    await mount(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );

    expect(screen.getByRole("heading", { name: "Прогрес" })).toBeTruthy();
    expect(screen.getByText("2 березня 2020 р.")).toBeTruthy();

    for (const header of ["ціль", "повтори", "кг"]) {
      expect(
        screen.getAllByText(header, { includeHiddenElements: true }).length
      ).toBeGreaterThan(0);
    }

    expect(screen.getAllByText("12×45кг").length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText("Підхід 2: 10 повторень, 50 кг. Ціль 12×45кг")
    ).toBeTruthy();
  });

  it("switches the date when the device's language changes", async () => {
    seedSession("old", "2020-03-02T10:00:00.000Z", [{ reps: 12 }]);
    await mount(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );
    expect(screen.getByText("March 2, 2020")).toBeTruthy();

    await act(() => {
      setDeviceLanguages(["uk-UA"]);
    });
    expect(screen.getByText("2 березня 2020 р.")).toBeTruthy();

    // Only the region changes: the words stay English, the order is British.
    await act(() => {
      setDeviceLanguages(["en-GB"]);
    });
    expect(screen.getByText("2 March 2020")).toBeTruthy();
    // A clock change re-renders too, with nothing else changed.
    await act(() => {
      setDevice24HourClock(true);
    });
    expect(screen.getByText("2 March 2020")).toBeTruthy();
  });

  it("writes an English date day first on a British device", async () => {
    seedSession("old", "2020-03-02T10:00:00.000Z", [{ reps: 12 }]);
    setDeviceLanguages(["en-GB"]);
    await mount(
      <InAppLanguage>
        <ExerciseHistoryView exerciseSlug="shoulder-press" />
      </InAppLanguage>
    );

    expect(screen.getByText("2 March 2020")).toBeTruthy();
  });

  it("shows nothing when the session being logged is the only entry", async () => {
    seedSession("current", "2026-10-27T10:00:00.000Z", [{ reps: 12 }]);
    await mount(
      <ExerciseHistoryView
        excludeId="current-e1"
        exerciseSlug="shoulder-press"
      />
    );

    expect(screen.queryByText("Progress")).toBeNull();
  });

  it("leaves out a session with no logged set, which the API never answers", async () => {
    backend.seed({
      exercises: [{ name: "Shoulder Press", sets: [null] }],
      finished: true,
      id: "skipped",
      startedAt: "2026-10-25T10:00:00.000Z",
    });
    await mount(<ExerciseHistoryView exerciseSlug="shoulder-press" />);

    expect(screen.queryByText("Progress")).toBeNull();
  });
});
