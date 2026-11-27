import { useQueryClient } from "@tanstack/react-query";
import { usePreventRemove } from "expo-router";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Alert, Pressable, View } from "react-native";

import { SET_NUMBER_COLUMN_CLASS } from "~/components/forms/workout-exercise-set-form";
import { Text } from "~/components/ui/text";
import { isSessionMovingOn } from "~/hooks/ending-workout-session";
import { useSaveWorkoutSessionSetNoteMutation } from "~/hooks/mutations/workout-session-set-notes";
import { useAskToDiscardNote } from "~/hooks/note-editing";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import type { WorkoutSession } from "~/hooks/queries/workout-sessions";
import { hasRefusingSessionEnded } from "~/hooks/refused-session-write";
import {
  noteSaveFailureOf,
  savedNoteOf,
  withinNoteLimit,
} from "~/lib/note-drafts";
import type { NoteSaveFailure } from "~/lib/note-drafts";

import { NoteEditor } from "./note-editor";

/**
 * What Sentry's touch breadcrumbs name a touch on a set's note by. It reads a
 * `sentry-label` before the accessibility label, which holds the note's text.
 */
export const SET_NOTE_SENTRY_LABEL = "set-note";

/** Brings a one-line note's 22 pt to the 44 pt tap target (Figma's rules). */
const TAP_TARGET_SLOP = { bottom: 11, top: 11 };

/**
 * The line under a logged set's row, aligned to its target column (Figma's
 * SetNote): its first cell's width is left empty, the rest is `children`.
 */
export const SetNoteLine = ({ children }: { children: ReactNode }) => (
  <View className="gap-xs flex-row">
    <View className={SET_NUMBER_COLUMN_CLASS} />
    <View className="gap-xs flex-1 pt-0.5">{children}</View>
  </View>
);

/**
 * A set's note as read: the whole text (the Workout Session Exercise screen)
 * or its first `numberOfLines` lines (the Workout Session's cards). With
 * `onEdit`, it's a button opening the editor; without (a finished Workout
 * Session), just the text.
 */
