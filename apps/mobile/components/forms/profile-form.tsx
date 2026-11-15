import { rateLimitedFor } from "@fitme/api-client";
import {
  feetAndInchesToInches,
  genders,
  inchesToFeetAndInches,
  MAX_AGE,
  MAX_BODY_DECIMALS,
  MAX_BODY_HEIGHT,
  MAX_BODY_WEIGHT,
  MIN_AGE,
  range,
} from "@fitme/core";
import type { MeasurementSystem } from "@fitme/core";
import { formatHeight, formatUnit, formatWeight } from "@fitme/i18n";
import type { Translator } from "@fitme/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "expo-router";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { Controller, useController, useForm, useWatch } from "react-hook-form";
import type { Control, ControllerRenderProps, Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text as NativeText,
  View,
} from "react-native";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
  ViewInstance,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import { ScopedVariables } from "uniwind";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { GenderSwitch } from "~/components/ui/gender-switch";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Picker } from "~/components/ui/picker";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { numberInRange } from "~/lib/form-schemas";
import { i18n as appI18n, useI18n } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/**
 * What a failed save shows, in the App language: the wait when there were too
 * many requests, never the API's own message.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- This shared error formatter is used outside the form as well.
export const profileSaveErrorMessage = (t: Translator["t"], error: Error) => {
  const seconds = rateLimitedFor(error);

  return seconds === null
    ? t("profileForm.errors.saveFailed")
    : t("profileForm.errors.saveRateLimited", { seconds });
};

type ProfileField = "age" | "weight" | "height";

const PROFILE_FIELDS: ProfileField[] = ["age", "weight", "height"];

/** Height of the wheel picker drawer when expanded. */
const WHEEL_HEIGHT = 200;

/** Long enough for the wheel's drawer (150 ms) to have opened. */
const WHEEL_SETTLED_MS = 200;

/** Space kept between a revealed field and the Save bar. */
const REVEAL_MARGIN = 16;

/** Values the wheels open on (and store) for a field that isn't set yet. */
const DEFAULT_AGE = 25;
const DEFAULT_WEIGHT_KG = 80;
const DEFAULT_WEIGHT_LBS = 176;
const DEFAULT_HEIGHT_CM = 176;

/** 5 ft. */
const DEFAULT_HEIGHT_INCHES = 60;

/** The smallest height or weight step: at most `MAX_BODY_DECIMALS` decimals. */
const BODY_STEP = 10 ** -MAX_BODY_DECIMALS;

/** The longest first or last name the form takes. */
const MAX_NAME_LENGTH = 50;

// Every message is read when the form validates, so it's in the App language
// of that moment.
const ageRequired = () => appI18n.t("profileForm.errors.ageRequired");
const heightRequired = () => appI18n.t("profileForm.errors.heightRequired");
const weightRequired = () => appI18n.t("profileForm.errors.weightRequired");

const bodyValue = (max: number, requiredMessage: () => string) =>
  numberInRange(1, max, requiredMessage).multipleOf(BODY_STEP, {
    error: () =>
      appI18n.t("profileForm.errors.tooManyDecimals", {
        max: MAX_BODY_DECIMALS,
      }),
  });

const ageSchema = numberInRange(MIN_AGE, MAX_AGE, ageRequired);

/**
 * A first or last name, trimmed, at most `MAX_NAME_LENGTH` characters. A name
 * the User had can't be cleared, but one Clerk never had (registration keeps
 * a one-word name as the first name alone) may stay empty, so it never
 * blocks an unrelated edit. Only rendered (and therefore only set) with
 * `showNames`.
 */
const nameSchema = (
  saved: string | undefined,
  requiredMessage: () => string,
  tooLongMessage: () => string
) =>
  z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH, { error: tooLongMessage })
    .optional()
    .superRefine((value, ctx) => {
      if (value === "" && (saved ?? "").trim() !== "") {
        ctx.addIssue({ code: "custom", message: requiredMessage() });
      }
    });

