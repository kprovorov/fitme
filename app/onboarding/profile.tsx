import React, { useState } from "react";
import { H2, H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useStoreProfileMutation } from "~/hooks/mutations/profiles";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { TouchableWithoutFeedback, View } from "react-native";
import { WheelSelect } from "~/components/ui/wheel-select";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";
import { GenderSwitch } from "~/components/ui/gender-switch";
import { ErrorMessage } from "~/components/ui/error-message";

export type ProfileFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  gender: z.enum(["male", "female"]),
  age: z.coerce.number().min(4).max(150),
  weight: z.coerce.number().min(1).max(500),
  height: z.coerce.number().min(1).max(500),
});

export default function ProfileScreen() {
  const { data: user } = useCurrentUserQuery();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gender: user?.profile?.gender,
      age: user?.profile?.age ?? 0,
      weight: user?.profile?.weight ?? 0,
      height: user?.profile?.height ?? 0,
    },
  });

  const [heightFeet, setHeightFeet] = useState(0);
  const [heightInches, setHeightInches] = useState(0);
  const [isHeightFocused, setIsHeightFocused] = useState(false);

  const { mutateAsync: storeProfile, isPending: isStoringProfilePending } =
    useStoreProfileMutation({
      onSuccess: () => {
        router.push("/onboarding/plan");
      },
    });

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        <HStack className="px-6 py-3 justify-start items-start">
          <Button
            variant="secondary"
            size="icon-sm"
            onPress={() => router.back()}
            className="rounded-full"
          >
            <HStack className="gap-1">
              <ArrowLeft size={16} className="text-white" />
            </HStack>
          </Button>
        </HStack>
        <KeyboardAwareScrollView
          bottomOffset={62}
          showsVerticalScrollIndicator={false}
        >
          <VStack className="p-6 items-center justify-center gap-4">
            <VStack className="gap-2">
              <H2>Let's get to know you!</H2>
              <Text className="text-center">
                We'll use this information to personalize your experience.
              </Text>
            </VStack>
            {!!user && (
              <TouchableWithoutFeedback
                onPress={() => setIsHeightFocused(false)}
              >
                <VStack className="items-stretch w-full">
                  <VStack className="gap-0 justify-start items-start">
                    <H4>Gender</H4>
                    <Text className="text-sm text-muted-foreground">
                      What is your gender?
                    </Text>
                  </VStack>

                  <Controller
                    control={form.control}
                    name="gender"
                    render={({ field: { onChange, value } }) => (
                      <GenderSwitch
                        value={value}
                        onValueChange={onChange}
                        className="flex flex-row gap-4 justify-stretch items-stretch"
                      />
                    )}
                  />
                  {form.formState.errors.gender && (
                    <ErrorMessage>
                      {form.formState.errors.gender.message}
                    </ErrorMessage>
                  )}

                  <VStack className="gap-0 justify-start items-start">
                    <H4>Body Measurements</H4>
                    <Text className="text-sm text-muted-foreground">
                      What is your body measurements?
                    </Text>
                  </VStack>

                  <VStack className="gap-0 items-stretch rounded-md overflow-hidden">
                    <VStack className="gap-0 items-stretch">
                      <Controller
                        control={form.control}
                        name="age"
                        render={({ field: { onChange, onBlur, value } }) => (
                          <WheelSelect
                            label="Age"
                            value={value?.toString()}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            wheels={[
                              {
                                options: Array.from(
                                  { length: 100 },
                                  (_, i) => i
                                ).map((option) => ({
                                  label: `${option}`,
                                  value: option.toString(),
                                })),
                                selectedValue: value?.toString(),
                                onValueChange: (itemValue, itemIndex) => {
                                  onChange(parseInt(itemValue.toString()));
                                },
                              },
                            ]}
                          />
                        )}
                      />
                      {form.formState.errors.age && (
                        <Text className="text-red-500">
                          {form.formState.errors.age.message}
                        </Text>
                      )}
                    </VStack>

                    <VStack className="gap-0 items-stretch border-t border-foreground/5">
                      <Controller
                        control={form.control}
                        name="weight"
                        render={({ field: { onChange, onBlur, value } }) => (
                          <WheelSelect
                            label="Weight"
                            value={`${value} ${
                              user.measurement_system === "metric"
                                ? "kg"
                                : "lbs"
                            }`}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            wheels={[
                              {
                                options: Array.from(
                                  {
                                    length:
                                      user.measurement_system === "metric"
                                        ? 300
                                        : 600,
                                  },
                                  (_, i) => i
                                ).map((option) => ({
                                  label: `${option} ${
                                    user.measurement_system === "metric"
                                      ? "kg"
                                      : "lbs"
                                  }`,
                                  value: option.toString(),
                                })),
                                selectedValue: value?.toString(),
                                onValueChange: (itemValue, itemIndex) => {
                                  if (itemValue) {
                                    onChange(parseInt(itemValue.toString()));
                                  }
                                },
                              },
                            ]}
                          />
                        )}
                      />
                      {form.formState.errors.weight && (
                        <Text className="text-red-500">
                          {form.formState.errors.weight.message}
                        </Text>
                      )}
                    </VStack>

                    <VStack className="gap-0 items-stretch border-t border-foreground/5">
                      <Controller
                        control={form.control}
                        name="height"
                        render={({ field: { onChange, onBlur, value } }) =>
                          user.measurement_system === "metric" ? (
                            <WheelSelect
                              label="Height"
                              value={`${value?.toString()} cm`}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              wheels={[
                                {
                                  options: Array.from(
                                    { length: 201 },
                                    (_, i) => i + 50
                                  ).map((option) => ({
                                    label: `${option} cm`,
                                    value: option.toString(),
                                  })),
                                  selectedValue: value?.toString(),
                                  onValueChange: (itemValue, itemIndex) => {
                                    if (itemValue) {
                                      onChange(parseInt(itemValue.toString()));
                                    }
                                  },
                                },
                              ]}
                            />
                          ) : (
                            <WheelSelect
                              label="Height"
                              value={`${heightFeet}′ ${heightInches}″`}
                              onChangeText={onChange}
                              onBlur={onBlur}
                              wheels={[
                                {
                                  options: Array.from(
                                    { length: 10 },
                                    (_, i) => i
                                  ).map((option) => ({
                                    label: `${option}′`,
                                    value: option.toString(),
                                  })),
                                  selectedValue: heightFeet.toString(),
                                  onValueChange: (itemValue, itemIndex) => {
                                    setHeightFeet(
                                      parseInt(itemValue.toString())
                                    );
                                    if (itemValue) {
                                      onChange(
                                        parseInt(itemValue.toString()) * 12 +
                                          parseInt(heightInches.toString())
                                      );
                                    }
                                  },
                                },
                                {
                                  options: Array.from(
                                    { length: 12 },
                                    (_, i) => i
                                  ).map((option) => ({
                                    label: `${option}″`,
                                    value: option.toString(),
                                  })),
                                  selectedValue: heightInches.toString(),
                                  onValueChange: (itemValue, itemIndex) => {
                                    setHeightInches(
                                      parseInt(itemValue.toString())
                                    );
                                    if (itemValue) {
                                      onChange(
                                        parseInt(heightFeet.toString()) * 12 +
                                          parseInt(itemValue.toString())
                                      );
                                    }
                                  },
                                },
                              ]}
                            />
                          )
                        }
                      />
                      {form.formState.errors.height && (
                        <Text className="text-red-500">
                          {form.formState.errors.height.message}
                        </Text>
                      )}
                    </VStack>
                  </VStack>
                </VStack>
              </TouchableWithoutFeedback>
            )}
          </VStack>
        </KeyboardAwareScrollView>

        <VStack className="p-6 items-stretch gap-1">
          <Button
            disabled={form.formState.isSubmitting}
            onPress={form.handleSubmit((v) => storeProfile(v))}
          >
            {form.formState.isSubmitting ? (
              <View className="animate-spin">
                <LoaderCircle size={16} className="text-black" />
              </View>
            ) : (
              <HStack className="gap-2">
                <Text>Next</Text>
                <ArrowRight size={16} className="text-black" />
              </HStack>
            )}
          </Button>
        </VStack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// function RadioGroupItemWithLabel({
//   value,
//   label,
//   disabled,
//   isSelected,
//   onLabelPress,
// }: {
//   value: string;
//   label: string;
//   disabled: boolean;
//   isSelected: boolean;
//   onLabelPress: () => void;
// }) {
//   return (
//     <Pressable
//       className={`flex flex-row gap-2 bg-card rounded-lg p-4 flex-1 justify-start items-center border-2 ${
//         isSelected ? "border-primary" : "border-transparent"
//       } ${disabled ? "opacity-50" : ""}`}
//       onPress={() => !disabled && onLabelPress()}
//     >
//       <RadioGroupItem
//         aria-labelledby={`label-for-${value}`}
//         value={value}
//         disabled={disabled}
//       />
//       <Label
//         nativeID={`label-for-${value}`}
//         className={`text-base text-white font-nunito-sans-bold ${
//           disabled ? "opacity-50" : ""
//         }`}
//         onPress={() => !disabled && onLabelPress()}
//       >
//         {label}
//       </Label>
//     </Pressable>
//   );
// }
