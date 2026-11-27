/**
 * The User's note on the Library's Exercise detail screen (FIT-835, Figma's
 * B1–B4 frames, FIT-820): read, written, changed and cleared through the
 * fake Public API's note routes, whose rows each save is checked against, in
 * English and Ukrainian. Behind the notes flag, which asks for nothing when
 * off.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Alert } from "react-native";

import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import { setNotesEnabled } from "~/lib/feature-flags";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { sentAnalytics } from "~/test-utils/fake-analytics";
import {
  EXERCISES_UNAVAILABLE,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";
import { signInAs } from "~/test-utils/signed-in-user";

const params: { current: Record<string, string> } = { current: {} };

/** The screen's leave guard, as `usePreventRemove` last got it. */
const leaveGuard: {
  enabled: boolean;
  onLeave: ((event: { repeat: () => void }) => void) | null;
} = { enabled: false, onLeave: null };

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => params.current,
    usePreventRemove: (
      enabled: boolean,
      onLeave: (event: { repeat: () => void }) => void
    ) => {
      leaveGuard.enabled = enabled;
      leaveGuard.onLeave = onLeave;
    },
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/exercises/exercise-video", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

const NOTES = "GET /v1/exercise-notes";
const SAVE = "PUT /v1/exercise-notes/{slug}";

const BENCH_PRESS = fakeExercise("dumbbell-bench-press", {
  name: "Dumbbell Bench Press",
  translations: { uk: { name: "Жим гантелей лежачи" } },
});

const SETUP = "Flat bench, feet planted.\nElbows at 45°.";

const alertButtons = () =>
  jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];

/** Presses the last alert's button with this text, as the User would. */
const answerAlert = (text: string) => {
  const button = alertButtons().find((candidate) => candidate.text === text);

  if (!button) {
    throw new Error(`No alert button "${text}"`);
  }

  button.onPress?.();
};

const renderDetail = async (exerciseSlug = "dumbbell-bench-press") => {
  params.current = { exerciseSlug };
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <ExerciseScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);

  return client;
};

const field = () => screen.getByTestId("exercise-note-field");

const saveButton = () => screen.getByTestId("exercise-note-save");

const typeNote = async (text: string) => {
  await fireEvent.changeText(field(), text);
};

const pressSave = async (client: ReturnType<typeof createTestQueryClient>) => {
  await fireEvent.press(saveButton());
  await settle(client);
};

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  setNotesEnabled(true);
  leaveGuard.enabled = false;
  leaveGuard.onLeave = null;
  serveExercises([BENCH_PRESS], {
    replacedSlugs: { "flat-dumbbell-press": "dumbbell-bench-press" },
  });
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  jest.mocked(Alert.alert).mockClear();
  jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockReturnValue(undefined);
  jest.mocked(AccessibilityInfo.announceForAccessibility).mockClear();
});

describe("the notes flag", () => {
  it("off, shows no note and asks for none", async () => {
    setNotesEnabled(false);
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    await renderDetail();

    expect(screen.getByText("Dumbbell Bench Press")).toBeTruthy();
    expect(screen.queryByTestId("exercise-note")).toBeNull();
    expect(fakePublicApi.count(NOTES)).toBe(0);
  });
});

