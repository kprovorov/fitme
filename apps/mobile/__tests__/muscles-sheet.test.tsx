/**
 * The Muscles pill and sheet on the Library tab (FIT-436): the pill opens the
 * Muscles sheet, its ticks are a draft that ✓ hands back to the Library tab
 * (Exercises working any chosen Muscle group), Reset clears without applying
 * and swiping the sheet away discards. The real Library screen and sheet on
 * the fake Library, the sheet mounted over the tab once pushed
 * (`test-utils/router-stub.tsx`, whose header renders the title, the left and
 * right items and the search bar); the SwiftUI-backed primitives are swapped
 * for plain stand-ins.
 */
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import LibraryScreen from "~/app/(tabs)/library/index";
import MusclesSheet from "~/app/muscles";
import { getMuscleChoice } from "~/hooks/muscle-choice";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import {
  PushedRoutes,
  pushedRoutes,
  resetStubRouter,
  stubRouter,
} from "~/test-utils/router-stub";

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );
  return {
    router: stub.stubRouter,
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => stub.useStubParams({}),
    useRouter: () => stub.stubRouter,
  };
});
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

let fake: FakeLibrary;
let list: jest.SpiedFunction<FakeLibrary["list"]>;
let client: QueryClient;

const renderLibrary = async () => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <LibraryScreen />
        <PushedRoutes screens={{ "/muscles": MusclesSheet }} />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

const sheetOpen = () =>
  pushedRoutes().some((route) => route.pathname === "/muscles");

const openSheet = async (pill = "Muscles") => {
  await fireEvent.press(screen.getByRole("button", { name: pill }));
  await settle(client);
};

const tick = async (name: string) => {
  await fireEvent.press(screen.getByRole("checkbox", { name }));
};

const confirm = async (label = "Done") => {
  await fireEvent.press(screen.getByLabelText(label));
  await settle(client);
};

const isChecked = (name: string) =>
  screen.getByRole("checkbox", { name }).props.accessibilityState?.checked;

beforeEach(() => {
  storage.clearAll();
  resetStubRouter();
  fake = serveLibrary([
    libraryExercise("bench-press", { muscle_groups: ["chest", "triceps"] }),
    libraryExercise("pull-up", { muscle_groups: ["back"] }),
    libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
  ]);
  list = jest.spyOn(fake, "list");
});

describe("the Muscles sheet over the Library tab", () => {
  it("opens from the Muscles pill, every choosable Muscle group unticked in core's order", async () => {
    await renderLibrary();

    await openSheet();

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { choice: "library" },
        pathname: "/muscles",
      }),
    ]);
    expect(screen.getByRole("header", { name: "Muscles" })).toBeTruthy();
    expect(screen.getByLabelText("Reset")).toBeTruthy();
    const names = screen
      .getAllByRole("checkbox")
      .map((row) => row.props.accessibilityLabel);
    expect(names).toEqual([
      "Chest",
      "Back",
      "Shoulders",
      "Biceps",
      "Triceps",
      "Forearms",
      "Abs",
      "Obliques",
      "Quadriceps",
      "Hamstrings",
      "Glutes",
      "Calves",
      "Traps",
      "Lats",
      "Lower Back",
    ]);
    expect(names.every((name) => isChecked(name) === false)).toBe(true);
  });

  it("lists the Exercises working any ticked Muscle group once confirmed", async () => {
    await renderLibrary();
    await openSheet();

    await tick("Quadriceps");
    await tick("Chest");
    expect(isChecked("Chest")).toBe(true);
    // Nothing is applied while the User is still choosing.
    expect(list).toHaveBeenCalledTimes(1);
    await confirm();

    expect(sheetOpen()).toBe(false);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      muscleGroups: ["chest", "quadriceps"],
      offset: 0,
    });
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Pull Up")).toBeNull();
    // The pill still just reads "Muscles".
    expect(screen.getByRole("button", { name: "Muscles" })).toBeTruthy();
  });

  it("opens on the confirmed choice, and Reset then ✓ shows every Exercise", async () => {
    await renderLibrary();
    await openSheet();
    await tick("Back");
    await confirm();
    expect(screen.queryByText("Squat")).toBeNull();

    await openSheet();
    expect(isChecked("Back")).toBe(true);
    await fireEvent.press(screen.getByLabelText("Reset"));
    expect(isChecked("Back")).toBe(false);
    // Reset alone applies nothing.
    expect(screen.queryByText("Squat")).toBeNull();
    await confirm();

    expect(getMuscleChoice("library")).toEqual([]);
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.getByText("Pull Up")).toBeTruthy();
  });

  it("keeps the previous choice when swiped away", async () => {
    await renderLibrary();
    await openSheet();
    await tick("Back");
    await confirm();

    await openSheet();
    await tick("Back");
    await tick("Quadriceps");
    // The User swipes the sheet down.
    await act(() => stubRouter.back());
    await settle(client);

    expect(getMuscleChoice("library")).toEqual(["back"]);
    expect(screen.getByText("Pull Up")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();

    await openSheet();
    expect(isChecked("Back")).toBe(true);
    expect(isChecked("Quadriceps")).toBe(false);
  });

  it("clears the search and every chosen Muscle group on Show All Exercises", async () => {
    await renderLibrary();
    await openSheet();
    await tick("Back");
    await confirm();
    await fireEvent.changeText(
      screen.getByLabelText("Search exercises"),
      "squat"
    );
    await until(() => screen.queryByText("No Exercises Found") !== null);

    await fireEvent.press(screen.getByText("Show All Exercises"));
    await until(() => screen.queryByText("No Exercises Found") === null);
    await settle(client);

    expect(getMuscleChoice("library")).toEqual([]);
    expect(screen.getByLabelText("Search exercises").props.value).toBe("");
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Pull Up")).toBeTruthy();
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("reads in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderLibrary();

    await openSheet("М’язи");

    expect(screen.getByRole("header", { name: "М’язи" })).toBeTruthy();
    expect(screen.getByLabelText("Скинути")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Груди" })).toBeTruthy();
    await tick("Спина");
    await confirm("Готово");

    expect(getMuscleChoice("library")).toEqual(["back"]);
  });
});
