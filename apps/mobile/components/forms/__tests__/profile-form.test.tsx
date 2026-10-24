import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import ProfileForm, {
  type ProfileFormProps,
  type ProfileFormValues,
} from "../profile-form";

jest.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
// Reanimated's worklets need a native module; the drawer only needs a View.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
// The SwiftUI wheel can't mount under Jest; like the native one, the stub
// never reports the selection it opens on. The open wheel's setter is kept, so
// a test can pick any value, in bounds or not.
const mockWheel: { onValueChange?: (value: number) => void } = {};
jest.mock("~/components/ui/picker", () => ({
  Picker: ({ onValueChange }: { onValueChange: (value: number) => void }) => {
    mockWheel.onValueChange = onValueChange;
    return null;
  },
}));

const renderForm = async ({
  defaultValues = { gender: "male" },
  measurementSystem = "metric",
}: Partial<
  Pick<ProfileFormProps, "defaultValues" | "measurementSystem">
> = {}) => {
  const onSubmit = jest.fn((_values: ProfileFormValues) => undefined);
  await render(
    <ProfileForm
      defaultValues={defaultValues}
      measurementSystem={measurementSystem}
      onSubmit={onSubmit}
      submitLabel="Next"
    />
  );
  return onSubmit;
};

const openWheel = (label: string) => fireEvent.press(screen.getByText(label));

const submit = () =>
  fireEvent.press(screen.getByRole("button", { name: "Next" }));

describe("ProfileForm", () => {
  it("stores the default a wheel opens on for an unset field", async () => {
    await renderForm();

    await openWheel("Age");

    expect(await screen.findByText("25 y.o.")).toBeTruthy();
  });

  it("submits the defaults of every wheel opened without scrolling", async () => {
    const onSubmit = await renderForm();

    await openWheel("Age");
    await openWheel("Weight");
    await openWheel("Height");
    await submit();

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      age: 25,
      height: 176,
      weight: 80,
    });
  });

  it("stores the imperial defaults", async () => {
    const onSubmit = await renderForm({ measurementSystem: "us" });

    await openWheel("Age");
    await openWheel("Weight");
    await openWheel("Height");
    await submit();

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      age: 25,
      height: 60,
      weight: 176,
    });
  });

  it("keeps stored values, fractional ones included, when their wheel opens", async () => {
    const onSubmit = await renderForm({
      defaultValues: { age: 31, gender: "female", height: 65.35, weight: 80.5 },
      measurementSystem: "us",
    });

    await openWheel("Age");
    await openWheel("Weight");
    await openWheel("Height");
    await submit();

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      age: 31,
      height: 65.35,
      weight: 80.5,
    });
  });

  const OUT_OF_BOUNDS = [
    ["Age", 9, "Number must be greater than or equal to 10"],
    ["Age", 121, "Number must be less than or equal to 120"],
    ["Height", 300.5, "Number must be less than or equal to 300"],
    ["Weight", 1000.5, "Number must be less than or equal to 1000"],
    ["Weight", 80.125, "Number must have at most 2 decimals"],
  ] as const;
  const FORMS = [
    ["onboarding", { gender: "male" }],
    ["edit", { age: 30, gender: "female", height: 170, weight: 60 }],
  ] as const;

  it.each(
    FORMS.flatMap(([form, defaultValues]) =>
      OUT_OF_BOUNDS.map(
        ([row, value, message]) =>
          [form, row, value, message, defaultValues] as const
      )
    )
  )(
    "refuses on %s: %s %d",
    async (_form, row, value, message, defaultValues) => {
      const onSubmit = await renderForm({ defaultValues });

      await openWheel("Age");
      await openWheel("Weight");
      await openWheel("Height");
      await openWheel(row);
      await act(() => mockWheel.onValueChange?.(value));
      await submit();

      expect(await screen.findByText(message)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    }
  );

  it("takes the shared bounds themselves", async () => {
    const onSubmit = await renderForm({
      defaultValues: { age: 30, gender: "male", height: 170, weight: 60 },
    });

    await openWheel("Age");
    await act(() => mockWheel.onValueChange?.(120));
    await openWheel("Height");
    await act(() => mockWheel.onValueChange?.(300));
    await openWheel("Weight");
    await act(() => mockWheel.onValueChange?.(999.99));
    await submit();

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      age: 120,
      height: 300,
      weight: 999.99,
    });
  });

  it("lets a saved value outside the shared bounds through unchanged", async () => {
    const onSubmit = await renderForm({
      defaultValues: { age: 4, gender: "female", height: 400, weight: 60 },
    });

    await submit();

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ age: 4, height: 400 });
  });
});
