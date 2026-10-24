import {
  feetAndInchesToInches,
  formatHeight,
  formatWeight,
  genders,
  inchesToFeetAndInches,
  MAX_AGE,
  MAX_BODY_DECIMALS,
  MAX_BODY_HEIGHT,
  MAX_BODY_WEIGHT,
  type MeasurementSystem,
  MIN_AGE,
  range,
} from "@fitme/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "expo-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type Control,
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  useController,
  useForm,
} from "react-hook-form";
import {
  Keyboard,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { GenderSwitch } from "~/components/ui/gender-switch";
import { HStack } from "~/components/ui/hstack";
import { Input } from "~/components/ui/input";
import { Picker } from "~/components/ui/picker";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { numberInRange } from "~/lib/form-schemas";

/** Shown instead of raw Supabase errors when saving the profile fails. */
export const PROFILE_SAVE_ERROR_MESSAGE =
  "Couldn't save your profile. Please check your connection and try again.";

type ProfileField = "age" | "weight" | "height";

const PROFILE_FIELDS: ProfileField[] = ["age", "weight", "height"];

/** Height of the wheel picker drawer when expanded. */
const WHEEL_HEIGHT = 200;

/** Values the wheels open on (and store) for a field that isn't set yet. */
const DEFAULT_AGE = 25;
const DEFAULT_WEIGHT_KG = 80;
const DEFAULT_WEIGHT_LBS = 176;
const DEFAULT_HEIGHT_CM = 176;
/** 5 ft. */
const DEFAULT_HEIGHT_INCHES = 60;

/** The smallest height or weight step: at most `MAX_BODY_DECIMALS` decimals. */
const BODY_STEP = 10 ** -MAX_BODY_DECIMALS;

const bodyValue = (max: number, requiredMessage: string) =>
  numberInRange(1, max, requiredMessage).multipleOf(BODY_STEP, {
    error: `Number must have at most ${MAX_BODY_DECIMALS} decimals`,
  });

const ageSchema = numberInRange(MIN_AGE, MAX_AGE, "Age is required");
const heightSchema = bodyValue(MAX_BODY_HEIGHT, "Height is required");
const weightSchema = bodyValue(MAX_BODY_WEIGHT, "Weight is required");

/**
 * `schema`, except that the `saved` value passes as it is: only what the User
 * changes is sent (edit-profile), so a value saved before today's bounds
 * never blocks an unrelated edit.
 */
const orSaved = (
  schema: typeof ageSchema,
  saved: number | undefined,
  requiredMessage: string
) =>
  saved === undefined
    ? schema
    : z.coerce
        .number<number>({ error: requiredMessage })
        .superRefine((value, ctx) => {
          if (value === saved) {
            return;
          }
          for (const issue of schema.safeParse(value).error?.issues ?? []) {
            ctx.addIssue({ code: "custom", message: issue.message });
          }
        });

/**
 * The Public API's Profile bounds (`@fitme/core`), so a value the form takes
 * is never refused after submit; a saved value passes unchanged. Heights and
 * weights start at 1, where the wheels do (the API takes anything above 0).
 */
const profileFormSchema = (saved: {
  age?: number;
  height?: number;
  weight?: number;
}) =>
  z.object({
    age: orSaved(ageSchema, saved.age, "Age is required"),
    gender: z.enum(genders, { error: "Gender is required" }),
    height: orSaved(heightSchema, saved.height, "Height is required"),
    // Only rendered (and therefore only set) when `showName` is enabled.
    // Clerk's Name is optional, so a User without one can still save the
    // other fields.
    name: z
      .string()
      .trim()
      .max(50, { error: "Name must be at most 50 characters" })
      .optional(),
    weight: orSaved(weightSchema, saved.weight, "Weight is required"),
  });

export type ProfileFormValues = z.infer<ReturnType<typeof profileFormSchema>>;

export interface ProfileFormProps {
  defaultValues: Partial<ProfileFormValues>;
  /** Rendered below the fields, e.g. a request error. */
  footer?: ReactNode;
  heading?: ReactNode;
  /** Overrides the submit button loading state, e.g. with a mutation's `isPending`. */
  isSubmitting?: boolean;
  measurementSystem: MeasurementSystem;
  onSubmit: (values: ProfileFormValues) => unknown;
  /** Renders an optional Name input above the other fields. */
  showName?: boolean;
  submitLabel: string;
  submitSystemImage?: SFSymbol;
  submitTestID?: string;
}

export default function ProfileForm({
  defaultValues,
  footer,
  heading,
  isSubmitting,
  measurementSystem,
  onSubmit,
  showName = false,
  submitLabel,
  submitSystemImage,
  submitTestID,
}: ProfileFormProps) {
  const insets = useSafeAreaInsets();

  // The saved values the form starts from; later changes to `defaultValues`
  // don't reset the form either.
  const [resolver] = useState(() =>
    zodResolver(profileFormSchema(defaultValues))
  );

  const form = useForm<ProfileFormValues>({
    defaultValues,
    resolver,
  });

  const scrollViewRef = useRef<ScrollViewInstance>(null);

  const [fieldFocused, setFieldFocused] = useState<ProfileField | null>(null);

  const [activeWheel, setActiveWheel] = useState<ProfileField | null>(null);

  const [showWheel, setShowWheel] = useState(false);

  const wheelHeight = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    height: wheelHeight.value,
  }));

  const toggleWheel = useCallback(
    (show?: boolean) => {
      const next = show ?? !showWheel;
      setShowWheel(next);
      wheelHeight.value = withTiming(next ? WHEEL_HEIGHT : 0, {
        duration: 150,
      });

      if (next) {
        // Small delay to ensure animation is complete
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 160);
      }
    },
    [showWheel, wheelHeight]
  );

  const toggleField = useCallback(
    (field: ProfileField) => {
      Keyboard.dismiss();
      if (fieldFocused === field) {
        toggleWheel(false);
        setFieldFocused(null);
      } else {
        toggleWheel(true);
        setFieldFocused(field);
        setActiveWheel(field);
      }
    },
    [fieldFocused, toggleWheel]
  );

  const handleBackgroundPress = useCallback(() => {
    Keyboard.dismiss();
    if (fieldFocused) {
      toggleWheel(false);
      setFieldFocused(null);
    }
  }, [fieldFocused, toggleWheel]);

  const handleNameFocus = useCallback(() => {
    toggleWheel(false);
    setFieldFocused(null);
  }, [toggleWheel]);

  const isFormSubmitting = isSubmitting ?? form.formState.isSubmitting;

  const renderNameField = useCallback(
    ({
      field: { onChange, onBlur, value },
      fieldState: { error },
    }: {
      field: ControllerRenderProps<ProfileFormValues, "name">;
      fieldState: ControllerFieldState;
    }) => (
      <Input
        autoCapitalize="words"
        autoComplete="name"
        editable={!isFormSubmitting}
        error={error?.message}
        maxLength={50}
        onBlur={onBlur}
        onChangeText={onChange}
        onFocus={handleNameFocus}
        placeholder="Name"
        testID="edit-profile-name-input"
        value={value}
      />
    ),
    [handleNameFocus, isFormSubmitting]
  );

  // The rows read `getValues`, so this re-validation is also what re-renders
  // them with a wheel's new value.
  const handleWheelChange = useCallback(() => {
    if (activeWheel) {
      form.trigger(activeWheel);
    }
  }, [activeWheel, form]);

  const age = form.getValues("age");
  const weight = form.getValues("weight");
  const height = form.getValues("height");

  return (
    <>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () =>
            showWheel
              ? [
                  {
                    label: "Done",
                    onPress: () => {
                      toggleWheel();
                      setFieldFocused(null);
                    },
                    type: "button",
                  },
                ]
              : [],
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
      >
        {/* Tap-outside-to-dismiss only; keep the fields individually accessible */}
        <Pressable
          accessible={false}
          onPress={handleBackgroundPress}
          style={{ flex: 1, width: "100%" }}
        >
          <VStack className="items-stretch justify-center gap-8 p-6">
            {heading}

            {showName ? (
              <VStack className="items-stretch gap-2">
                <H4>Name</H4>
                <Controller
                  control={form.control}
                  name="name"
                  render={renderNameField}
                />
              </VStack>
            ) : null}

            <VStack className="items-stretch gap-2">
              <VStack className="items-start justify-start gap-0">
                <H4>Gender</H4>
                {form.formState.errors.gender ? (
                  <ErrorMessage>
                    {form.formState.errors.gender.message}
                  </ErrorMessage>
                ) : null}
              </VStack>

              <Controller
                control={form.control}
                name="gender"
                render={renderGenderField}
              />
            </VStack>

            <VStack className="items-stretch gap-2">
              <VStack className="items-start justify-start gap-0">
                <H4>Personal Parameters</H4>
                {PROFILE_FIELDS.map((field) => (
                  <VStack key={field}>
                    {form.formState.errors[field] ? (
                      <ErrorMessage>
                        {form.formState.errors[field]?.message}
                      </ErrorMessage>
                    ) : null}
                  </VStack>
                ))}
              </VStack>

              <VStack className="items-stretch gap-0 rounded-lg bg-card">
                <ParameterRow
                  field="age"
                  hasError={!!form.formState.errors.age}
                  isFocused={fieldFocused === "age"}
                  label="Age"
                  onPress={toggleField}
                  value={age ? `${age} y.o.` : undefined}
                />

                <Separator />

                <ParameterRow
                  field="weight"
                  hasError={!!form.formState.errors.weight}
                  isFocused={fieldFocused === "weight"}
                  label="Weight"
                  onPress={toggleField}
                  value={
                    weight ? formatWeight(weight, measurementSystem) : undefined
                  }
                />

                <Separator />

                <ParameterRow
                  field="height"
                  hasError={!!form.formState.errors.height}
                  isFocused={fieldFocused === "height"}
                  label="Height"
                  onPress={toggleField}
                  value={
                    height ? formatHeight(height, measurementSystem) : undefined
                  }
                />
              </VStack>
            </VStack>

            {footer}
          </VStack>
        </Pressable>
      </ScrollView>

      <VStack
        className="items-stretch gap-1 p-6"
        style={{ paddingBottom: Math.max(24, insets.bottom) }}
      >
        <Button
          icon={submitSystemImage}
          iconPosition="trailing"
          isLoading={isFormSubmitting}
          label={submitLabel}
          onPress={form.handleSubmit(onSubmit)}
          testID={submitTestID}
        />
      </VStack>
      <Animated.View className="overflow-hidden" style={[animatedStyle]}>
        <HStack className="flex-1 items-stretch justify-stretch gap-0 px-4">
          {activeWheel ? (
            // Remount per field: a reused native wheel keeps the previous selection
            <ParameterWheel
              control={form.control}
              field={activeWheel}
              key={activeWheel}
              measurementSystem={measurementSystem}
              onChange={handleWheelChange}
            />
          ) : null}
        </HStack>
      </Animated.View>
    </>
  );
}

