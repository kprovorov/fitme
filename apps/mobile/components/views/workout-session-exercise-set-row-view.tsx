import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { TFunction } from "i18next";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Alert, Keyboard, View } from "react-native";
import type { AccessibilityActionEvent } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { dropGoneAddedSet } from "~/hooks/added-sets";
import { reportWorkoutSetTracked } from "~/hooks/finish-workout-suggestion";
import {
  useCreateWorkoutSessionExerciseSetMutation,
  useIsSavingSet,
  useUpdateWorkoutSessionExerciseSetMutation,
} from "~/hooks/queries/workout-session-exercise-sets";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import {
  useWorkoutSessionQuery,
  WORKOUT_SESSION_QUERY_KEY,
} from "~/hooks/queries/workout-sessions";
import type { WorkoutSessionSet } from "~/hooks/queries/workout-sessions";
import { IS_E2E } from "~/lib/constants";
import { useI18n } from "~/lib/i18n";
import { segmentClient } from "~/lib/segment";
import { formatSetTarget, formatSetWeight } from "~/lib/set-inputs";
import { cn } from "~/lib/utils";

import WorkoutSessionExerciseSetForm, {
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
} from "../forms/workout-exercise-set-form";
import type { WorkoutSessionExerciseSetFormValues } from "../forms/workout-exercise-set-form";
import { Text } from "../ui/text";
import SetSwipeRow from "../workout-sessions/set-swipe-row";

interface WorkoutSessionExerciseSetRowViewProps {
  exerciseId: string;
  /**
   * A set not saved yet: the reps and weight it starts from (the set before
   * it), 0 for each one not given.
   */
  initialValues?: { reps: number; weight: number };
  locked?: boolean;
  /** The row's number: its position in the Exercise, never the stored `order`. */
  number: number;
  /** Called once logging a set not saved yet has created it. */
  onSetCreated?: (set: SavedWorkoutSessionExerciseSet) => void;
  /**
   * Removes the row's set; swiping it left, or VoiceOver's action, calls it,
   * once the User has confirmed for a logged set. `logged` is whether it was
   * when the User acted, and `saved` what logging it on this row answered,
   * which the read may not have yet. None in a finished Workout Session.
   */
  onRemove?: (logged: boolean, saved?: SavedWorkoutSessionExerciseSet) => void;
  /** Called once a set is logged for the first time (not on edits). */
  onSetLogged?: (set: SavedWorkoutSessionExerciseSet) => void;
  sessionId: string;
  /** The User's weight unit, for the target cell. */
  weightLabel: string | undefined;
  workoutSessionExerciseSet: WorkoutSessionSet | null;
}

const getSetValues = (
  set: WorkoutSessionSet | null,
  initialValues: { reps: number; weight: number } | undefined
) => ({
  repsCompleted: set?.reps_completed ?? null,
  repsRecommended: set?.reps_recommended ?? initialValues?.reps ?? 0,
  weightCompleted: set?.weight_completed ?? null,
  weightRecommended: set?.weight_recommended ?? initialValues?.weight ?? 0,
});

/**
 * Asks before a logged set goes, a set being edited included, whose saved
 * values stay whatever is typed. Cancel and a dismissal run `keep`.
 */
const confirmLoggedSetRemoval = (
  t: TFunction,
  number: number,
  remove: () => void,
  keep?: () => void
) => {
  Keyboard.dismiss();
  Alert.alert(
    t("sets.remove.confirm.title", { order: number }),
    t("sets.remove.confirm.message"),
    [
      { onPress: () => keep?.(), style: "cancel", text: t("common.cancel") },
      {
        onPress: remove,
        style: "destructive",
        text: t("sets.remove.confirm.remove"),
      },
    ],
    { cancelable: true, onDismiss: () => keep?.() }
  );
};

/**
 * The row's first cell: its number, or ✓ once logged. VoiceOver and TalkBack
 * reach the swipe's Remove as an action on it: a plain View, since iOS reads
 * a text field's or a Text's actions from another element than the one
 * focused.
 */
