import React, { useState, useRef, useCallback } from "react";
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
import {
  Pressable,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { WheelSelect } from "~/components/ui/wheel-select";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import { ArrowLeft } from "~/lib/icons/ArrowLeft";
import { GenderSwitch } from "~/components/ui/gender-switch";
import { ErrorMessage } from "~/components/ui/error-message";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Picker } from "@react-native-picker/picker";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Separator } from "~/components/ui/separator";

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
      // age: user?.profile?.age ?? 0,
      // weight: user?.profile?.weight ?? 0,
      // height: user?.profile?.height ?? 0,
      age: undefined,
      weight: undefined,
      height: undefined,
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

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        <HStack className="px-6 py-0 justify-between items-center">
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
          {showWheel && (
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
          )}
        </HStack>
        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
          <VStack className="p-6 items-center justify-center gap-4">
            <VStack className="gap-2">
              <H2>Let's get to know you!</H2>
              <Text className="text-center">
                We'll use this information to personalize your experience.
              </Text>
            </VStack>
            {!!user && (
              <TouchableWithoutFeedback
                onPress={() => {
                  if (fieldFocused) {
                    toggleWheel(false);
                    setFieldFocused(null);
                  }
                }}
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
                              : "text-muted-foreground"
                          )}
                        >
                          {form.getValues("weight")
                            ? `${form.getValues("weight")} kg`
                            : "Not Set"}
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
                              : "text-muted-foreground"
                          )}
                        >
                          {form.getValues("height")
                            ? `${form.getValues("height")} cm`
                            : "Not Set"}
                        </Text>
                      </HStack>
                    </Pressable>
                  </VStack>
                </VStack>
              </TouchableWithoutFeedback>
            )}
          </VStack>
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
                  className="flex-1 border-2 h-12"
                >
                  {Array.from({ length: 150 }, (_, i) => (
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
                  className="flex-1 border-2 h-12"
                >
                  {Array.from({ length: 500 }, (_, i) => (
                    <Picker.Item label={`${i} kg`} value={i} key={i} />
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
                <Picker
                  selectedValue={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.trigger("height");
                  }}
                  className="flex-1 border-2 h-12"
                >
                  {Array.from({ length: 500 }, (_, i) => (
                    <Picker.Item label={`${i} cm`} value={i} key={i} />
                  ))}
                </Picker>
              )}
            />
          )}
        </Animated.View>
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
