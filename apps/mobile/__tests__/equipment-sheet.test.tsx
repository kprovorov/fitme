/**
 * The Equipment pill and sheet on the Library tab (FIT-604): the pill, after
 * the Muscles pill, always reads "Equipment" and opens the shared choice
 * sheet over the new Library's Equipment (core's `equipment`, FIT-757). Its ticks are a draft that ✓ hands back to the
 * Library tab (Exercises needing any chosen Equipment, together with the
 * Muscle group choice), Reset clears without applying and swiping the sheet
 * away discards. The real Library screen and both sheets on the fake Public API's Exercise routes,
 * each sheet mounted over the tab once pushed
 * (`test-utils/router-stub.tsx`); the SwiftUI-backed primitives are swapped
 * for plain stand-ins.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import LibraryScreen from "~/app/(tabs)/library/index";
import EquipmentSheet from "~/app/equipment";
import MusclesSheet from "~/app/muscles";
import { getEquipmentChoice } from "~/hooks/equipment-choice";
import { getMuscleChoice } from "~/hooks/muscle-choice";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
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

let client: QueryClient;

const LIST_ROUTE = "GET /v1/exercises";

/** The query of every page of the Library asked for, in order (lookups aside). */
const listQueries = () =>
  fakePublicApi.requests
    .filter(
      (request) =>
        request.route === LIST_ROUTE && request.query.slugs === undefined
    )
    .map((request) => request.query);

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

const sheetOpen = (pathname: string) =>
  pushedRoutes().some((route) => route.pathname === pathname);

const tick = async (name: string) => {
  await fireEvent.press(screen.getByRole("checkbox", { name }));
};

const confirm = async (label = "Done") => {
  await fireEvent.press(screen.getByLabelText(label));
  await settle(client);
};

const isChecked = (name: string) =>
  screen.getByRole("checkbox", { name }).props.accessibilityState?.checked;

const shownExercises = () =>
  [
    "Bench Press",
    "Dumbbell Curl",
    "Goblet Squat",
    "Hanging Bar Hold",
    "Kettlebell Swing",
    "Push Up",
    "Pull Up",
  ].filter((name) => screen.queryByText(name) !== null);

beforeEach(() => {
  storage.clearAll();
  resetStubRouter();
  serveExercises([
    fakeExercise("bench-press", {
      name: "Bench Press",
      equipment: ["barbell", "bench"],
      muscle_groups: ["chest", "triceps"],
    }),
    fakeExercise("dumbbell-curl", {
      name: "Dumbbell Curl",
      equipment: ["dumbbell"],
      muscle_groups: ["biceps"],
    }),
    fakeExercise("goblet-squat", {
      name: "Goblet Squat",
      equipment: ["dumbbell"],
      muscle_groups: ["quadriceps"],
    }),
    fakeExercise("hanging-bar-hold", {
      name: "Hanging Bar Hold",
      equipment: ["pull_up_bar"],
      muscle_groups: ["forearms"],
    }),
    fakeExercise("kettlebell-swing", {
      name: "Kettlebell Swing",
      equipment: ["kettlebell"],
      muscle_groups: ["glutes"],
    }),
    fakeExercise("pull-up", {
      name: "Pull Up",
      equipment: ["bodyweight", "pull_up_bar"],
      muscle_groups: ["back"],
    }),
    fakeExercise("push-up", {
      name: "Push Up",
      equipment: ["bodyweight"],
      muscle_groups: ["chest"],
    }),
  ]);
});