const heightSchema = bodyValue(MAX_BODY_HEIGHT, heightRequired);
const weightSchema = bodyValue(MAX_BODY_WEIGHT, weightRequired);

/**
 * `schema`, except that the `saved` value passes as it is: only what the User
 * changes is sent (edit-profile), so a value saved before today's bounds
 * never blocks an unrelated edit.
 */
const orSaved = (
  schema: typeof ageSchema,
  saved: number | undefined,
  requiredMessage: () => string
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
  firstName?: string;
  height?: number;
  lastName?: string;
  weight?: number;
}) =>
  z.object({
    age: orSaved(ageSchema, saved.age, ageRequired),
    firstName: nameSchema(
      saved.firstName,
      () => appI18n.t("profileForm.errors.firstNameRequired"),
      () =>
        appI18n.t("profileForm.errors.firstNameTooLong", {
          max: MAX_NAME_LENGTH,
        })
    ),
    gender: z.enum(genders, {
      error: () => appI18n.t("profileForm.errors.genderRequired"),
    }),
    height: orSaved(heightSchema, saved.height, heightRequired),
    lastName: nameSchema(
      saved.lastName,
      () => appI18n.t("profileForm.errors.lastNameRequired"),
      () =>
        appI18n.t("profileForm.errors.lastNameTooLong", {
          max: MAX_NAME_LENGTH,
        })
    ),
    weight: orSaved(weightSchema, saved.weight, weightRequired),
  });

export type ProfileFormValues = z.infer<ReturnType<typeof profileFormSchema>>;

export interface ProfileFormProps {
  defaultValues: Partial<ProfileFormValues>;
  /** Rendered below the fields, e.g. a request error. */
  footer?: ReactNode;
  heading?: ReactNode;
  /** Overrides the submit button loading state, e.g. with a mutation's `isPending`. */
  isSubmitting?: boolean;
  /**
   * `rows` (onboarding): age, weight and height as rows of one card under a
   * heading. `fields` (Edit Profile): every value under its own label, in a
   * field like an `Input`, with its error under it.
   */
  layout?: "fields" | "rows";
  measurementSystem: MeasurementSystem;
  onSubmit: (values: ProfileFormValues) => void | Promise<void>;
  /** Disables the submit button until a value differs from `defaultValues`. */
  requireChange?: boolean;
  /** Renders First Name and Last Name inputs above the other fields. */
  showNames?: boolean;
  submitLabel: string;
  submitSystemImage?: SFSymbol;
  submitTestID?: string;
}

const renderGenderField = ({
  field: { onChange, value },
}: {
  field: ControllerRenderProps<ProfileFormValues, "gender">;
}) => <GenderSwitch onValueChange={onChange} value={value} />;

interface ParameterRowProps {
  field: ProfileField;
  hasError: boolean;
  isFocused: boolean;
  label: string;
  onPress: (field: ProfileField) => void;
  /** Formatted value, or `undefined` when not set yet. */
  value?: string;
}

const ParameterRow = ({
  field,
  hasError,
  isFocused,
  label,
  onPress,
  value,
}: ParameterRowProps) => {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(field), [field, onPress]);

  return (
    <Pressable onPress={handlePress}>
      <View className="flex w-full flex-row items-center justify-between gap-4 p-3">
        <Text>{label}</Text>
        <NativeText
          className={cn(
            "text-body web:select-text",
            isFocused && "text-primary",
            !isFocused && hasError && "text-destructive",
            !isFocused && !hasError && "text-muted-foreground"
          )}
        >
          {value ?? t("profileForm.notSet")}
        </NativeText>
      </View>
    </Pressable>
  );
};

interface ParameterFieldProps extends Omit<ParameterRowProps, "hasError"> {
  /** The field's error, shown under it. */
  error?: string;
  /** The field's view (with its error), to measure where it is on screen. */
  onView: (field: ProfileField, view: ViewInstance | null) => void;
}

