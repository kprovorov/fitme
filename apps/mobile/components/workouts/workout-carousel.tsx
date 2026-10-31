import type { Plan } from "@fitme/core";
import { useEffect, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  useWindowDimensions,
  View,
} from "react-native";
import { findOpenSession } from "~/hooks/start-workout";
import { cn } from "~/lib/utils";
import WorkoutCarouselCard from "./workout-carousel-card";

/** The `sm` spacing token: each card's inset from the screen's edges. */
const CARD_INSET = 16;
/** The `xs` spacing token: the gap between cards, where the next one peeks. */
const CARD_GAP = 8;

interface WorkoutCarouselProps {
  plan: Plan;
}

/**
 * The Plan's Workouts as cards paged one at a time (Figma `Routines`), the
 * Next Workout first, then the rest in rotation order; a Workout with an open
 * Workout Session (at most one, ADR 0013) goes ahead of them all. It runs edge to edge,
 * out of the Workout tab's gutters, each card `sm` from the screen's edges
 * with the next one peeking, and dots under it mark the page.
 */
export default function WorkoutCarousel({ plan }: WorkoutCarouselProps) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollView = useRef<ScrollViewInstance>(null);
  // A copy: plan.workouts is the query cache's array, never sorted in place.
  // The rotation's first Workout is the Next one, after the open session's.
  const workouts = [...plan.workouts].sort(
    (a, b) =>
      Number(Boolean(findOpenSession(b))) -
        Number(Boolean(findOpenSession(a))) || a.order - b.order
  );
  // A session opened from a later card moves that card to the front: scroll
  // back to it, or the card now at the old offset shows instead.
  const openWorkoutId = workouts.find(findOpenSession)?.id ?? null;
  useEffect(() => {
    if (openWorkoutId) {
      scrollView.current?.scrollTo({ animated: false, x: 0 });
      setPage(0);
    }
  }, [openWorkoutId]);
  // The page scrolled to, kept in range when the Plan's Workouts change.
  const shownPage = Math.min(page, workouts.length - 1);
  const cardWidth = width - 2 * CARD_INSET;
  const pageWidth = cardWidth + CARD_GAP;

  const onScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <View className="-mx-md gap-sm">
      <ScrollView
        contentContainerClassName="gap-xs px-sm"
        decelerationRate="fast"
        disableIntervalMomentum
        horizontal
        onScroll={onScroll}
        ref={scrollView}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageWidth}
        testID="workout-carousel"
      >
        {workouts.map((workout) => (
          <View key={workout.id} style={{ width: cardWidth }}>
            <WorkoutCarouselCard
              durationMinutes={plan.workout_duration}
              width={cardWidth}
              workout={workout}
            />
          </View>
        ))}
      </ScrollView>
      {workouts.length > 1 ? (
        <View
          accessibilityElementsHidden
          className="flex-row justify-center gap-2"
          importantForAccessibility="no-hide-descendants"
        >
          {workouts.map((workout, index) => (
            <View
              className={cn(
                "size-2 rounded-full",
                index === shownPage ? "bg-foreground" : "bg-muted-foreground/40"
              )}
              key={workout.id}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