export const SetNoteText = ({
  note,
  number,
  numberOfLines,
  onEdit,
}: {
  note: string;
  /** Its set's position, for VoiceOver. */
  number: number;
  numberOfLines?: number;
  onEdit?: () => void;
}) => {
  const { t } = useTranslation();

  const text = (
    <Text className="text-subhead" numberOfLines={numberOfLines}>
      {note}
    </Text>
  );

  const label = t("notes.spoken.setNote", { note, order: number });

  if (!onEdit) {
    return (
      <View
        accessibilityLabel={label}
        accessible
        sentry-label={SET_NOTE_SENTRY_LABEL}
        testID={`set-note-${number}`}
      >
        {text}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={t("notes.spoken.editSetNoteHint", { order: number })}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={TAP_TARGET_SLOP}
      onPress={onEdit}
      sentry-label={SET_NOTE_SENTRY_LABEL}
      testID={`set-note-${number}`}
    >
      {text}
    </Pressable>
  );
};

interface SetNoteEditorProps {
  /** The note as read, `null` for none. */
  note: string | null;
  /** Its set's position, for VoiceOver and the test IDs. */
  number: number;
  /** Tells whether it holds text not saved yet. */
  onChangedChange: (changed: boolean) => void;
  /** Closes the editor: saved, cancelled, or the set gone. */
  onClose: () => void;
  /** A save answered 429: the wait, in seconds, kept by the row. */
  onRateLimited: (seconds: number) => void;
  /** Reads the Workout Session again: the set has gone, or isn't logged. */
  onSetGone: () => void;
  sessionId: string;
  setId: string;
  /**
   * A 429's wait, in seconds, while it lasts. Kept by the row, so closing and
   * reopening the editor doesn't skip it.
   */
  waitSeconds: number | null;
}

/**
 * A set's note being written (Figma's SetNote Editing): starts from the note
 * as read, saves the whole text (blank clears it), and closes once saved. A
 * failed save keeps the text with its error, a 429 its wait. A set that's
 * gone (404) or no longer logged (409 `set_not_logged`) says so in an alert,
 * since the row may go with the read, and the session is read again; a 404
 * whose Workout Session has ended says nothing, its screens moving on. Cancel
 * and leaving with unsaved text ask first, but for its Workout Session's
 * screens moving on by themselves (`isSessionMovingOn`).
 */
export const SetNoteEditor = ({
  note,
  number,
  onChangedChange,
  onClose,
  onRateLimited,
  onSetGone,
  sessionId,
  setId,
  waitSeconds,
}: SetNoteEditorProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isPending, mutate } = useSaveWorkoutSessionSetNoteMutation();
  const [draft, setDraft] = useState(note ?? "");
  const [failure, setFailure] = useState<NoteSaveFailure | null>(null);
  const askToDiscard = useAskToDiscardNote();
  const isChanged = savedNoteOf(draft) !== note;

  // Held while a save is on its way too: it can still fail, and the text
  // would go with the Screen.
  usePreventRemove(isChanged, ({ data, repeat }) => {
    // Finished, here (Finish moves on to its Summary) or elsewhere: unsaved
    // text goes, as the sets' unsaved input does.
    const isFinished = !!queryClient.getQueryData<WorkoutSession>(
      useWorkoutSessionQuery.getKey({ sessionId })
    )?.finished_at;

    if (isFinished || isSessionMovingOn(data.action)) {
      repeat();
    } else {
      askToDiscard(repeat);
    }
  });

  const cancel = useCallback(() => {
    if (isChanged) {
      askToDiscard(onClose);
    } else {
      onClose();
    }
  }, [askToDiscard, isChanged, onClose]);

  const changeDraft = useCallback(
    (text: string) => {
      const kept = withinNoteLimit(text);
      setDraft(kept);
      onChangedChange(savedNoteOf(kept) !== note);
    },
    [note, onChangedChange]
  );

  const refuse = useCallback(
    async (error: Error, shown: NoteSaveFailure) => {
      // Gone with its Workout Session: its screens move on, nothing to say.
      if (await hasRefusingSessionEnded(queryClient, sessionId, error)) {
        return;
      }

      onClose();
      Alert.alert(t(`notes.errors.${shown.kind}`));

      onSetGone();
    },
    [onClose, onSetGone, queryClient, sessionId, t]
  );

  const save = useCallback(() => {
    if (waitSeconds !== null) {
      return;
    }

    setFailure(null);
    mutate(
      { note: draft, sessionId, setId },
      {
        onError: (saveError) => {
          const shown = noteSaveFailureOf(saveError, "set");

          if (shown.kind === "setGone" || shown.kind === "setNotLogged") {
            void refuse(saveError, shown);

            return;
          }

          if (shown.kind === "rateLimited") {
            onRateLimited(shown.seconds);
          } else {
            setFailure(shown);
          }

          AccessibilityInfo.announceForAccessibility(
            shown.kind === "rateLimited"
              ? t("notes.spoken.rateLimited", { count: shown.seconds })
              : t(`notes.errors.${shown.kind}`)
          );
        },
        onSuccess: (saved) => {
          onClose();
          AccessibilityInfo.announceForAccessibility(
            saved.note === null
              ? t("notes.spoken.cleared")
              : t("notes.spoken.saved")
          );
        },
      }
    );
  }, [
    draft,
    mutate,
    onClose,
    refuse,
    sessionId,
    setId,
    onRateLimited,
    t,
    waitSeconds,
  ]);

  return (
    <NoteEditor
      accessibilityLabel={t("notes.spoken.setField", { order: number })}
      draft={draft}
      failure={failure}
      isChanged={isChanged}
      isPending={isPending}
      onCancel={cancel}
      onChange={changeDraft}
      onSave={save}
      placeholder={t("notes.placeholder.set")}
      sentryLabel={SET_NOTE_SENTRY_LABEL}
      testIDPrefix={`set-note-${number}`}
      waitSeconds={waitSeconds}
    />
  );
};

interface SetNoteProps extends Omit<SetNoteEditorProps, "note" | "setId"> {
  /** Whether it can be written: not in a finished Workout Session. */
  canEdit: boolean;
  /** Whether its editor is open. */
  isOpen: boolean;
  /** The note as read, `null` for none. */
  note: string | null;
  /** How many lines of it show; all of them without. */
  numberOfLines?: number;
  onOpen: () => void;
  /** The logged set's id, `null` for a set that takes no note. */
  setId: string | null;
}

/**
 * A logged set's note under its row (Figma's SetNote): its editor while
 * open, the note as read otherwise, nothing for a set without one or one
 * that takes none.
 */
export const SetNote = ({
  canEdit,
  isOpen,
  note,
  number,
  numberOfLines,
  onOpen,
  setId,
  ...editor
}: SetNoteProps) => {
  if (setId !== null && canEdit && isOpen) {
    return (
      <SetNoteLine>
        <SetNoteEditor {...editor} note={note} number={number} setId={setId} />
      </SetNoteLine>
    );
  }

  if (setId === null || note === null) {
    return null;
  }

  return (
    <SetNoteLine>
      <SetNoteText
        note={note}
        number={number}
        numberOfLines={numberOfLines}
        onEdit={canEdit ? onOpen : undefined}
      />
    </SetNoteLine>
  );
};