const SetNumberCell = ({
  canRemove,
  number,
  onRemove,
  showsLogged,
}: {
  canRemove: boolean;
  number: number;
  onRemove: () => void;
  showsLogged: boolean;
}) => {
  const { t } = useTranslation();

  const accessibilityActions = canRemove
    ? [{ label: t("sets.row.remove", { order: number }), name: "remove" }]
    : undefined;

  const handleAccessibilityAction = ({
    nativeEvent,
  }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === "remove") {
      onRemove();
    }
  };

  if (showsLogged) {
    return (
      <View
        accessibilityActions={accessibilityActions}
        accessibilityLabel={t("sets.row.logged", { order: number })}
        accessible
        className={cn(SET_NUMBER_COLUMN_CLASS, "items-center")}
        onAccessibilityAction={handleAccessibilityAction}
        testID={`set-number-${number}`}
      >
        <SymbolImage
          className="text-body-emphasized text-primary"
          name="checkmark"
        />
      </View>
    );
  }

  return (
    <View
      accessibilityActions={accessibilityActions}
      accessible={canRemove}
      onAccessibilityAction={handleAccessibilityAction}
      testID={`set-number-${number}`}
    >
      <Text
        // At body size `#2` fills the column: shrink it at the largest text
        // sizes rather than wrap it onto a second line.
        adjustsFontSizeToFit
        className="text-mono-body w-7 text-center"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        numberOfLines={1}
      >
        #{number}
      </Text>
    </View>
  );
};