describe("the Equipment sheet over the Library tab", () => {
  it("opens from the Equipment pill, every Equipment unticked in core's order", async () => {
    await renderLibrary();

    await openSheet("Equipment");

    expect(pushedRoutes()).toEqual([
      expect.objectContaining({
        params: { choice: "library" },
        pathname: "/equipment",
      }),
    ]);
    expect(screen.getByRole("header", { name: "Equipment" })).toBeTruthy();
    expect(screen.getByLabelText("Reset")).toBeTruthy();

    const names = screen
      .getAllByRole("checkbox")
      .map((row) => row.props.accessibilityLabel);

    expect(names).toEqual([
      "Bodyweight",
      "Dumbbell",
      "Barbell",
      "Machine",
      "Cable",
      "Kettlebell",
      "Resistance band",
      "Bench",
      "Pull-up bar",
      "Parallel bars",
      "Bicycle",
      "Weight plate",
      "Box",
      "Stability ball",
      "Backpack",
      "Medicine ball",
      "Sled",
      "Towel",
      "TRX",
      "Battle ropes",
      "Dowel",
      "Slider",
      "Foam roller",
      "Wrist roller",
    ]);
    expect(names.every((name) => isChecked(name) === false)).toBe(true);
  });

  it("lists the Exercises needing any ticked Equipment once confirmed", async () => {
    await renderLibrary();
    await openSheet("Equipment");

    await tick("Dumbbell");
    await tick("Barbell");
    expect(isChecked("Dumbbell")).toBe(true);
    // Nothing is applied while the User is still choosing.
    expect(listQueries()).toHaveLength(1);
    await confirm();

    expect(sheetOpen("/equipment")).toBe(false);
    expect(listQueries().at(-1)).toEqual({
      equipment: "dumbbell,barbell",
      limit: "20",
      offset: "0",
    });
    expect(shownExercises()).toEqual([
      "Bench Press",
      "Dumbbell Curl",
      "Goblet Squat",
    ]);
    // The pill still just reads "Equipment", whatever is chosen.
    expect(screen.getByRole("button", { name: "Equipment" })).toBeTruthy();
    expect(getEquipmentChoice("library")).toEqual(["dumbbell", "barbell"]);
  });

  it("narrows by Equipment only the new list has", async () => {
    await renderLibrary();
    await openSheet("Equipment");

    await tick("Kettlebell");
    await confirm();

    expect(listQueries().at(-1)).toEqual({
      equipment: "kettlebell",
      limit: "20",
      offset: "0",
    });
    expect(shownExercises()).toEqual(["Kettlebell Swing"]);
  });

  it("keeps an Exercise needing only a pull-up bar out of Bodyweight", async () => {
    await renderLibrary();
    await openSheet("Equipment");

    await tick("Bodyweight");
    await confirm();

    expect(listQueries().at(-1)).toEqual({
      equipment: "bodyweight",
      limit: "20",
      offset: "0",
    });
    // Equipment narrows to Exercises using any of it: the pull-up uses
    // bodyweight as well as the bar, the hold only the bar.
    expect(shownExercises()).toEqual(["Push Up", "Pull Up"]);
    expect(screen.queryByText("Hanging Bar Hold")).toBeNull();
  });

  it("narrows together with the Muscle group choice", async () => {
    await renderLibrary();

    await openSheet("Muscles");
    await tick("Quadriceps");
    await confirm();

    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();

    expect(listQueries().at(-1)).toEqual({
      equipment: "dumbbell",
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
    // Both filters apply: the only dumbbell Exercise working the quadriceps.
    expect(shownExercises()).toEqual(["Goblet Squat"]);
    expect(getMuscleChoice("library")).toEqual(["quadriceps"]);
    expect(getEquipmentChoice("library")).toEqual(["dumbbell"]);
  });

  it("opens on the confirmed choice, and Reset then ✓ shows every Exercise", async () => {
    await renderLibrary();
    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();
    expect(screen.queryByText("Pull Up")).toBeNull();

    await openSheet("Equipment");
    expect(isChecked("Dumbbell")).toBe(true);
    await fireEvent.press(screen.getByLabelText("Reset"));
    expect(isChecked("Dumbbell")).toBe(false);
    // Reset alone applies nothing.
    expect(screen.queryByText("Pull Up")).toBeNull();
    await confirm();

    expect(getEquipmentChoice("library")).toEqual([]);
    expect(shownExercises()).toEqual([
      "Bench Press",
      "Dumbbell Curl",
      "Goblet Squat",
      "Hanging Bar Hold",
      "Kettlebell Swing",
      "Push Up",
      "Pull Up",
    ]);
  });

  it("keeps the previous choice when swiped away", async () => {
    await renderLibrary();
    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();

    await openSheet("Equipment");
    await tick("Dumbbell");
    await tick("Bodyweight");
    // The User swipes the sheet down.
    await act(() => stubRouter.back());
    await settle(client);

    expect(getEquipmentChoice("library")).toEqual(["dumbbell"]);
    expect(shownExercises()).toEqual(["Dumbbell Curl", "Goblet Squat"]);

    await openSheet("Equipment");
    expect(isChecked("Dumbbell")).toBe(true);
    expect(isChecked("Bodyweight")).toBe(false);
  });

  it("keeps the Muscle group choice to itself", async () => {
    await renderLibrary();
    await openSheet("Equipment");
    await tick("Dumbbell");
    await confirm();

    await openSheet("Muscles");

    // The Muscles sheet shows Muscle groups, untouched by the Equipment choice.
    expect(screen.getByRole("header", { name: "Muscles" })).toBeTruthy();
    expect(isChecked("Chest")).toBe(false);
    expect(getMuscleChoice("library")).toEqual([]);
  });

  it("reads in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderLibrary();

    await openSheet("Обладнання");

    expect(screen.getByRole("header", { name: "Обладнання" })).toBeTruthy();
    expect(screen.getByLabelText("Скинути")).toBeTruthy();
    expect(
      screen.getAllByRole("checkbox").map((row) => row.props.accessibilityLabel)
    ).toEqual([
      "Власна вага",
      "Гантель",
      "Штанга",
      "Тренажер",
      "Блок",
      "Гиря",
      "Еспандер-стрічка",
      "Лава",
      "Турнік",
      "Бруси",
      "Велосипед",
      "Диск",
      "Тумба",
      "Фітбол",
      "Рюкзак",
      "Медбол",
      "Сани",
      "Рушник",
      "TRX",
      "Канати",
      "Гімнастична палиця",
      "Слайдер",
      "Масажний ролик",
      "Кистьовий ролик",
    ]);
    await tick("Гантель");
    await confirm("Готово");

    expect(getEquipmentChoice("library")).toEqual(["dumbbell"]);
    expect(listQueries().at(-1)).toEqual({
      equipment: "dumbbell",
      language: "uk",
      limit: "20",
      offset: "0",
    });
    expect(screen.getByRole("button", { name: "Обладнання" })).toBeTruthy();
  });
});