/**
 * A value under its label in a field drawn like an `Input`: pressing it opens
 * the value's wheel. The stroke is `ring` while its wheel is open and
 * `destructive` with an error, which wins, as an `Input`'s does.
 */
const ParameterField = ({
  error,
  field,
  isFocused,
  label,
  onPress,
  onView,
  value,
}: ParameterFieldProps) => {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(field), [field, onPress]);

  const handleRef = useCallback(
    (view: ViewInstance | null) => onView(field, view),
    [field, onView]
  );

  let stroke = "border-input";

  if (error) {
    stroke = "border-destructive";
  } else if (isFocused) {
    stroke = "border-ring";
  }

  return (
    <View className="flex flex-col items-stretch gap-2" ref={handleRef}>
      <Label>{label}</Label>
      <Pressable
        accessibilityHint={error}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: isFocused }}
        accessibilityValue={{ text: value ?? t("profileForm.notSet") }}
        className={cn(
          "border-continuous px-sm min-h-12 justify-center rounded-lg border",
          stroke
        )}
        onPress={handlePress}
        testID={`profile-${field}-field`}
      >
        <NativeText
          className={cn(
            "text-body",
            value === undefined ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {value ?? t("profileForm.notSet")}
        </NativeText>
      </Pressable>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </View>
  );
};

interface NameFieldProps {
  control: Control<ProfileFormValues>;
  disabled: boolean;
  name: "firstName" | "lastName";
  /** Closes an open wheel as the keyboard comes up. */
  onFocus: () => void;
}

const NAME_FIELDS = {
  firstName: {
    autoComplete: "given-name",
    label: "profileForm.firstName",
    testID: "edit-profile-first-name-input",
    textContentType: "givenName",
  },
  lastName: {
    autoComplete: "family-name",
    label: "profileForm.lastName",
    testID: "edit-profile-last-name-input",
    textContentType: "familyName",
  },
} as const;

/** First Name or Last Name under its label, with its error under it. */
const NameField = ({ control, disabled, name, onFocus }: NameFieldProps) => {
  const { t } = useTranslation();
  const { autoComplete, label, testID, textContentType } = NAME_FIELDS[name];

  const {
    field: { onBlur, onChange, value },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <View className="flex flex-col items-stretch justify-center gap-2">
      <Label>{t(label)}</Label>
      <Input
        accessibilityLabel={t(label)}
        autoCapitalize="words"
        autoComplete={autoComplete}
        editable={!disabled}
        error={error?.message}
        maxLength={MAX_NAME_LENGTH}
        onBlur={onBlur}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder={t(label)}
        testID={testID}
        textContentType={textContentType}
        value={value}
      />
    </View>
  );
};

interface ParametersProps {
  errors: Partial<Record<ProfileField, string>>;
  focused: ProfileField | null;
  labels: Record<ProfileField, string>;
  onPress: (field: ProfileField) => void;
  onView: (field: ProfileField, view: ViewInstance | null) => void;
  values: Record<ProfileField, string | undefined>;
}

/** Age, weight and height as labelled fields, each with its error (Edit Profile). */
const ParameterFields = ({
  errors,
  focused,
  labels,
  onPress,
  onView,
  values,
}: ParametersProps) =>
  PROFILE_FIELDS.map((field) => (
    <ParameterField
      error={errors[field]}
      field={field}
      isFocused={focused === field}
      key={field}
      label={labels[field]}
      onPress={onPress}
      onView={onView}
      value={values[field]}
    />
  ));

/**
 * Age, weight and height as rows of one card under the Personal Parameters
 * heading, the errors under the heading (onboarding).
 */
