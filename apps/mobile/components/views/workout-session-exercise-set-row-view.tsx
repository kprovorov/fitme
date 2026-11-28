import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import type { i18n as I18n, TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Alert, Keyboard, View } from "react-native";
import type { AccessibilityActionEvent } from "react-native";

import { SET_NOTE_SENTRY_LABEL, SetNote } from "~/components/notes/set-note";
import { SymbolImage } from "~/components/symbol-image";
import type { DropdownMenuItem } from "~/components/ui/dropdown-menu";
import { dropGoneAddedSet } from "~/hooks/added-sets";
import { reportWorkoutSetTracked } from "~/hooks/finish-workout-suggestion";
import { useNoteRateLimitWait } from "~/hooks/note-editing";
import { useOpenSetNote } from "~/hooks/open-set-note";
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
import type {
  PreviousSet,
  WorkoutSessionSet,
} from "~/hooks/queries/workout-sessions";
import { hasRefusingSessionEnded } from "~/hooks/refused-session-write";
import { analytics } from "~/lib/analytics";
import { isNotesEnabled } from "~/lib/feature-flags";
import { useI18n } from "~/lib/i18n";
import {
  describeSetTarget,
  formatSetTarget,
  formatSetWeight,
} from "~/lib/set-inputs";
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
  /**
   * How many lines of a set's note show (the Workout Session's cards, 2); the
   * whole note without.
   */
  noteLines?: number;
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
  /**
   * What the User did in the set with this row's number last time, shown in
   * place of the target; the target shows without one.
   */
  previousSet?: PreviousSet;
  /** A finished Workout Session: a set's note shows, but can't be edited. */
  readOnly?: boolean;
  sessionId: string;
  /** The User's weight unit, for the second cell. */
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
 * The row's second cell: the Previous set in the target's format (`12×45kg`,
 * `12` for bodyweight), else the set's target, else `–`.
 */
const formatComparedSet = (
  previousSet: PreviousSet | undefined,
  set: WorkoutSessionSet | null,
  weightLabel: string | undefined,
  i18n: ReturnType<typeof useI18n>
) => {
  if (previousSet) {
    return formatSetTarget(
      {
        reps_recommended: previousSet.reps_completed,
        weight_recommended: previousSet.weight_completed,
      },
      weightLabel,
      i18n
    );
  }

  return set ? formatSetTarget(set, weightLabel, i18n) : "–";
};

/**
 * How VoiceOver reads the second cell, since the column's header is hidden
 * from it: `Previous: 12 reps at 45 kg`, `Target: 10 reps at 100 kg`, or
 * `No previous set` for a row showing `–`.
 */
const describeComparedSet = (
  previousSet: PreviousSet | undefined,
  set: WorkoutSessionSet | null,
  weightLabel: string | undefined,
  i18n: ReturnType<typeof useI18n>
) => {
  if (previousSet) {
    return i18n.t("sets.previousSet", {
      set: describeSetTarget(
        {
          reps_recommended: previousSet.reps_completed,
          weight_recommended: previousSet.weight_completed,
        },
        weightLabel,
        i18n
      ),
    });
  }

  if (set && (set.reps_recommended || set.weight_recommended)) {
    return i18n.t("sets.targetSet", {
      set: describeSetTarget(set, weightLabel, i18n),
    });
  }

  return i18n.t("sets.noPreviousSet");
};

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
 * How VoiceOver reads a logged set with a note: its number, what was logged
 * and the note (`Set 2, logged. 12 reps at 45 kg. Note: …`).
 */
const describeLoggedSetWithNote = (
  number: number,
  logged: { reps: number | null; weight: number | null },
  note: string | null,
  weightLabel: string | undefined,
  i18n: I18n
) =>
  note === null
    ? undefined
    : i18n.t("sets.row.loggedWithNote", {
        note,
        order: number,
        result: describeSetTarget(
          { reps_recommended: logged.reps, weight_recommended: logged.weight },
          weightLabel,
          i18n
        ),
      });

