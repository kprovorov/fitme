import {
  feetAndInchesToInches,
  formatHeight,
  formatWeight,
  genders,
  inchesToFeetAndInches,
  type MeasurementSystem,
  range,
} from "@fitme/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "expo-router";
import { type ReactNode, useRef, useState } from "react";
import { type Control, Controller, useForm } from "react-hook-form";
import { Keyboard, Pressable, ScrollView } from "react-native";
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

export type ProfileFormValues = z.infer<typeof formSchema>;

/** Shown instead of raw Supabase errors when saving the profile fails. */
export const PROFILE_SAVE_ERROR_MESSAGE =
  "Couldn't save your profile. Please check your connection and try again.";

type ProfileField = "age" | "weight" | "height";

const PROFILE_FIELDS: ProfileField[] = ["age", "weight", "height"];

/** Height of the wheel picker drawer when expanded. */
const WHEEL_HEIGHT = 200;

/** Default height (5 ft) shown on the imperial wheels when none is set. */
const DEFAULT_HEIGHT_INCHES = 60;

const formSchema = z.object({
  age: z.coerce
    .number({
      message: "Age is required",
    })
    .min(4)
    .max(150),
  gender: z.enum(genders, {
    message: "Gender is required",
  }),
  height: z.coerce
    .number({
      message: "Height is required",
    })
    .min(1)
    .max(500),
  // Only rendered (and therefore only set) when `showName` is enabled.
  name: z
    .string()
    .trim()
    .min(1, { message: "Name is required" })
    .max(50, { message: "Name must be at most 50 characters" })
    .optional(),
  weight: z.coerce
    .number({
      message: "Weight is required",
    })
    .min(1)
    .max(500),
});

interface ProfileFormProps {
  defaultValues: Partial<ProfileFormValues>;
  /** Rendered below the fields, e.g. a request error. */
  footer?: ReactNode;
  heading?: ReactNode;
  /** Overrides the submit button loading state, e.g. with a mutation's `isPending`. */
  isSubmitting?: boolean;
  measurementSystem: MeasurementSystem;
  onSubmit: (values: ProfileFormValues) => unknown;
  /** Renders a required Name input above the other fields. */
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

  const form = useForm<ProfileFormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });

  const scrollViewRef = useRef<ScrollView>(null);

  const [fieldFocused, setFieldFocused] = useState<ProfileField | null>(null);

  const [activeWheel, setActiveWheel] = useState<ProfileField | null>(null);

  const [showWheel, setShowWheel] = useState(false);

  const wheelHeight = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    height: wheelHeight.value,
  }));

  const toggleWheel = (show?: boolean) => {
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
  };

  const toggleField = (field: ProfileField) => {
    Keyboard.dismiss();
    if (fieldFocused === field) {
      toggleWheel(false);
      setFieldFocused(null);
    } else {
      toggleWheel(true);
      setFieldFocused(field);
      setActiveWheel(field);
    }
  };

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
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            if (fieldFocused) {
              toggleWheel(false);
              setFieldFocused(null);
            }
          }}
          style={{ flex: 1, width: "100%" }}
        >
          <VStack className="items-stretch justify-center gap-8 p-6">
            {heading}

            {showName && (
              <VStack className="items-stretch gap-2">
                <VStack className="items-start justify-start gap-0">
                  <H4>Name</H4>
                  {form.formState.errors.name && (
                    <ErrorMessage>
                      {form.formState.errors.name.message}
                    </ErrorMessage>
                  )}
                </VStack>
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      autoCapitalize="words"
                      autoComplete="name"
                      editable={!(isSubmitting ?? form.formState.isSubmitting)}
                      maxLength={50}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      onFocus={() => {
                        toggleWheel(false);
                        setFieldFocused(null);
                      }}
                      placeholder="Name"
                      testID="edit-profile-name-input"
                      value={value}
                    />
                  )}
                />
              </VStack>
            )}

            <VStack className="items-stretch gap-2">
              <VStack className="items-start justify-start gap-0">
                <H4>Gender</H4>
                {form.formState.errors.gender && (
                  <ErrorMessage>
                    {form.formState.errors.gender.message}
                  </ErrorMessage>
                )}
              </VStack>

              <Controller
                control={form.control}
                name="gender"
                render={({ field: { onChange, value } }) => (
                  <GenderSwitch onValueChange={onChange} value={value} />
                )}
              />
            </VStack>

            <VStack className="items-stretch gap-2">
              <VStack className="items-start justify-start gap-0">
                <H4>Personal Parameters</H4>
                {PROFILE_FIELDS.map((field) => (
                  <VStack key={field}>
                    {form.formState.errors[field] && (
                      <ErrorMessage>
                        {form.formState.errors[field]?.message}
                      </ErrorMessage>
                    )}
                  </VStack>
                ))}
              </VStack>

              <VStack className="items-stretch gap-0 rounded-lg bg-card">
                <ParameterRow
                  hasError={!!form.formState.errors.age}
                  isFocused={fieldFocused === "age"}
                  label="Age"
                  onPress={() => toggleField("age")}
                  value={age ? `${age} y.o.` : undefined}
                />

                <Separator />

                <ParameterRow
                  hasError={!!form.formState.errors.weight}
                  isFocused={fieldFocused === "weight"}
                  label="Weight"
                  onPress={() => toggleField("weight")}
                  value={
                    weight ? formatWeight(weight, measurementSystem) : undefined
                  }
                />

                <Separator />

                <ParameterRow
                  hasError={!!form.formState.errors.height}
                  isFocused={fieldFocused === "height"}
                  label="Height"
                  onPress={() => toggleField("height")}
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
          isLoading={isSubmitting ?? form.formState.isSubmitting}
          label={submitLabel}
          onPress={form.handleSubmit(onSubmit)}
          systemImage={submitSystemImage}
          testID={submitTestID}
        />
      </VStack>
      <Animated.View className="overflow-hidden" style={[animatedStyle]}>
        <HStack className="flex-1 items-stretch justify-stretch gap-0 px-4">
          {activeWheel && (
            <ParameterWheel
              control={form.control}
              field={activeWheel}
              measurementSystem={measurementSystem}
              onChange={() => form.trigger(activeWheel)}
            />
          )}
        </HStack>
      </Animated.View>
    </>
  );
}

