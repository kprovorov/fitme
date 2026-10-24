import { useMMKVString } from "react-native-mmkv";
import { useArnoldModelsQuery } from "~/hooks/queries/arnold-models";
import { resolveArnoldModel, SELECTED_MODEL_KEY } from "~/lib/arnold-model";
import { getApiUrl } from "~/lib/constants";
import { storage } from "~/lib/mmkv";

/**
 * Arnold models to pick from and the one the next message runs on. Both
 * are `undefined` while there's no list (nothing cached and the fetch failed
 * or is in flight, or no `EXPO_PUBLIC_API_URL`); `isLoading` tells the two
 * apart.
 */
export function useSelectedArnoldModel() {
  const hasApi = getApiUrl() !== "";
  const { data: list, isFetching } = useArnoldModelsQuery({ enabled: hasApi });
  const [stored, setSelectedId] = useMMKVString(SELECTED_MODEL_KEY, storage);

  return {
    isLoading: !list && isFetching,
    model: resolveArnoldModel(stored, list),
    models: list?.models,
    setSelectedId,
  };
}