const WorkoutSessionExerciseSetRowView = ({
  exerciseId,
  initialValues,
  workoutSessionExerciseSet,
  locked = false,
  number,
  onRemove,
  onSetCreated,
  onSetLogged,
  sessionId,
  weightLabel,
}: WorkoutSessionExerciseSetRowViewProps) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;
  const pendingSetData = useRef<{ weight: number; reps: number } | null>(null);
  // Reps of the set when it was submitted, before the save: the query may
  // have refetched by the time the save succeeds.
  const previousRepsCompleted = useRef<number | null>(null);

  // What the last save on this row answered.
  const lastSaved = useRef<SavedWorkoutSessionExerciseSet | undefined>(
    undefined
  );

  // Whether the set is logged comes from the data, so a change made elsewhere
  // (a refetch, Arnold) shows up here. `justLogged` bridges the moment
  // between a successful save and the refetch that carries it.
  const loggedReps = isNewSet ? null : workoutSessionExerciseSet.reps_completed;
  const [justLogged, setJustLogged] = useState(false);
  const [seenReps, setSeenReps] = useState(loggedReps);

  if (loggedReps !== seenReps) {
    setSeenReps(loggedReps);
    setJustLogged(false);
  }

  const [isEditing, setIsEditing] = useState(false);
  const isDone = loggedReps !== null || justLogged;
  const isEditable = !isDone || isEditing;
  const [saveError, setSaveError] = useState<string | null>(null);

  // The read takes a set that's gone away; until one lands, or when it fails,
  // the row stays with its error.
  const rereadSession = async () => {
    const queryKey = useWorkoutSessionQuery.getKey({ sessionId });
    await queryClient.invalidateQueries({ queryKey });

    // A failed read, or one that never ran, leaves it invalidated.
    const read = queryClient.getQueryState(queryKey);

    if (!isNewSet && read?.status === "success" && !read.isInvalidated) {
      // Added here and never read: the phone's own copy would keep its row.
      dropGoneAddedSet(exerciseId, workoutSessionExerciseSet.id);
    }
  };

  const handleSaveError = (error: Error) => {
    const waitSeconds = rateLimitedFor(error);

    // Never the backend's message: the User can't act on a Postgres error.
    // Kept neutral, since a lost connection isn't the only way a save fails.
    const message =
      waitSeconds === null
        ? t("sets.errors.save")
        : t("sets.errors.rateLimited", { seconds: waitSeconds });

    setSaveError(message);
    // Focus stays on ✓, so a screen reader wouldn't read the new message.
    AccessibilityInfo.announceForAccessibility(message);

    // Removed elsewhere (an MCP client, Arnold, another device).
    if (error instanceof ApiError && error.code === "not_found") {
      void rereadSession();
    }
  };

  const trackSetCompleted = () => {
    if (!IS_E2E && pendingSetData.current) {
      void segmentClient.track("Set Tracked", {
        exercise_id: exerciseId,
        reps: pendingSetData.current.reps,
        weight: pendingSetData.current.weight,
      });
      pendingSetData.current = null;
    }
  };

  // Shared by both saves: the set is logged, so lock the row and refresh.
  const handleSaved = (
    set: SavedWorkoutSessionExerciseSet,
    previousReps: number | null
  ) => {
    lastSaved.current = set;
    reportWorkoutSetTracked({
      previousRepsCompleted: previousReps,
      sessionId,
      set,
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaveError(null);
    setIsEditing(false);
    setJustLogged(true);
    trackSetCompleted();

    void queryClient.invalidateQueries({
      queryKey: WORKOUT_SESSION_QUERY_KEY,
    });

    void queryClient.invalidateQueries({
      queryKey: ["exercise-history"],
    });

    if (previousReps === null) {
      onSetLogged?.(set);
    }
  };

  const { mutate: updateWorkoutSessionExerciseSet } =
    useUpdateWorkoutSessionExerciseSetMutation({
      onError: handleSaveError,
      onSuccess: (set) => handleSaved(set, previousRepsCompleted.current),
    });

  const { mutate: createWorkoutSessionExerciseSet } =
    useCreateWorkoutSessionExerciseSetMutation({
      onError: handleSaveError,
      onSuccess: (set) => {
        handleSaved(set, null);
        onSetCreated?.(set);
      },
    });

  const { weightRecommended, repsRecommended, weightCompleted, repsCompleted } =
    getSetValues(workoutSessionExerciseSet, initialValues);

  const handleEdit = () => setIsEditing(true);
  // A logged set reads as done until it's opened for editing.
  const showsLogged = isDone && !isEditing;

  const handleSubmit = (values: WorkoutSessionExerciseSetFormValues) => {
    // An empty field keeps what's shown as its placeholder: the logged value
    // when editing a logged set, otherwise the recommended one.
    const weight_completed =
      values.weight ?? weightCompleted ?? weightRecommended;

    const reps_completed = values.reps ?? repsCompleted ?? repsRecommended;

    pendingSetData.current = {
      reps: reps_completed,
      weight: weight_completed,
    };
    previousRepsCompleted.current = repsCompleted;

    if (isNewSet) {
      createWorkoutSessionExerciseSet({
        data: {
          reps_completed,
          weight_completed,
        },
        params: {
          exerciseId,
        },
      });
    } else {
      updateWorkoutSessionExerciseSet({
        data: {
          reps_completed,
          weight_completed,
        },
        params: {
          setId: workoutSessionExerciseSet.id,
        },
      });
    }
  };

  // A save of this set, from this row or the other screen's for the same set.
  const isSaving = useIsSavingSet(
    workoutSessionExerciseSet?.id ?? null,
    exerciseId
  );

  // A set whose save is running never swipes: saving and removing it would
  // race.
  const canRemove = !!onRemove && !isSaving;

  // `close` closes the row a swipe opened, should the User keep the set.
  const remove = (close?: () => void) => {
    if (!canRemove) {
      return;
    }

    // Whatever the set is now: logged or not elsewhere since the row opened.
    if (isDone) {
      confirmLoggedSetRemoval(
        t,
        number,
        () => onRemove(true, lastSaved.current),
        close
      );
    } else {
      onRemove(false);
    }
  };

  const form = (
    <WorkoutSessionExerciseSetForm
      // A logged set stays editable when an earlier one is still open: its
      // pencil would otherwise open a row nothing can save.
      disabled={!isEditable || (locked && !isDone)}
      error={saveError}
      isDone={isDone}
      isEditing={isEditable}
      leading={
        <>
          <SetNumberCell
            canRemove={canRemove}
            number={number}
            onRemove={remove}
            showsLogged={showsLogged}
          />
          <Text
            adjustsFontSizeToFit
            className="text-mono-body w-20 text-center"
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            numberOfLines={1}
            variant={showsLogged ? "muted" : "default"}
          >
            {isNewSet
              ? "–"
              : formatSetTarget(workoutSessionExerciseSet, weightLabel, i18n)}
          </Text>
        </>
      }
      onEdit={handleEdit}
      onSubmit={handleSubmit}
      recommendedValues={{
        reps: (repsCompleted ?? repsRecommended).toString(),
        weight: formatSetWeight(weightCompleted ?? weightRecommended, i18n),
      }}
      setIndex={number}
    />
  );

  if (!onRemove) {
    return form;
  }

  return (
    <SetSwipeRow enabled={canRemove} number={number} onRemove={remove}>
      {form}
    </SetSwipeRow>
  );
};

export default WorkoutSessionExerciseSetRowView;