describe("the Exercise note on the detail screen", () => {
  it("offers Add Note without a note, and writes one", async () => {
    const client = await renderDetail();

    expect(screen.getByText("Note")).toBeTruthy();

    const add = screen.getByRole("button", {
      name: "Add note for Dumbbell Bench Press",
    });

    await fireEvent.press(add);

    expect(field().props.accessibilityLabel).toBe(
      "Note for Dumbbell Bench Press"
    );
    expect(field().props.placeholder).toBe("Setup, cues, anything to remember");
    expect(screen.getByTestId("exercise-note-counter")).toHaveTextContent(
      "0/500"
    );
    // Nothing changed yet.
    expect(saveButton()).toBeDisabled();

    await typeNote(`  ${SETUP}  `);
    expect(saveButton()).not.toBeDisabled();
    await pressSave(client);

    // Trimmed, line breaks kept.
    expect(backend.exerciseNote("dumbbell-bench-press")).toBe(SETUP);
    expect(screen.queryByTestId("exercise-note-field")).toBeNull();
    expect(screen.getByText(SETUP)).toBeTruthy();
    expect(
      screen.getByTestId("exercise-note-text").props.accessibilityLabel
    ).toBe(`Note for Dumbbell Bench Press: ${SETUP}`);
    // Shown from the answer, with no second read.
    expect(fakePublicApi.count(NOTES)).toBe(1);
    expect(sentAnalytics.events()).toEqual([
      { name: "Note Saved", properties: { target: "exercise" } },
    ]);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Note saved"
    );
  });

  it("shows a saved note, edits it and clears it with blank text", async () => {
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    const client = await renderDetail();

    expect(screen.getByText(SETUP)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Edit note for Dumbbell Bench Press" })
    );
    expect(field().props.value).toBe(SETUP);

    await typeNote("Seat on 4");
    await pressSave(client);
    expect(backend.exerciseNote("dumbbell-bench-press")).toBe("Seat on 4");
    expect(screen.getByText("Seat on 4")).toBeTruthy();

    // Tapping the text opens it too.
    await fireEvent.press(screen.getByTestId("exercise-note-text"));
    await typeNote("   ");
    // Blank differs from the note, so it can be saved: it clears it.
    expect(saveButton()).not.toBeDisabled();
    await pressSave(client);

    expect(backend.exerciseNote("dumbbell-bench-press")).toBeUndefined();
    expect(
      screen.getByRole("button", { name: "Add note for Dumbbell Bench Press" })
    ).toBeTruthy();
    expect(sentAnalytics.events()).toEqual([
      { name: "Note Saved", properties: { target: "exercise" } },
      { name: "Note Cleared", properties: { target: "exercise" } },
    ]);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      "Note cleared"
    );
  });

  it("keeps Save off for blank text when there's no note", async () => {
    await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote(" \n ");

    expect(saveButton()).toBeDisabled();
  });

  it("reads the note on an old slug's replacement and saves it there", async () => {
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    const client = await renderDetail("flat-dumbbell-press");

    expect(screen.getByText(SETUP)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("exercise-note-edit"));
    await typeNote("New");
    await pressSave(client);

    expect(backend.exerciseNote("dumbbell-bench-press")).toBe("New");
    expect(backend.exerciseNote("flat-dumbbell-press")).toBeUndefined();
  });

  it("stops at the 500 character limit and says so", async () => {
    await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    // Counted as code points, as Postgres counts them: 💪 is one.
    await typeNote(`${"💪".repeat(499)}ab`);

    expect(field().props.value).toBe(`${"💪".repeat(499)}a`);
    const counter = screen.getByTestId("exercise-note-counter");
    expect(counter).toHaveTextContent("500/500 · Character limit reached");
    expect(counter.props.accessibilityLabel).toBe(
      "Character limit reached. 500 of 500."
    );
  });

  it("keeps the text with the error when a save fails", async () => {
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    const client = await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-edit"));
    await typeNote("Changed");
    fakePublicApi.failNext(SAVE, { status: 500 });
    await pressSave(client);

    expect(field().props.value).toBe("Changed");
    expect(
      screen.getByText("Couldn't save your note. Try again.")
    ).toBeTruthy();
    expect(backend.exerciseNote("dumbbell-bench-press")).toBe(SETUP);
    expect(sentAnalytics.events()).toEqual([]);

    // Trying again saves it.
    await pressSave(client);
    expect(backend.exerciseNote("dumbbell-bench-press")).toBe("Changed");
  });

  it("says an Exercise the Library can't check can't be saved now", async () => {
    const client = await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote("Seat on 4");
    failExercises(EXERCISES_UNAVAILABLE);
    await pressSave(client);

    expect(
      screen.getByText(
        "Couldn't check this exercise right now. Try again in a moment."
      )
    ).toBeTruthy();
    expect(field().props.value).toBe("Seat on 4");
  });

  it("shows a 429's wait and holds Save until it has passed", async () => {
    const client = await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote("Seat on 4");
    fakePublicApi.failNext(SAVE, { retryAfterSeconds: 12, status: 429 });
    await pressSave(client);

    expect(screen.getByText("Too many saves. Try again in 12 s.")).toBeTruthy();
    expect(
      screen.getByTestId("exercise-note-rate-limited").props.accessibilityLabel
    ).toBe("Too many saves. Try again in 12 seconds.");
    expect(saveButton()).toBeDisabled();
    expect(field().props.value).toBe("Seat on 4");
  });

  it("lets Save go again once a 429's wait has passed", async () => {
    const client = await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote("Seat on 4");
    fakePublicApi.failNext(SAVE, { retryAfterSeconds: 1, status: 429 });
    await pressSave(client);
    expect(saveButton()).toBeDisabled();

    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 1100);
        })
    );

    expect(saveButton()).not.toBeDisabled();
    expect(screen.queryByTestId("exercise-note-rate-limited")).toBeNull();
  });

  it("asks before Cancel throws away unsaved text", async () => {
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-edit"));
    await typeNote("Half written");
    await fireEvent.press(screen.getByTestId("exercise-note-cancel"));

    expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.slice(0, 2)).toEqual([
      "Discard your note?",
      "What you've written here won't be saved.",
    ]);
    await answerAlertAsync("Keep Editing");
    expect(field().props.value).toBe("Half written");

    await fireEvent.press(screen.getByTestId("exercise-note-cancel"));
    await answerAlertAsync("Discard");
    expect(screen.queryByTestId("exercise-note-field")).toBeNull();
    expect(screen.getByText(SETUP)).toBeTruthy();
    expect(backend.exerciseNote("dumbbell-bench-press")).toBe(SETUP);
  });

  it("asks before leaving the screen with unsaved text", async () => {
    await renderDetail();
    expect(leaveGuard.enabled).toBe(false);

    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    // An editor with nothing typed lets the User go.
    expect(leaveGuard.enabled).toBe(false);
    await typeNote("Half written");
    expect(leaveGuard.enabled).toBe(true);

    const repeat = jest.fn();
    leaveGuard.onLeave?.({ repeat });
    expect(jest.mocked(Alert.alert).mock.calls.at(-1)?.[0]).toBe(
      "Discard your note?"
    );
    answerAlert("Discard");
    expect(repeat).toHaveBeenCalled();
  });

  it("shows a failed read with Try Again and no editor", async () => {
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    fakePublicApi.failNext(NOTES, { status: 500 });
    const client = await renderDetail();

    // The rest of the screen works.
    expect(screen.getByText("Dumbbell Bench Press")).toBeTruthy();
    expect(screen.getByText("Couldn't load your note.")).toBeTruthy();
    expect(screen.queryByTestId("exercise-note-add")).toBeNull();
    expect(screen.queryByTestId("exercise-note-edit")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    await settle(client);
    expect(screen.getByText(SETUP)).toBeTruthy();
  });

  it("says how long to wait when the read is rate limited", async () => {
    fakePublicApi.failNext(NOTES, { retryAfterSeconds: 20, status: 429 });
    await renderDetail();

    expect(
      screen.getByText("Too many requests: please try again in 20 s.")
    ).toBeTruthy();
  });

  it("keeps the note read when a refresh fails", async () => {
    backend.seedExerciseNote("dumbbell-bench-press", SETUP);
    const client = await renderDetail();
    fakePublicApi.failNext(NOTES, "network");
    await client.refetchQueries({ queryKey: ["exercise-notes"] });
    await settle(client);

    expect(screen.getByText(SETUP)).toBeTruthy();
    expect(screen.queryByText("Couldn't load your note.")).toBeNull();
  });

  it("shows, re-reads and sends nothing for an answer after another User signed in", async () => {
    const client = await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote("Seat on 4");
    const resume = fakePublicApi.pause(SAVE);
    await fireEvent.press(saveButton());
    await until(() => fakePublicApi.count(SAVE) === 1);

    signInAs("user_someone_else");
    const reads = fakePublicApi.count(NOTES);
    resume();
    await settle(client);

    expect(fakePublicApi.count(NOTES)).toBe(reads);
    expect(client.getQueryData(["exercise-notes"])).toEqual([]);
    expect(sentAnalytics.events()).toEqual([]);
  });

  it("reads the list again rather than show an answer when a newer read landed", async () => {
    const client = await renderDetail();
    await fireEvent.press(screen.getByTestId("exercise-note-add"));
    await typeNote("Seat on 4");
    const resume = fakePublicApi.pause(SAVE);
    await fireEvent.press(saveButton());
    await until(() => fakePublicApi.count(SAVE) === 1);

    // Another device saved a note meanwhile, and a read brought it in.
    backend.seedExerciseNote("dumbbell-bench-press", "From the other phone");
    await client.refetchQueries({ queryKey: ["exercise-notes"] });
    const reads = fakePublicApi.count(NOTES);
    resume();
    await settle(client);

    // The save (the last one) won, and the list was read again to show it.
    expect(fakePublicApi.count(NOTES)).toBe(reads + 1);
    expect(backend.exerciseNote("dumbbell-bench-press")).toBe("Seat on 4");
    expect(screen.getByText("Seat on 4")).toBeTruthy();
  });

  it("writes, saves and reads the note in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    const client = await renderDetail();

    expect(screen.getByText("Нотатка")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Додати нотатку до вправи Жим гантелей лежачи",
      })
    );
    await typeNote("Сидіння на 4");
    expect(saveButton()).toHaveTextContent("Зберегти");
    await pressSave(client);

    expect(backend.exerciseNote("dumbbell-bench-press")).toBe("Сидіння на 4");
    expect(screen.getByText("Сидіння на 4")).toBeTruthy();
  });

  it("names the Ukrainian load error", async () => {
    setDeviceLanguages(["uk-UA"]);
    fakePublicApi.failNext(NOTES, { status: 500 });
    await renderDetail();

    expect(screen.getByText("Не вдалося завантажити нотатку.")).toBeTruthy();
  });
});

/** `answerAlert`, letting what it starts render. */
const answerAlertAsync = async (text: string) => {
  await act(() => {
    answerAlert(text);
  });
};
