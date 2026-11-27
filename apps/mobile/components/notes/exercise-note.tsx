import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { cleanNote, noteLength } from "@fitme/core/notes";
import { usePreventRemove } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Alert, Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { H4, Muted } from "~/components/ui/typography";
import { useSaveExerciseNoteMutation } from "~/hooks/mutations/exercise-notes";
import {
  exerciseNoteOn,
  useExerciseNotesQuery,
} from "~/hooks/queries/exercise-notes";
import { cn } from "~/lib/utils";

/**
 * What Sentry's touch breadcrumbs name a touch on the note by. It reads a
 * `sentry-label` before the accessibility label, which holds the note's text.
 */
const SENTRY_LABEL = "exercise-note";

/** Brings Add Note's 28 pt line to the 44 pt tap target (Figma's rules). */
const TAP_TARGET_SLOP = { bottom: 8, top: 8 };

/** Why the last save didn't land, as the note area says it. */
type SaveFailure =
  | { kind: "rateLimited"; seconds: number }
  | { kind: "save" | "unknownExercise" | "libraryUnavailable" };

const saveFailureOf = (error: unknown): SaveFailure => {
  const seconds = rateLimitedFor(error);

  if (seconds !== null) {
    return { kind: "rateLimited", seconds };
  }

  const code = error instanceof ApiError ? error.code : null;

  if (code === "unknown_exercises") {
    return { kind: "unknownExercise" };
  }

  if (code === "library_unavailable") {
    return { kind: "libraryUnavailable" };
  }

  return { kind: "save" };
};

/** How long a note's text is as saved: trimmed, in code points. */
const savedLength = (text: string): number => noteLength(text.trim());

/**
 * What the User typed or pasted, as the field keeps it: without NUL
 * characters (Postgres can't store one, so the API refuses them), and cut
 * where the text that would be saved (trimmed) reaches the limit.
 */
const withinLimit = (typed: string): string => {
  const text = typed.replaceAll("\u0000", "");

  if (savedLength(text) <= MAX_NOTE_LENGTH) {
    return text;
  }

  const leading = noteLength(text) - noteLength(text.trimStart());

  // oxlint-disable-next-line typescript/no-misused-spread -- code points are exactly what Postgres counts
  return [...text].slice(0, leading + MAX_NOTE_LENGTH).join("");
};

/** The text a draft would save: trimmed, `null` for none. */
const savedFormOf = (draft: string): string | null => {
  const cleaned = cleanNote(draft);

  return cleaned.ok ? cleaned.note : draft;
};

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

/** The character count under the field, red with its message at the limit. */
const NoteCounter = ({ draft }: { draft: string }) => {
  const { t } = useTranslation();
  const length = savedLength(draft);
  const atLimit = length >= MAX_NOTE_LENGTH;
  const counter = t("notes.counter", { length, max: MAX_NOTE_LENGTH });

  return (
    <Text
      accessibilityLabel={
        atLimit
          ? t("notes.spoken.limitReached", { max: MAX_NOTE_LENGTH })
          : t("notes.spoken.counter", { length, max: MAX_NOTE_LENGTH })
      }
      className={cn(
        "text-mono-caption-1 self-end",
        atLimit ? "text-destructive" : "text-muted-foreground"
      )}
      testID="exercise-note-counter"
    >
      {atLimit ? `${counter} · ${t("notes.limitReached")}` : counter}
    </Text>
  );
};

interface NoteEditorProps {
  draft: string;
  exerciseName: string;
  failure: SaveFailure | null;
  isChanged: boolean;
  isPending: boolean;
  onCancel: () => void;
  onChange: (text: string) => void;
  onSave: () => void;
  /** A 429's wait, in seconds, while it lasts. */
  waitSeconds: number | null;
}