const ParameterRows = ({
  errors,
  focused,
  labels,
  onPress,
  values,
}: ParametersProps) => {
  const { t } = useTranslation();

  return (
    <View className="flex flex-col items-stretch justify-center gap-2">
      <View className="flex flex-col items-start justify-start gap-0">
        <H4>{t("profileForm.parameters")}</H4>
        {PROFILE_FIELDS.map((field) => (
          <VStack key={field}>
            {errors[field] ? (
              <ErrorMessage>{errors[field]}</ErrorMessage>
            ) : null}
          </VStack>
        ))}
      </View>

      <View className="bg-card flex flex-col items-stretch justify-center gap-0 rounded-lg">
        {PROFILE_FIELDS.map((field, index) => (
          <Fragment key={field}>
            {index > 0 ? <Separator /> : null}
            <ParameterRow
              field={field}
              hasError={!!errors[field]}
              isFocused={focused === field}
              label={labels[field]}
              onPress={onPress}
              value={values[field]}
            />
          </Fragment>
        ))}
      </View>
    </View>
  );
};

interface ParameterWheelProps {
  control: Control<ProfileFormValues>;
  field: ProfileField;
  measurementSystem: MeasurementSystem;
  /** Called after the field value changes, e.g. to re-validate it. */
  onChange: () => void;
}

type WheelProps = Omit<ParameterWheelProps, "field">;

/**
 * A wheel's field value and setter. The native wheel only reports a selection
 * the User scrolls to, so an unset field gets the default the wheel opens on
 * as soon as it mounts; a stored value is never overwritten.
 */
const useWheelValue = (
  control: Control<ProfileFormValues>,
  name: ProfileField,
  defaultValue: number,
  onChange: () => void
): [number, (value: number) => void] => {
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
};

const AgeWheel = ({
  control,
  onChange,
}: Omit<WheelProps, "measurementSystem">) => {
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
};

const WeightWheel = ({ control, measurementSystem, onChange }: WheelProps) => {
  const i18n = useI18n();
  const isMetric = measurementSystem === "metric";

  const [value, setWeight] = useWheelValue(
    control,
    "weight",
    isMetric ? DEFAULT_WEIGHT_KG : DEFAULT_WEIGHT_LBS,
    onChange
  );

  // Up to 1000 labels, each through the catalog: built once per language
  // and system, not on every value change.
  const options = useMemo(
    () =>
      range(1, isMetric ? 454 : 1000).map((i) => ({
        label: formatWeight(i18n, i, measurementSystem),
        value: i,
      })),
    [i18n, isMetric, measurementSystem]
  );

  return (
    <Picker
      onValueChange={setWeight}
      options={options}
      value={Math.round(value)}
      variant="wheel"
    />
  );
};

const HeightWheel = ({ control, measurementSystem, onChange }: WheelProps) => {
  const i18n = useI18n();
  const { t } = useTranslation();
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
          label: formatUnit(i18n, i, "cm"),
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
          label: t("profileForm.feet", { count: i }),
          value: i,
        }))}
        value={feet}
        variant="wheel"
      />
      <Picker
        onValueChange={handleInchesChange}
        options={range(0, 11).map((i) => ({
          label: t("profileForm.inches", { count: i }),
          value: i,
        }))}
        value={inches}
        variant="wheel"
      />
    </>
  );
};

/**
 * Wheel picker(s) for a single profile parameter. Stored values may be
 * fractional after a measurement system conversion, so the wheels show the
 * nearest whole value while the form keeps the stored value until changed.
 */
const ParameterWheel = ({
  control,
  field,
  measurementSystem,
  onChange,
}: ParameterWheelProps) => {
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
};