function renderGenderField({
  field: { onChange, value },
}: {
  field: ControllerRenderProps<ProfileFormValues, "gender">;
}) {
  return <GenderSwitch onValueChange={onChange} value={value} />;
}

interface ParameterRowProps {
  field: ProfileField;
  hasError: boolean;
  isFocused: boolean;
  label: string;
  onPress: (field: ProfileField) => void;
  /** Formatted value, or `undefined` when not set yet. */
  value?: string;
}

function ParameterRow({
  field,
  hasError,
  isFocused,
  label,
  onPress,
  value,
}: ParameterRowProps) {
  const handlePress = useCallback(() => onPress(field), [field, onPress]);

  let valueClassName = "text-muted-foreground";
  if (isFocused) {
    valueClassName = "text-primary";
  } else if (hasError) {
    valueClassName = "text-destructive";
  }

  return (
    <Pressable onPress={handlePress}>
      <HStack className="w-full justify-between p-3">
        <Text>{label}</Text>
        <Text className={valueClassName}>{value ?? "Not Set"}</Text>
      </HStack>
    </Pressable>
  );
}

interface ParameterWheelProps {
  control: Control<ProfileFormValues>;
  field: ProfileField;
  measurementSystem: MeasurementSystem;
  /** Called after the field value changes, e.g. to re-validate it. */
  onChange: () => void;
}

