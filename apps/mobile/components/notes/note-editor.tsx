import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { Muted } from "~/components/ui/typography";
import { savedNoteLength } from "~/lib/note-drafts";
import type { NoteSaveFailure } from "~/lib/note-drafts";
import { cn } from "~/lib/utils";

/** The character count under the field, red with its message at the limit. */
const NoteCounter = ({ draft, testID }: { draft: string; testID: string }) => {
  const { t } = useTranslation();
  const length = savedNoteLength(draft);
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
      testID={testID}
    >
      {atLimit ? `${counter} · ${t("notes.limitReached")}` : counter}
    </Text>
  );
};

export interface NoteEditorProps {
  /** What VoiceOver calls the field. */
  accessibilityLabel: string;
  draft: string;
  failure: NoteSaveFailure | null;
  isChanged: boolean;
  isPending: boolean;
  onCancel: () => void;
  onChange: (text: string) => void;
  onSave: () => void;
  placeholder: string;
  /**
   * What Sentry's touch breadcrumbs name a touch on it by: it reads a
   * `sentry-label` before the accessibility label, which can hold the text.
   */
  sentryLabel: string;
  /** Each part's test ID starts with it: `<prefix>-field`, `<prefix>-save`. */
  testIDPrefix: string;
  /** A 429's wait, in seconds, while it lasts. */
  waitSeconds: number | null;
}

/**
 * A note's editor (Figma's FIT-820 frames): the multi-line field, a 429's
 * wait, the count at the 500 limit, a failed save's message, Cancel and
 * Save, off until something changed and dimmed while saving or waiting.
 */
export const NoteEditor = ({
  accessibilityLabel,
  draft,
  failure,
  isChanged,
  isPending,
  onCancel,
  onChange,
  onSave,
  placeholder,
  sentryLabel,
  testIDPrefix,
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
        accessibilityLabel={accessibilityLabel}
        autoFocus
        editable={!isPending}
        error={message}
        onChangeText={onChange}
        placeholder={placeholder}
        sentry-label={sentryLabel}
        testID={`${testIDPrefix}-field`}
        value={draft}
      />
      {waitSeconds === null ? null : (
        <View
          accessibilityLabel={t("notes.spoken.rateLimited", {
            count: waitSeconds,
          })}
          accessible
          className="gap-xs flex-row items-center"
          testID={`${testIDPrefix}-rate-limited`}
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
      <NoteCounter draft={draft} testID={`${testIDPrefix}-counter`} />
      <View className="gap-xs flex-row justify-end">
        <Button
          accessibilityLabel={t("notes.spoken.cancel")}
          disabled={isPending}
          label={t("notes.cancel")}
          onPress={onCancel}
          fill={false}
          sentry-label={sentryLabel}
          size="sm"
          testID={`${testIDPrefix}-cancel`}
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
          sentry-label={sentryLabel}
          size="sm"
          testID={`${testIDPrefix}-save`}
          variant={isDimmed ? "secondary" : "default"}
        />
      </View>
    </>
  );
};
