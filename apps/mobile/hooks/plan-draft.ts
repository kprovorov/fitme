import { useEffect, useSyncExternalStore } from "react";

import type { PlanDraft } from "~/lib/plan-draft";

/** One editor opening's draft: what it loaded, and what it holds now. */
interface DraftEntry {
  draft: PlanDraft;
  /** The draft as the editor opened it, to tell a change from none. */
  loaded: PlanDraft;
}

/**
 * The draft of each editor opening, by its key, in memory only (never MMKV):
 * a draft lasts as long as the editor is open and is thrown away with it, so
 * two openings never share one. It lives outside React, so the Plan editor
 * and the Workout editor pushed over it work on the same draft.
 */
const drafts = new Map<string, DraftEntry>();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

let openings = 0;

/** A fresh key for one editor opening; hold it with `usePlanDraftOpening`. */
export const newPlanDraftKey = (): string => {
  openings += 1;

  return `plan-draft-${openings}`;
};

/** The opening's draft and what it loaded, or `undefined` before it has. */
export const getPlanDraft = (key: string): DraftEntry | undefined =>
  drafts.get(key);

/**
 * Starts the opening on `loaded`, the Plan as it was read. A second call for
 * the same key changes nothing, so a refreshed read never overwrites what
 * the User has typed.
 */
export const startPlanDraft = (key: string, loaded: PlanDraft): void => {
  if (drafts.has(key)) {
    return;
  }

  drafts.set(key, { draft: loaded, loaded });
  emit();
};

/** Changes the opening's draft; a key with no draft yet is left alone. */
export const updatePlanDraft = (
  key: string,
  change: (draft: PlanDraft) => PlanDraft
): void => {
  const entry = drafts.get(key);

  if (!entry) {
    return;
  }

  drafts.set(key, { ...entry, draft: change(entry.draft) });
  emit();
};

/**
 * Makes `loaded` what the opening compares against from now on: the draft a
 * save has just written, so edits made while it was in flight are still
 * unsaved changes and everything before them isn't.
 */
export const rebasePlanDraft = (key: string, loaded: PlanDraft): void => {
  const entry = drafts.get(key);

  if (!entry) {
    return;
  }

  drafts.set(key, { ...entry, loaded });
  emit();
};

/** Throws the opening's draft away (the editor closing). */
export const forgetPlanDraft = (key: string): void => {
  if (drafts.delete(key)) {
    emit();
  }
};

/** Throws every draft away: the app's start, and tests. */
export const resetPlanDrafts = (): void => {
  drafts.clear();
  emit();
};

/** Forgets the opening's draft once the editor holding `key` is gone. */
export const usePlanDraftOpening = (key: string): void => {
  useEffect(() => () => forgetPlanDraft(key), [key]);
};

/** The opening's draft, re-rendering whenever it changes. */
export const usePlanDraft = (key: string): DraftEntry | undefined => {
  const read = () => getPlanDraft(key);

  return useSyncExternalStore(subscribe, read, read);
};