/** The field, the count, a failed save's message, Cancel and Save. */
const NoteEditor = ({
  draft,
  exerciseName,
  failure,
  isChanged,
  isPending,
  onCancel,
  onChange,
  onSave,
  waitSeconds,
}: NoteEditorProps) => {
  const { t } = useTranslation();

  const message =
    failure && failure.kind !== "rateLimited"
      ? t(`notes.errors.${failure.kind}`)
      : undefined;

  const isDimmed = isPending || waitSeconds !== null;

  return (
    <>
      <Textarea
        accessibilityLabel={t("notes.spoken.exerciseField", {
          exercise: exerciseName,
        })}
        autoFocus
        editable={!isPending}
        error={message}
        onChangeText={onChange}
        placeholder={t("notes.placeholder.exercise")}
        sentry-label={SENTRY_LABEL}
        testID="exercise-note-field"
        value={draft}
      />
      {waitSeconds === null ? null : (
        <View
          accessibilityLabel={t("notes.spoken.rateLimited", {
            count: waitSeconds,
          })}
          accessible
          className="gap-xs flex-row items-center"
          testID="exercise-note-rate-limited"
        >
          <SymbolImage
            className="text-footnote text-muted-foreground shrink-0"
            name="clock"
          />
          <Muted className="text-footnote flex-1">
            {t("notes.errors.rateLimited", { seconds: waitSeconds })}
          </Muted>
        </View>
      )}
      <NoteCounter draft={draft} />
      <View className="gap-xs flex-row justify-end">
        <Button
          accessibilityLabel={t("notes.spoken.cancel")}
          disabled={isPending}
          label={t("notes.cancel")}
          onPress={onCancel}
          fill={false}
          size="sm"
          testID="exercise-note-cancel"
          variant="secondary"
        />
        <Button
          accessibilityLabel={
            isPending ? t("notes.spoken.saving") : t("notes.spoken.save")
          }
          disabled={!isChanged || isDimmed}
          label={isPending ? t("notes.saving") : t("notes.save")}
          onPress={onSave}
          fill={false}
          size="sm"
          testID="exercise-note-save"
          variant={isDimmed ? "secondary" : "default"}
        />
      </View>
    </>
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

interface ExerciseNoteProps {
  /** Its name, for VoiceOver. */
  exerciseName: string;
  /** The Exercise's own slug: the note shown and saved is the one on it. */
  exerciseSlug: string;
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
}: ExerciseNoteProps) => {
  const { t } = useTranslation();
  const { data: notes, error, refetch } = useExerciseNotesQuery();
  const { isPending, mutate } = useSaveExerciseNoteMutation();
  const [draft, setDraft] = useState<string | null>(null);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  // Kept apart from the editor, so closing and reopening it doesn't skip it.
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);

  const note = notes ? exerciseNoteOn(notes, exerciseSlug) : null;
  // Only while the list is read: without it no editor shows.
  const isChanged = !!notes && draft !== null && savedFormOf(draft) !== note;

  // A 429's wait: Save stays off until it's passed.
  useEffect(() => {
    if (waitSeconds === null) {
      return;
    }

    const timer = setTimeout(() => {
      setWaitSeconds(null);
    }, waitSeconds * 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [waitSeconds]);

  const askToDiscard = useCallback(
    (discard: () => void) => {
      Alert.alert(t("notes.discard.title"), t("notes.discard.message"), [
        { style: "cancel", text: t("notes.discard.keepEditing") },
        {
          onPress: discard,
          style: "destructive",
          text: t("notes.discard.discard"),
        },
      ]);
    },
    [t]
  );

  usePreventRemove(isChanged && !isPending, ({ repeat }) => {
    askToDiscard(repeat);
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
    setDraft(withinLimit(text));
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
          const shown = saveFailureOf(saveError);

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
  }, [draft, exerciseSlug, mutate, t, waitSeconds]);

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
        draft={draft}
        exerciseName={exerciseName}
        failure={failure}
        isChanged={isChanged}
        isPending={isPending}
        onCancel={cancel}
        onChange={changeDraft}
        onSave={save}
        waitSeconds={waitSeconds}
      />
    );
  }

  const showsEdit = !!notes && draft === null && note !== null;

  return (
    <View className="gap-xs" testID="exercise-note">
      <View className="flex-row items-center justify-between">
        <H4>{t("notes.label")}</H4>
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
      {body}
    </View>
  );
};
