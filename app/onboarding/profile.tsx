import React, { useState, useRef, useEffect } from "react";
import { H2, H4 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useNavigation } from "expo-router";
import { useStoreProfileMutation } from "~/hooks/mutations/profiles";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  Pressable,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";
import { GenderSwitch } from "~/components/ui/gender-switch";
import { ErrorMessage } from "~/components/ui/error-message";
import { Picker } from "@react-native-picker/picker";
import { cn, range } from "~/lib/utils";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Separator } from "~/components/ui/separator";

export type ProfileFormValues = z.infer<typeof formSchema>;

const formSchema = z.object({
  gender: z.enum(["male", "female"], {
    message: "Gender is required",
  }),
  age: z.coerce
    .number({
      message: "Age is required",
    })
    .min(4)
    .max(150),
  weight: z.coerce
    .number({
      message: "Weight is required",
    })
    .min(1)
    .max(500),
  height: z.coerce
    .number({
      message: "Height is required",
    })
    .min(1)
    .max(500),
});

export default function ProfileScreen() {
  const { data: user } = useCurrentUserQuery();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gender: user?.profile?.gender,
      age: user?.profile?.age ?? undefined,
      weight: user?.profile?.weight ?? undefined,
      height: user?.profile?.height ?? undefined,
    },
  });

  const scrollViewRef = useRef<ScrollView>(null);

  const [heightFeet, setHeightFeet] = useState(0);
  const [heightInches, setHeightInches] = useState(0);

  const [fieldFocused, setFieldFocused] = useState<
    "age" | "weight" | "height" | null
  >(null);

  const [activeWheel, setActiveWheel] = useState<
    "age" | "weight" | "height" | null
  >(null);

  const [showWheel, setShowWheel] = useState(false);

  const wheelHeight = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    height: wheelHeight.value,
  }));

  const toggleWheel = (show?: boolean) => {
    const next = show ?? !showWheel;
    setShowWheel(next);
    wheelHeight.value = withTiming(next ? 200 : 0, {
      duration: 150,
    });

    if (next) {
      // Small delay to ensure animation is complete
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 160);
    }
  };

  const { mutateAsync: storeProfile, isPending: isStoringProfilePending } =
    useStoreProfileMutation({
      onSuccess: () => {
        router.push("/onboarding/plan");
      },
    });

  const getWeightUnit = () => {
    switch (user?.measurement_system) {
      case "metric":
        return "kg";
      case "us":
      case "uk":
        return "lbs";
      default:
        return "kg";
    }
  };

  const getHeightUnit = () => {
    switch (user?.measurement_system) {
      case "metric":
        return "cm";
      case "us":
      case "uk":
        return "ft";
      default:
        return "cm";
    }
  };

  const formatWeight = (weight: number) => {
    if (!weight) return "Not Set";
    return `${weight} ${getWeightUnit()}`;
  };

  const formatHeight = (height: number) => {
    if (!height) return "Not Set";
    if (user?.measurement_system === "metric") {
      return `${height} cm`;
    } else {
      const feet = Math.floor(height / 12);
      const inches = Math.round(height % 12);
      return `${feet}′ ${inches}″`;
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            showWheel && (
              <Button
                variant="link"
                onPress={() => {
                  toggleWheel();
                  setFieldFocused(null);
                }}
              >
                <Text className="text-primary font-nunito-sans-bold no-underline">
                  Done
                </Text>
              </Button>
            ),
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
            {!!user && (
              <TouchableWithoutFeedback
                className="flex-1 w-full"
                onPress={() => {
                  if (fieldFocused) {
                    toggleWheel(false);
                    setFieldFocused(null);
                  }
                }}
              >
                <VStack className="p-6 items-stretch justify-center gap-8">
                  <VStack className="gap-2">
                    <H2>Let's get to know you!</H2>
                    <Text className="text-center">
                      We'll use this information to personalize your experience.
                    </Text>
                  </VStack>
                  <VStack className="items-stretch gap-2">
                    <VStack className="gap-0 justify-start items-start">
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
                        <GenderSwitch
                          value={value}
                          onValueChange={onChange}
                          className="flex flex-row gap-4 justify-stretch items-stretch"
                        />
                      )}
                    />
                  </VStack>

                  <VStack className="items-stretch gap-2">
                    <VStack className="gap-0 justify-start items-start">
                      <H4>Body Measurements</H4>
                      {["age", "weight", "height"].map((field) => (
                        <VStack key={field}>
                          {form.formState.errors[
                            field as keyof ProfileFormValues
                          ] && (
                            <ErrorMessage>
                              {
                                form.formState.errors[
                                  field as keyof ProfileFormValues
                                ]?.message
                              }
                            </ErrorMessage>
                          )}
                        </VStack>
                      ))}
                    </VStack>

                    <VStack className="bg-card rounded-lg items-stretch gap-0">
                      <Pressable
                        onPress={() => {
                          if (fieldFocused === "age") {
                            toggleWheel(false);
                            setFieldFocused(null);
                          } else {
                            toggleWheel(true);
                            setFieldFocused("age");
                            setActiveWheel("age");
                          }
                        }}
                      >
                        <HStack className="flex-1 justify-between p-3">
                          <Text>Age</Text>
                          <Text
                            className={cn(
                              fieldFocused === "age"
                                ? "text-primary"
                                : form.formState.errors.age
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}
                          >
                            {form.getValues("age")
                              ? `${form.getValues("age")} y.o.`
                              : "Not Set"}
                          </Text>
                        </HStack>
                      </Pressable>

                      <Separator />

                      <Pressable
                        onPress={() => {
                          if (fieldFocused === "weight") {
                            toggleWheel(false);
                            setFieldFocused(null);
                          } else {
                            toggleWheel(true);
                            setFieldFocused("weight");
                            setActiveWheel("weight");
                          }
                        }}
                      >
                        <HStack className="flex-1 justify-between p-3">
                          <Text>Weight</Text>
                          <Text
                            className={cn(
                              fieldFocused === "weight"
                                ? "text-primary"
                                : form.formState.errors.weight
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatWeight(form.getValues("weight"))}
                          </Text>
                        </HStack>
                      </Pressable>

                      <Separator />

                      <Pressable
                        onPress={() => {
                          if (fieldFocused === "height") {
                            toggleWheel(false);
                            setFieldFocused(null);
                          } else {
                            toggleWheel(true);
                            setFieldFocused("height");
                            setActiveWheel("height");
                          }
                        }}
                      >
                        <HStack className="flex-1 justify-between p-3">
                          <Text>Height</Text>
                          <Text
                            className={cn(
                              fieldFocused === "height"
                                ? "text-primary"
                                : form.formState.errors.height
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatHeight(form.getValues("height"))}
                          </Text>
                        </HStack>
                      </Pressable>
                    </VStack>
                  </VStack>
                </VStack>
              </TouchableWithoutFeedback>
            )}
          </ScrollView>

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
          <Animated.View style={[animatedStyle]} className="overflow-hidden">
            <HStack className="flex-1 justify-stretch items-stretch px-4 gap-0">
              {activeWheel === "age" && (
                <Controller
                  control={form.control}
                  name="age"
                  render={({ field, fieldState, formState }) => (
                    <Picker
                      selectedValue={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.trigger("age");
                      }}
                      style={{ flex: 1 }}
                    >
                      {range(4, 150).map((i) => (
                        <Picker.Item label={`${i}`} value={i} key={i} />
                      ))}
                    </Picker>
                  )}
                />
              )}
              {activeWheel === "weight" && (
                <Controller
                  control={form.control}
                  name="weight"
                  render={({ field, fieldState, formState }) => (
                    <Picker
                      selectedValue={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.trigger("weight");
                      }}
                      style={{ flex: 1 }}
                    >
                      {range(
                        1,
                        user?.measurement_system === "metric" ? 454 : 1000
                      ).map((i) => (
                        <Picker.Item
                          label={`${i} ${getWeightUnit()}`}
                          value={i}
                          key={i}
                        />
                      ))}
                    </Picker>
                  )}
                />
              )}
              {activeWheel === "height" && (
                <Controller
                  control={form.control}
                  name="height"
                  render={({ field, fieldState, formState }) => (
                    <>
                      {user?.measurement_system === "metric" ? (
                        <Picker
                          selectedValue={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            form.trigger("height");
                          }}
                          style={{ flex: 1 }}
                        >
                          {range(30, 275).map((i) => (
                            <Picker.Item label={`${i} cm`} value={i} key={i} />
                          ))}
                        </Picker>
                      ) : (
                        <>
                          <Picker
                            selectedValue={heightFeet}
                            onValueChange={(v) => {
                              setHeightFeet(v);
                              field.onChange(
                                parseInt(v.toString()) * 12 +
                                  parseInt(heightInches.toString())
                              );
                              form.trigger("height");
                            }}
                            style={{ flex: 1 }}
                          >
                            {range(1, 9).map((i) => (
                              <Picker.Item
                                label={`${i} ft`}
                                value={i}
                                key={i}
                              />
                            ))}
                          </Picker>
                          <Picker
                            selectedValue={heightInches}
                            onValueChange={(v) => {
                              setHeightInches(v);
                              field.onChange(
                                parseInt(heightFeet.toString()) * 12 +
                                  parseInt(v.toString())
                              );
                              form.trigger("height");
                            }}
                            style={{ flex: 1 }}
                          >
                            {range(0, 11).map((i) => (
                              <Picker.Item
                                label={`${i} in`}
                                value={i}
                                key={i}
                              />
                            ))}
                          </Picker>
                        </>
                      )}
                    </>
                  )}
                />
              )}
            </HStack>
          </Animated.View>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