/** Each parameter's label and its value as the form shows it (`undefined` while unset). */
const useParameterTexts = (
  control: Control<ProfileFormValues>,
  measurementSystem: MeasurementSystem
) => {
  const i18n = useI18n();
  const { t } = useTranslation();

  const [age, weight, height] = useWatch({
    control,
    name: ["age", "weight", "height"],
  });

  const values: Record<ProfileField, string | undefined> = {
    age: age ? t("profileForm.ageValue", { count: age }) : undefined,
    height: height ? formatHeight(i18n, height, measurementSystem) : undefined,
    weight: weight ? formatWeight(i18n, weight, measurementSystem) : undefined,
  };

  const labels: Record<ProfileField, string> = {
    age: t("profileForm.age"),
    height: t("profileForm.height"),
    weight: t("profileForm.weight"),
  };

  return { labels, values };
};

/**
 * Scrolls a labelled field up until all of it (its error included) shows
 * above the Save bar, both measured where they are on screen (`fields`
 * layout); otherwise, to the end of the form. The form hands it each field's
 * view, the Save bar's and its scroll events.
 */
const useRevealField = (
  layout: "fields" | "rows",
  scrollViewRef: RefObject<ScrollViewInstance | null>
) => {
  const fieldViews = useRef<Partial<Record<ProfileField, ViewInstance | null>>>(
    {}
  );

  const footerRef = useRef<ViewInstance>(null);
  const scrollOffset = useRef(0);

  const handleFieldView = useCallback(
    (field: ProfileField, view: ViewInstance | null) => {
      fieldViews.current[field] = view;
    },
    []
  );

  const handleScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.current = nativeEvent.contentOffset.y;
    },
    []
  );

  const revealField = useCallback(
    (field?: ProfileField) => {
      const view = field ? fieldViews.current[field] : undefined;
      const footer = footerRef.current;
      const scrollView = scrollViewRef.current;

      if (layout !== "fields" || !view || !footer || !scrollView) {
        scrollView?.scrollToEnd({ animated: true });

        return;
      }

      footer.measureInWindow((_x, footerTop) => {
        view.measureInWindow((_fieldX, fieldTop, _width, fieldHeight) => {
          const overflow = fieldTop + fieldHeight + REVEAL_MARGIN - footerTop;

          if (overflow > 0) {
            scrollView.scrollTo({
              animated: true,
              y: scrollOffset.current + overflow,
            });
          }
        });
      });
    },
    [layout, scrollViewRef]
  );

  return { footerRef, handleFieldView, handleScroll, revealField };
};

