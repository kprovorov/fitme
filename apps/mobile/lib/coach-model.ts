import {
  type CoachModel,
  type CoachModelId,
  coachModels,
  defaultCoachModelId,
  isCoachModelId,
} from "@fitme/core";
import { useCallback } from "react";
import { useMMKVString } from "react-native-mmkv";
import { storage } from "~/lib/mmkv";

const STORAGE_KEY = "coach.model";

function resolveModelId(value: string | undefined): CoachModelId {
  return isCoachModelId(value) ? value : defaultCoachModelId;
}

/** Non-reactive read, safe to call from request builders outside React. */
export function getSelectedCoachModelId(): CoachModelId {
  return resolveModelId(storage.getString(STORAGE_KEY));
}

export function getCoachModel(id: CoachModelId): CoachModel {
  const model = coachModels.find((candidate) => candidate.id === id);
  if (!model) {
    throw new Error(`Unknown coach model: ${id}`);
  }
  return model;
}

export function useSelectedCoachModel() {
  const [stored, setStored] = useMMKVString(STORAGE_KEY, storage);
  const selectedId = resolveModelId(stored);

  const setSelectedId = useCallback(
    (id: CoachModelId) => {
      setStored(id);
    },
    [setStored]
  );

  return {
    model: getCoachModel(selectedId),
    selectedId,
    setSelectedId,
  };
}
