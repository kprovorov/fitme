import { rateLimitedFor } from "@fitme/api-client";
import { usePreventRemove } from "expo-router";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H4, Muted } from "~/components/ui/typography";
import { useSaveExerciseNoteMutation } from "~/hooks/mutations/exercise-notes";
import {
  useAskToDiscardNote,
  useNoteRateLimitWait,
} from "~/hooks/note-editing";
import {
  exerciseNoteOn,
  useExerciseNotesQuery,
} from "~/hooks/queries/exercise-notes";
import {
  noteSaveFailureOf,
  savedNoteOf,
  withinNoteLimit,
} from "~/lib/note-drafts";
import type { NoteSaveFailure } from "~/lib/note-drafts";

import { NoteEditor } from "./note-editor";

/**
 * What Sentry's touch breadcrumbs name a touch on the note by. It reads a
 * `sentry-label` before the accessibility label, which holds the note's text.
 */
const SENTRY_LABEL = "exercise-note";

/** Brings Add Note's 28 pt line to the 44 pt tap target (Figma's rules). */
const TAP_TARGET_SLOP = { bottom: 8, top: 8 };

/** A failed read with nothing read: its message and Try Again. */
const NoteLoadError = ({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) => {
  const { t } = useTranslation();
  const waitSeconds = rateLimitedFor(error);

  return (
    <View className="gap-sm flex-row items-center">
      <SymbolImage
        className="text-footnote text-destructive shrink-0"
        name="exclamationmark.triangle.fill"
      />
      <Text className="text-footnote flex-1" testID="exercise-note-load-error">
        {waitSeconds === null
          ? t("notes.errors.load")
          : t("common.rateLimited", { seconds: waitSeconds })}
      </Text>
      <Button
        label={t("common.tryAgain")}
        onPress={onRetry}
        fill={false}
        size="sm"
        variant="secondary"
      />
    </View>
  );
};

/** The note as read: Add Note without one, the text and Edit with one. */
const NoteShown = ({
  exerciseName,
  note,
  onEdit,
}: {
  exerciseName: string;
  note: string | null;
  onEdit: () => void;
}) => {
  const { t } = useTranslation();

  if (note === null) {
    return (
      <Pressable
        accessibilityLabel={t("notes.spoken.add", { exercise: exerciseName })}
        accessibilityRole="button"
        className="gap-xs min-h-7 flex-row items-center self-start"
        hitSlop={TAP_TARGET_SLOP}
        onPress={onEdit}
        sentry-label={SENTRY_LABEL}
        testID="exercise-note-add"
      >
        <SymbolImage
          className="text-subhead text-muted-foreground"
          name="note.text"
        />
        <Muted>{t("notes.add")}</Muted>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityHint={t("notes.spoken.editHint")}
      accessibilityLabel={t("notes.spoken.exerciseNote", {
        exercise: exerciseName,
        note,
      })}
      accessibilityRole="button"
      onPress={onEdit}
      sentry-label={SENTRY_LABEL}
      testID="exercise-note-text"
    >
      <Text>{note}</Text>
    </Pressable>
  );
};

/** A navigation leaving the Screen, as the leave guard is handed it. */
export interface LeavingAction {
  type: string;
}

interface ExerciseNoteProps {
  /** Its name, for VoiceOver. */
  exerciseName: string;
  /** The Exercise's own slug: the note shown and saved is the one on it. */
  exerciseSlug: string;
  /**
   * How it sits on its Screen (Figma's FIT-820 frames): `section`, under its
   * own Note heading (the Exercise detail screen), or `inline`, a muted Note
   * label over the text and only Add Note without one (the Workout Session
   * Exercise screen).
   */
  layout?: "inline" | "section";
  /**
   * Whether a navigation leaving the Screen goes without asking about
   * unsaved text: the app moving on by itself (a Workout Session ending
   * elsewhere), which other unsaved input doesn't hold up either. The User's
   * own way back still asks.
   */
  leavesWithoutAsking?: (action: LeavingAction) => boolean;
}

/**
 * The User's note on an Exercise (Figma's ExerciseNote, FIT-820): "Add Note"
 * without one, the text with Edit with one, and the editor (a multi-line
 * field, its character count at the 500 limit, Cancel and Save, off until
 * something changed). It reads the notes list and never holds the screen up:
 * nothing shows until it's read, and a failed read with nothing read is its
 * own error with Try Again, never an editor whose save would replace a note
 * that wasn't read. Saving blank clears the note. A failed save keeps the
 * text with its error, a 429 the wait, Save off until it's passed. Leaving
 * with unsaved text, or Cancel, asks first.
 */
export const ExerciseNote = ({
  exerciseName,
  exerciseSlug,
  layout = "section",
  leavesWithoutAsking,
}: ExerciseNoteProps) => {
  const { t } = useTranslation();
  const { data: notes, error, refetch } = useExerciseNotesQuery();
  const { isPending, mutate } = useSaveExerciseNoteMutation();
  const [draft, setDraft] = useState<string | null>(null);
  const [failure, setFailure] = useState<NoteSaveFailure | null>(null);
  const [waitSeconds, setWaitSeconds] = useNoteRateLimitWait();

  const note = notes ? exerciseNoteOn(notes, exerciseSlug) : null;
  // Only while the list is read: without it no editor shows.
  const isChanged = !!notes && draft !== null && savedNoteOf(draft) !== note;

  const askToDiscard = useAskToDiscardNote();

  // Held while a save is on its way too: it can still fail, and the text
  // would go with the Screen.
  usePreventRemove(isChanged, ({ data, repeat }) => {
    if (leavesWithoutAsking?.(data.action)) {
      repeat();
    } else {
      askToDiscard(repeat);
    }
  });

  const startEditing = useCallback(() => {
    setFailure(null);
    setDraft(note ?? "");
  }, [note]);

  const stopEditing = useCallback(() => {
    setFailure(null);
    setDraft(null);
  }, []);

  const cancel = useCallback(() => {
    if (isChanged) {
      askToDiscard(stopEditing);
    } else {
      stopEditing();
    }
  }, [askToDiscard, isChanged, stopEditing]);

  const changeDraft = useCallback((text: string) => {
    setDraft(withinNoteLimit(text));
  }, []);

  const save = useCallback(() => {
    if (draft === null || waitSeconds !== null) {
      return;
    }

    setFailure(null);
    mutate(
      { exerciseSlug, note: draft },
      {
        onError: (saveError) => {
          const shown = noteSaveFailureOf(saveError);

          if (shown.kind === "rateLimited") {
            setWaitSeconds(shown.seconds);
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
          setDraft(null);
          AccessibilityInfo.announceForAccessibility(
            saved.note === null
              ? t("notes.spoken.cleared")
              : t("notes.spoken.saved")
          );
        },
      }
    );
  }, [draft, exerciseSlug, mutate, setWaitSeconds, t, waitSeconds]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Nothing read yet: nothing while it loads, its error once it has failed.
  if (!notes && !error) {
    return null;
  }

  let body: ReactNode;

  if (!notes) {
    body = <NoteLoadError error={error} onRetry={retry} />;
  } else if (draft === null) {
    body = (
      <NoteShown
        exerciseName={exerciseName}
        note={note}
        onEdit={startEditing}
      />
    );
  } else {
    body = (
      <NoteEditor
        accessibilityLabel={t("notes.spoken.exerciseField", {
          exercise: exerciseName,
        })}
        draft={draft}
        failure={failure}
        isChanged={isChanged}
        isPending={isPending}
        onCancel={cancel}
        onChange={changeDraft}
        onSave={save}
        placeholder={t("notes.placeholder.exercise")}
        sentryLabel={SENTRY_LABEL}
        testIDPrefix="exercise-note"
        waitSeconds={waitSeconds}
      />
    );
  }

  const showsEdit = !!notes && draft === null && note !== null;

  // Inline, Add Note says it all: no label over it.
  const showsHeading =
    layout === "section" || !notes || draft !== null || note !== null;

  return (
    <View className="gap-xs" testID="exercise-note">
      {showsHeading ? (
        <View className="flex-row items-center justify-between">
          {layout === "section" ? (
            <H4>{t("notes.label")}</H4>
          ) : (
            <View className="gap-xs flex-row items-center">
              <SymbolImage
                className="text-footnote text-muted-foreground"
                name="note.text"
              />
              <Muted className="text-footnote">{t("notes.label")}</Muted>
            </View>
          )}
          {showsEdit ? (
            <Button
              accessibilityLabel={t("notes.spoken.edit", {
                exercise: exerciseName,
              })}
              contentColorClassName="text-primary"
              label={t("notes.edit")}
              onPress={startEditing}
              size="sm"
              testID="exercise-note-edit"
              variant="ghost"
            />
          ) : null}
        </View>
      ) : null}
      {body}
    </View>
  );
};