/**
 * The row's first cell: its number, or ✓ once logged. VoiceOver and TalkBack
 * reach the swipe's Remove as an action on it: a plain View, since iOS reads
 * a text field's or a Text's actions from another element than the one
 * focused.
 */
const SetNumberCell = ({
  canRemove,
  loggedLabel,
  number,
  onRemove,
  showsLogged,
}: {
  canRemove: boolean;
  /** What VoiceOver reads for a logged set with a note: the note too. */
  loggedLabel?: string;
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
        accessibilityLabel={
          loggedLabel ?? t("sets.row.logged", { order: number })
        }
        accessible
        className={cn(SET_NUMBER_COLUMN_CLASS, "items-center")}
        onAccessibilityAction={handleAccessibilityAction}
        // Its label can hold the note's text, which Sentry's touch
        // breadcrumbs would otherwise take.
        sentry-label={loggedLabel ? SET_NOTE_SENTRY_LABEL : undefined}
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

/**
 * A logged set's note (behind the notes flag), one this row just logged
 * included, whose id the read may not have yet: what its line under the row
 * takes, and the ••• menu replacing the pencil (Edit Set, Add or Edit Note)
 * while it can be written (not in a finished Workout Session).
 */
const useLoggedSetNote = ({
  isDone,
  number,
  readOnly,
  savedSetId,
  set,
}: {
  isDone: boolean;
  number: number;
  readOnly: boolean;
  savedSetId: string | null;
  set: WorkoutSessionSet | null;
}) => {
  const { t } = useTranslation();
  const setId = isNotesEnabled() && isDone ? (set?.id ?? savedSetId) : null;
  const note = setId === null ? null : (set?.note ?? null);
  const canEdit = setId !== null && !readOnly;
  // A set no longer logged (or its Workout Session finished) closes its
  // editor rather than hiding it, so it never reopens by itself.
  const { close, isOpen: isOpenFor, open, setChanged } = useOpenSetNote();
  // A 429's wait outlives the editor: closing and reopening it keeps Save off.
  const [waitSeconds, setWaitSeconds] = useNoteRateLimitWait();
  const isOpen = canEdit && isOpenFor;

  useEffect(() => {
    if (!canEdit && isOpenFor) {
      close();
    }
  }, [canEdit, close, isOpenFor]);

  const menu = canEdit
    ? {
        accessibilityLabel: t("sets.row.more", { order: number }),
        items: (startEditing: () => void): DropdownMenuItem[] => [
          {
            label: t("sets.menu.editSet"),
            onPress: startEditing,
            systemImage: "pencil",
          },
          {
            label:
              note === null ? t("sets.menu.addNote") : t("sets.menu.editNote"),
            onPress: open,
            systemImage: "text.bubble",
          },
        ],
      }
    : undefined;

  return {
    /** Whether its note is being written or saved: the row doesn't swipe. */
    isWriting: isOpen,
    menu,
    props: {
      canEdit,
      isOpen,
      note,
      number,
      onChangedChange: setChanged,
      onClose: close,
      onOpen: open,
      onRateLimited: setWaitSeconds,
      setId,
      waitSeconds,
    },
  };
};

/**
 * A row's failed save: its message under the row (a 429 its wait), the
 * Workout Session read again at once when the refusal may mean it ended or
 * the set is gone, and `rereadSession` for the set's note too.
 */
const useSetSaveError = (
  exerciseId: string,
  workoutSessionExerciseSet: WorkoutSessionSet | null,
  sessionId: string
) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;
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

  const showSaveError = (error: Error) => {
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
  };

  const handleSaveError = (error: Error) => {
    // Finished elsewhere: read at once, so its screens move on to the
    // Summary without waiting for the next poll, and say nothing then.
    if (error instanceof ApiError && error.code === "session_finished") {
      void (async () => {
        if (!(await hasRefusingSessionEnded(queryClient, sessionId, error))) {
          showSaveError(error);
        }
      })();

      return;
    }

    showSaveError(error);

    // Removed elsewhere (an MCP client, Arnold, another device), or the
    // session gone, whose screens then close.
    if (error instanceof ApiError && error.code === "not_found") {
      void rereadSession();
    }
  };

  return { handleSaveError, rereadSession, saveError, setSaveError };
};

const WorkoutSessionExerciseSetRowView = ({
  exerciseId,
  initialValues,
  workoutSessionExerciseSet,
  locked = false,
  noteLines,
  number,
  onRemove,
  onSetCreated,
  onSetLogged,
  previousSet,
  readOnly = false,
  sessionId,
  weightLabel,
}: WorkoutSessionExerciseSetRowViewProps) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;
  // A submitted save to send `Set Tracked` for once it lands.
  const isTrackPending = useRef(false);
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
  // What the last save on this row created or logged, for its note.
  const [savedSetId, setSavedSetId] = useState<string | null>(null);
  const isDone = loggedReps !== null || justLogged;
  const isEditable = !isDone || isEditing;

  const { handleSaveError, rereadSession, saveError, setSaveError } =
    useSetSaveError(exerciseId, workoutSessionExerciseSet, sessionId);

  const trackSetCompleted = () => {
    if (isTrackPending.current) {
      void analytics.send("Set Tracked", { exercise_id: exerciseId });
      isTrackPending.current = false;
    }
  };

  // Shared by both saves: the set is logged, so lock the row and refresh.
  const handleSaved = (
    set: SavedWorkoutSessionExerciseSet,
    previousReps: number | null
  ) => {
    lastSaved.current = set;
    setSavedSetId(set.id);
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

    isTrackPending.current = true;
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

  const setNote = useLoggedSetNote({
    isDone,
    number,
    readOnly,
    savedSetId,
    set: workoutSessionExerciseSet,
  });

  // A set whose save is running never swipes: saving and removing it would
  // race. Nor while its note is written or saved (Figma's SetNote).
  const canRemove = !!onRemove && !isSaving && !setNote.isWriting;

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
            loggedLabel={describeLoggedSetWithNote(
              number,
              { reps: repsCompleted, weight: weightCompleted },
              setNote.props.note,
              weightLabel,
              i18n
            )}
            number={number}
            onRemove={remove}
            showsLogged={showsLogged}
          />
          <Text
            accessibilityLabel={describeComparedSet(
              previousSet,
              workoutSessionExerciseSet,
              weightLabel,
              i18n
            )}
            adjustsFontSizeToFit
            className="text-mono-body w-20 text-center"
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            numberOfLines={1}
            variant={showsLogged ? "muted" : "default"}
          >
            {formatComparedSet(
              previousSet,
              workoutSessionExerciseSet,
              weightLabel,
              i18n
            )}
          </Text>
        </>
      }
      loggedMenu={setNote.menu}
      onEdit={handleEdit}
      onSubmit={handleSubmit}
      recommendedValues={{
        reps: (repsCompleted ?? repsRecommended).toString(),
        weight: formatSetWeight(weightCompleted ?? weightRecommended, i18n),
      }}
      setIndex={number}
    />
  );

  // No gap: the note tucks into the row's own bottom air (Figma's SetNote,
  // 2 pt under the logged values), and the table's gap keeps the next row off.
  const row = (
    <View>
      {form}
      <SetNote
        {...setNote.props}
        numberOfLines={noteLines}
        onSetGone={() => {
          void rereadSession();
        }}
        sessionId={sessionId}
      />
    </View>
  );

  if (!onRemove) {
    return row;
  }

  return (
    <SetSwipeRow enabled={canRemove} number={number} onRemove={remove}>
      {row}
    </SetSwipeRow>
  );
};

export default WorkoutSessionExerciseSetRowView;