interface ParameterRowProps {
  hasError: boolean;
  isFocused: boolean;
  label: string;
  onPress: () => void;
  /** Formatted value, or `undefined` when not set yet. */
  value?: string;
}

function ParameterRow({
  hasError,
  isFocused,
  label,
  onPress,
  value,
}: ParameterRowProps) {
  let valueClassName = "text-muted-foreground";
  if (isFocused) {
    valueClassName = "text-primary";
  } else if (hasError) {
    valueClassName = "text-destructive";
  }

  return (
    <Pressable onPress={onPress}>
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
  const isMetric = measurementSystem === "metric";

  if (field === "age") {
    return (
      <Controller
        control={control}
        name="age"
        render={({ field: { onChange: setAge, value } }) => (
          <Picker
            onValueChange={(v) => {
              setAge(v);
              onChange();
            }}
            options={range(4, 150).map((i) => ({
              label: `${i}`,
              value: i,
            }))}
            value={Math.round(value ?? 25)}
            variant="wheel"
          />
        )}
      />
    );
  }

  if (field === "weight") {
    return (
      <Controller
        control={control}
        name="weight"
        render={({ field: { onChange: setWeight, value } }) => (
          <Picker
            onValueChange={(v) => {
              setWeight(v);
              onChange();
            }}
            options={range(1, isMetric ? 454 : 1000).map((i) => ({
              label: formatWeight(i, measurementSystem),
              value: i,
            }))}
            value={Math.round(value ?? (isMetric ? 80 : 176))}
            variant="wheel"
          />
        )}
      />
    );
  }

  return (
    <Controller
      control={control}
      name="height"
      render={({ field: { onChange: setHeight, value } }) => {
        if (isMetric) {
          return (
            <Picker
              onValueChange={(v) => {
                setHeight(v);
                onChange();
              }}
              options={range(30, 275).map((i) => ({
                label: `${i} cm`,
                value: i,
              }))}
              value={Math.round(value ?? 176)}
              variant="wheel"
            />
          );
        }

        const { feet, inches } = inchesToFeetAndInches(
          value ?? DEFAULT_HEIGHT_INCHES
        );

        return (
          <>
            <Picker
              onValueChange={(v) => {
                setHeight(feetAndInchesToInches(v, inches));
                onChange();
              }}
              options={range(1, 9).map((i) => ({
                label: `${i} ft`,
                value: i,
              }))}
              value={feet}
              variant="wheel"
            />
            <Picker
              onValueChange={(v) => {
                setHeight(feetAndInchesToInches(feet, v));
                onChange();
              }}
              options={range(0, 11).map((i) => ({
                label: `${i} in`,
                value: i,
              }))}
              value={inches}
              variant="wheel"
            />
          </>
        );
      }}
    />
  );
}