const ProfileForm = ({
  defaultValues,
  footer,
  heading,
  isSubmitting,
  layout = "rows",
  measurementSystem,
  onSubmit,
  requireChange = false,
  showNames = false,
  submitLabel,
  submitSystemImage,
  submitTestID,
}: ProfileFormProps) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // The saved values the form starts from; later changes to `defaultValues`
  // don't reset the form either.
  const [resolver] = useReducer(
    (initialResolver: Resolver<ProfileFormValues>) => initialResolver,
    defaultValues,
    (savedValues) => zodResolver(profileFormSchema(savedValues))
  );

  const form = useForm<ProfileFormValues>({
    defaultValues,
    resolver,
  });

  const scrollViewRef = useRef<ScrollViewInstance>(null);

  const [fieldFocused, setFieldFocused] = useState<ProfileField | null>(null);

  const [activeWheel, setActiveWheel] = useState<ProfileField | null>(null);

  const [showWheel, setShowWheel] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    height: withTiming(showWheel ? WHEEL_HEIGHT : 0, { duration: 150 }),
  }));

  const { footerRef, handleFieldView, handleScroll, revealField } =
    useRevealField(layout, scrollViewRef);

  const toggleWheel = useCallback(
    (show?: boolean, field?: ProfileField) => {
      const next = show ?? !showWheel;
      setShowWheel(next);

      if (next) {
        // Once the wheel has opened and the scroll view has shrunk for it.
        setTimeout(() => revealField(field), WHEEL_SETTLED_MS);
      }
    },
    [revealField, showWheel]
  );

  const toggleField = useCallback(
    (field: ProfileField) => {
      Keyboard.dismiss();

      if (fieldFocused === field) {
        toggleWheel(false);
        setFieldFocused(null);
      } else {
        toggleWheel(true, field);
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

  // Re-validate the field after the wheel changes its value.
  const handleWheelChange = useCallback(() => {
    if (activeWheel) {
      void form.trigger(activeWheel);
    }
  }, [activeWheel, form]);

  const { labels, values } = useParameterTexts(form.control, measurementSystem);

  const parameters: ParametersProps = {
    errors: {
      age: form.formState.errors.age?.message,
      height: form.formState.errors.height?.message,
      weight: form.formState.errors.weight?.message,
    },
    focused: fieldFocused,
    labels,
    onView: handleFieldView,
    onPress: toggleField,
    values,
  };

  const isFields = layout === "fields";
  const isUnchanged = requireChange && !form.formState.isDirty;

  return (
    <>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () =>
            showWheel
              ? [
                  {
                    label: t("profileForm.done"),
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
        onScroll={handleScroll}
        ref={scrollViewRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Tap-outside-to-dismiss only; keep the fields individually accessible */}
        <Pressable
          accessible={false}
          onPress={handleBackgroundPress}
          className="w-full flex-1"
        >
          <View
            className={cn(
              "flex flex-col items-stretch justify-center",
              isFields ? "gap-sm p-sm" : "gap-8 p-6"
            )}
          >
            {heading}

            {showNames ? (
              <>
                <NameField
                  control={form.control}
                  disabled={isFormSubmitting}
                  name="firstName"
                  onFocus={handleNameFocus}
                />
                <NameField
                  control={form.control}
                  disabled={isFormSubmitting}
                  name="lastName"
                  onFocus={handleNameFocus}
                />
              </>
            ) : null}

            <View className="flex flex-col items-stretch justify-center gap-2">
              <View className="flex flex-col items-start justify-start gap-0">
                {isFields ? (
                  <Label>{t("profileForm.gender")}</Label>
                ) : (
                  <H4>{t("profileForm.gender")}</H4>
                )}
                {!isFields && form.formState.errors.gender ? (
                  <ErrorMessage>
                    {form.formState.errors.gender.message}
                  </ErrorMessage>
                ) : null}
              </View>

              <Controller
                control={form.control}
                name="gender"
                render={renderGenderField}
              />

              {isFields && form.formState.errors.gender ? (
                <ErrorMessage>
                  {form.formState.errors.gender.message}
                </ErrorMessage>
              ) : null}
            </View>

            {isFields ? (
              <ParameterFields {...parameters} />
            ) : (
              <ParameterRows {...parameters} />
            )}

            {footer}
          </View>
        </Pressable>
      </ScrollView>

      <ScopedVariables
        variables={{ "--profile-footer-bottom": Math.max(24, insets.bottom) }}
      >
        <View
          ref={footerRef}
          className={cn(
            "flex flex-col items-stretch justify-center gap-1",
            isFields ? "p-sm" : "p-6",
            "pb-(--profile-footer-bottom)"
          )}
        >
          <Button
            icon={submitSystemImage}
            iconPosition="trailing"
            disabled={isUnchanged}
            isLoading={isFormSubmitting}
            label={submitLabel}
            onPress={() => {
              void form.handleSubmit(onSubmit, (errors) => {
                // A field's error can sit under the Save bar: show the first.
                const field = PROFILE_FIELDS.find((name) => errors[name]);

                if (field && isFields) {
                  // Once the error under it has laid out.
                  setTimeout(() => revealField(field), 50);
                }
              })();
            }}
            size="lg"
            testID={submitTestID}
          />
        </View>
      </ScopedVariables>
      <Animated.View className="overflow-hidden" style={[animatedStyle]}>
        <View className="flex flex-1 flex-row items-stretch justify-stretch gap-0 px-4">
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
        </View>
      </Animated.View>
    </>
  );
};

export default ProfileForm;
