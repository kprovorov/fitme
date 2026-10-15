import { useCallback } from "react";
import { useMMKVString } from "react-native-mmkv";
import { useCoachModelsQuery } from "~/hooks/queries/coach-models";
import { resolveCoachModel, SELECTED_MODEL_KEY } from "~/lib/coach-model";
import { getApiUrl } from "~/lib/constants";
import { storage } from "~/lib/mmkv";

/**
 * The Coach models to pick from and the one the next message runs on. Both
 * are `undefined` while there's no list (nothing cached and the fetch failed
 * or is in flight, or no `EXPO_PUBLIC_API_URL`); `isLoading` tells the two
 * apart.
 */
export function useSelectedCoachModel() {
  const hasApi = getApiUrl() !== "";
  const { data: list, isFetching } = useCoachModelsQuery({ enabled: hasApi });
  const [stored, setStored] = useMMKVString(SELECTED_MODEL_KEY, storage);

  const setSelectedId = useCallback(
    (id: string) => {
      setStored(id);
    },
    [setStored]
  );

  return {
    isLoading: !list && isFetching,
    model: resolveCoachModel(stored, list),
    models: list?.models,
    setSelectedId,
  };
}
