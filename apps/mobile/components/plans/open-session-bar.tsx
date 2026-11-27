import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

const twoDigits = (value: number) => value.toString().padStart(2, "0");

/** `hh:mm:ss` since `startedAt`. */
const elapsedSince = (startedAt: string) => {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / MS_PER_SECOND)
  );

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);

  return [
    Math.floor(minutes / MINUTES_PER_HOUR),
    minutes % MINUTES_PER_HOUR,
    seconds % SECONDS_PER_MINUTE,
  ]
    .map(twoDigits)
    .join(":");
};

interface OpenSessionBarProps {
  /** Where pressing it goes: the open Workout Session's screen. */
  href: string;
  /** When the open Workout Session started, which the timer counts from. */
  startedAt: string;
}

/**
 * The lime bar on a Workout of the Plan screen whose Workout Session is
 * open: a timer counting from its start, and "To Workout" opening it. The
 * timer reads blank for its first second, as it always has.
 */
const OpenSessionBar = ({ href, startedAt }: OpenSessionBarProps) => {
  const { t } = useTranslation();
  const [elapsedTime, setElapsedTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(elapsedSince(startedAt));
    }, MS_PER_SECOND);

    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <Link asChild href={href}>
      <Pressable className="border-continuous bg-primary flex-row items-center justify-between rounded-xl px-3 py-2 active:opacity-80">
        <View className="flex flex-1 flex-row items-center justify-start gap-1">
          <SymbolImage
            className="text-primary-foreground text-subhead-emphasized"
            name="timer"
          />
          <Text className="text-primary-foreground text-mono-subhead-semibold">
            {elapsedTime}
          </Text>
        </View>

        <View className="flex flex-row items-center justify-center gap-1">
          <Text className="text-primary-foreground" variant="small">
            {t("workoutCard.toWorkout")}
          </Text>
          <SymbolImage
            className="text-primary-foreground text-subhead-emphasized"
            name="arrow.right"
          />
        </View>
      </Pressable>
    </Link>
  );
};

export default OpenSessionBar;
