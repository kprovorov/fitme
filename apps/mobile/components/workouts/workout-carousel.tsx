import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from "react-native";
import { ScopedVariables } from "uniwind";

import type { FullPlan } from "~/hooks/queries/plans";
import { useOpenWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { cn } from "~/lib/utils";

import WorkoutCarouselCard from "./workout-carousel-card";

/** The `sm` spacing token: each card's inset from the screen's edges. */
const CARD_INSET = 16;

/** The `xs` spacing token: the gap between cards, where the next one peeks. */
const CARD_GAP = 8;

interface WorkoutCarouselProps {
  plan: FullPlan;
}

/**
 * The Plan's Workouts as cards paged one at a time (Figma `Routines`), the
 * Next Workout first, then the rest in rotation order; a Workout with an open
 * Workout Session (at most one, ADR 0013) goes ahead of them all. It runs edge to edge,
 * out of the Workout tab's gutters, each card `sm` from the screen's edges
 * with the next one peeking, and dots under it mark the page.
 */
const WorkoutCarousel = ({ plan }: WorkoutCarouselProps) => {
  const { width } = useWindowDimensions();
  const scrollView = useRef<ScrollViewInstance>(null);
  const { data: openSession } = useOpenWorkoutSessionQuery();

  // The open Workout Session's Workout, if it's one of this Plan's.
  const openWorkoutId =
    plan.workouts.find(({ id }) => id === openSession?.workout?.id)?.id ?? null;

  const [position, setPosition] = useState({ openWorkoutId, page: 0 });

  if (position.openWorkoutId !== openWorkoutId) {
    setPosition({ openWorkoutId, page: openWorkoutId ? 0 : position.page });
  }

  const isOpen = (workoutId: string) => Number(workoutId === openWorkoutId);

  // A copy: plan.workouts is the query cache's array, never sorted in place.
  // The rotation's first Workout is the Next one, after the open session's.
  const workouts = plan.workouts.toSorted(
    (a, b) => isOpen(b.id) - isOpen(a.id) || a.order - b.order
  );

  // A session opened from a later card moves that card to the front: scroll
  // back to it, or the card now at the old offset shows instead.
  useEffect(() => {
    if (openWorkoutId) {
      scrollView.current?.scrollTo({ animated: false, x: 0 });
    }
  }, [openWorkoutId]);
  // The page scrolled to, kept in range when the Plan's Workouts change.
  const shownPage = Math.min(position.page, workouts.length - 1);
  const cardWidth = width - 2 * CARD_INSET;
  const pageWidth = cardWidth + CARD_GAP;

  const onScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPosition({
      openWorkoutId,
      page: Math.round(nativeEvent.contentOffset.x / pageWidth),
    });
  };

  return (
    <View className="-mx-sm gap-sm">
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
          <ScopedVariables
            key={workout.id}
            variables={{ "--carousel-card-width": cardWidth }}
          >
            <View className="w-(--carousel-card-width)">
              <WorkoutCarouselCard
                durationMinutes={plan.workout_duration}
                planId={plan.id}
                width={cardWidth}
                workout={workout}
              />
            </View>
          </ScopedVariables>
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
};

export default WorkoutCarousel;