/**
 * Wheel picker(s) for a single profile parameter. Stored values may be
 * fractional after a measurement system conversion, so the wheels show the
 * nearest whole value while the form keeps the stored value until changed.
 */
function ParameterWheel({
  control,
  field,
  measurementSystem,
  onChange,
}: ParameterWheelProps) {
  if (field === "age") {
    return <AgeWheel control={control} onChange={onChange} />;
  }

  if (field === "weight") {
    return (
      <WeightWheel
        control={control}
        measurementSystem={measurementSystem}
        onChange={onChange}
      />
    );
  }

  return (
    <HeightWheel
      control={control}
      measurementSystem={measurementSystem}
      onChange={onChange}
    />
  );
}

type WheelProps = Omit<ParameterWheelProps, "field">;

/**
 * A wheel's field value and setter. The native wheel only reports a selection
 * the User scrolls to, so an unset field gets the default the wheel opens on
 * as soon as it mounts; a stored value is never overwritten.
 */
function useWheelValue(
  control: Control<ProfileFormValues>,
  name: ProfileField,
  defaultValue: number,
  onChange: () => void
): [number, (value: number) => void] {
  const {
    field: { onChange: setFieldValue, value },
  } = useController({ control, name });

  const setValue = useCallback(
    (v: number) => {
      setFieldValue(v);
      onChange();
    },
    [onChange, setFieldValue]
  );

  const isUnset = value === undefined || value === null;

  useEffect(() => {
    if (isUnset) {
      setValue(defaultValue);
    }
  }, [defaultValue, isUnset, setValue]);

  return [value ?? defaultValue, setValue];
}

