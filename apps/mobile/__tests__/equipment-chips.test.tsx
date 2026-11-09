/**
 * The Equipment chips on the Library tab (FIT-605): each chosen Equipment
 * shows as a chip in the one chip row, after the Muscle group chips, so the
 * User always sees what the list is narrowed to. A chip's × removes that
 * Equipment at once, and "Show All Exercises" clears the search, every Muscle
 * group and every Equipment. The real Library screen and both sheets on the
 * fake Library, each sheet mounted over the tab once pushed
 * (`test-utils/router-stub.tsx`); the SwiftUI-backed primitives are swapped
 * for plain stand-ins.
 */
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";

import LibraryScreen from "~/app/(tabs)/library/index";
import EquipmentSheet from "~/app/equipment";
import MusclesSheet from "~/app/muscles";
import { getEquipmentChoice } from "~/hooks/equipment-choice";
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
import { PushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

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
        <PushedRoutes
          screens={{ "/equipment": EquipmentSheet, "/muscles": MusclesSheet }}
        />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

const openSheet = async (pill: string) => {
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

const removeChip = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
  await settle(client);
};

const shownExercises = () =>
  ["Bench Press", "Dumbbell Curl", "Goblet Squat", "Pull Up"].filter(
    (name) => screen.queryByText(name) !== null
  );

/** What VoiceOver reads for each chip, in the row's own order. */
const chipLabels = () =>
  within(screen.getByTestId("choice-chips"))
    .getAllByRole("button")
    .map((chip) => chip.props.accessibilityLabel);

beforeEach(() => {
  storage.clearAll();
  resetStubRouter();
  fake = serveLibrary([
    libraryExercise("bench-press", {
      equipment: ["barbell", "bench"],
      muscle_groups: ["chest", "triceps"],
    }),
    libraryExercise("dumbbell-curl", {
      equipment: ["dumbbell"],
      muscle_groups: ["biceps"],
    }),
    libraryExercise("goblet-squat", {
      equipment: ["dumbbell"],
      muscle_groups: ["quadriceps"],
    }),
    libraryExercise("pull-up", {
      equipment: ["pull_up_bar", "bodyweight"],
      muscle_groups: ["back"],
    }),
  ]);
  list = jest.spyOn(fake, "list");
});

describe("the Equipment chips on the Library tab", () => {
  it("has no chip row until something is chosen", async () => {
    await renderLibrary();

    // Both pills are there, and neither has narrowed anything yet.
    expect(screen.getByRole("button", { name: "Muscles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Equipment" })).toBeTruthy();
    expect(screen.queryByTestId("choice-chips")).toBeNull();
  });

  it("shows a chip per chosen Equipment, after the Muscle group chips", async () => {
    await renderLibrary();

    await openSheet("Muscles");
    await tick("Quadriceps");
    await tick("Chest");
    await confirm();

    await openSheet("Equipment");
    await tick("Dumbbell");
    await tick("Barbell");
    await confirm();

    // Muscle groups first, then Equipment, each list in core's order rather
    // than the order they were ticked in.
    expect(chipLabels()).toEqual([
      "Remove Chest",
      "Remove Quadriceps",
      "Remove Barbell",
      "Remove Dumbbell",
    ]);
    // One row, so the two choices' chips wrap together.
    expect(screen.getByTestId("choice-chips").props.className).toContain(
      "flex-wrap"
    );
  });

  it("removes an Equipment from its chip at once, and the last chip leaves no row", async () => {
    await renderLibrary();

    await openSheet("Muscles");
    await tick("Chest");
    await confirm();

    await openSheet("Equipment");
    await tick("Dumbbell");
    await tick("Barbell");
    await confirm();
    expect(chipLabels()).toEqual([
      "Remove Chest",
      "Remove Barbell",
      "Remove Dumbbell",
    ]);

    // No sheet: the × narrows the list on its own.
    await removeChip("Remove Dumbbell");

    expect(getEquipmentChoice("library")).toEqual(["barbell"]);
    expect(list).toHaveBeenLastCalledWith({
      equipment: ["barbell"],
      limit: 20,
      muscleGroups: ["chest"],
      offset: 0,
    });
    expect(shownExercises()).toEqual(["Bench Press"]);
    expect(chipLabels()).toEqual(["Remove Chest", "Remove Barbell"]);

    await removeChip("Remove Barbell");

    // The Muscle group choice alone was read before, so this needs no request.
    expect(getEquipmentChoice("library")).toEqual([]);
    expect(chipLabels()).toEqual(["Remove Chest"]);

    // The Muscle group chips still go the same way, and the row goes with the
    // last chip of either choice.
    await removeChip("Remove Chest");

    expect(getMuscleChoice("library")).toEqual([]);
    expect(screen.queryByTestId("choice-chips")).toBeNull();
    expect(shownExercises()).toEqual([
      "Bench Press",
      "Dumbbell Curl",
      "Goblet Squat",
      "Pull Up",
    ]);
  });

  it("clears the search, every Muscle group and every Equipment on Show All", async () => {
    await renderLibrary();

    await openSheet("Muscles");
    await tick("Chest");
    await confirm();

    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();

    await fireEvent.changeText(
      screen.getByLabelText("Search exercises"),
      "press"
    );

    // No Exercise works the chest with a dumbbell, so the empty state offers
    // Show All Exercises.
    await until(() => screen.queryByText("No Exercises Found") !== null);

    await fireEvent.press(screen.getByText("Show All Exercises"));
    // The cleared search goes out after the debounce.
    await until(() => screen.queryByText("No Exercises Found") === null);
    await settle(client);

    expect(getMuscleChoice("library")).toEqual([]);
    expect(getEquipmentChoice("library")).toEqual([]);
    expect(screen.getByLabelText("Search exercises").props.value).toBe("");
    expect(screen.queryByTestId("choice-chips")).toBeNull();
    expect(shownExercises()).toEqual([
      "Bench Press",
      "Dumbbell Curl",
      "Goblet Squat",
      "Pull Up",
    ]);
  });

  it("names each chip and its × in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderLibrary();

    await openSheet("М’язи");
    await tick("Груди");
    await confirm("Готово");

    await openSheet("Обладнання");
    await tick("Гантель");
    await confirm("Готово");

    expect(chipLabels()).toEqual(["Видалити Груди", "Видалити Гантель"]);
    expect(screen.getByText("Гантель")).toBeTruthy();

    await removeChip("Видалити Гантель");

    expect(getEquipmentChoice("library")).toEqual([]);
    expect(chipLabels()).toEqual(["Видалити Груди"]);
  });
});