function AgeWheel({
  control,
  onChange,
}: Omit<WheelProps, "measurementSystem">) {
  const [value, setAge] = useWheelValue(control, "age", DEFAULT_AGE, onChange);

  return (
    <Picker
      onValueChange={setAge}
      options={range(MIN_AGE, MAX_AGE).map((i) => ({
        label: `${i}`,
        value: i,
      }))}
      value={Math.round(value)}
      variant="wheel"
    />
  );
}

function WeightWheel({ control, measurementSystem, onChange }: WheelProps) {
  const isMetric = measurementSystem === "metric";
  const [value, setWeight] = useWheelValue(
    control,
    "weight",
    isMetric ? DEFAULT_WEIGHT_KG : DEFAULT_WEIGHT_LBS,
    onChange
  );

  return (
    <Picker
      onValueChange={setWeight}
      options={range(1, isMetric ? 454 : 1000).map((i) => ({
        label: formatWeight(i, measurementSystem),
        value: i,
      }))}
      value={Math.round(value)}
      variant="wheel"
    />
  );
}

function HeightWheel({ control, measurementSystem, onChange }: WheelProps) {
  const isMetric = measurementSystem === "metric";
  const [value, setHeight] = useWheelValue(
    control,
    "height",
    isMetric ? DEFAULT_HEIGHT_CM : DEFAULT_HEIGHT_INCHES,
    onChange
  );

  const { feet, inches } = inchesToFeetAndInches(value);

  const handleFeetChange = useCallback(
    (v: number) => setHeight(feetAndInchesToInches(v, inches)),
    [inches, setHeight]
  );

  const handleInchesChange = useCallback(
    (v: number) => setHeight(feetAndInchesToInches(feet, v)),
    [feet, setHeight]
  );

  if (isMetric) {
    return (
      <Picker
        onValueChange={setHeight}
        options={range(30, 275).map((i) => ({
          label: `${i} cm`,
          value: i,
        }))}
        value={Math.round(value)}
        variant="wheel"
      />
    );
  }

  return (
    <>
      <Picker
        onValueChange={handleFeetChange}
        options={range(1, 9).map((i) => ({
          label: `${i} ft`,
          value: i,
        }))}
        value={feet}
        variant="wheel"
      />
      <Picker
        onValueChange={handleInchesChange}
        options={range(0, 11).map((i) => ({
          label: `${i} in`,
          value: i,
        }))}
        value={inches}
        variant="wheel"
      />
    </>
  );
}
