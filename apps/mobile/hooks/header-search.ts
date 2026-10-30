import { useCallback, useMemo, useRef, useState } from "react";
import type { SearchBarCommands, SearchBarProps } from "react-native-screens";

/**
 * The Library's search from the native header search bar (the Library tab and
 * the Exercise picker): the bar holds the text, `search` follows it, and
 * `onSearchChange("")` ("Show All Exercises") clears the bar too. It starts
 * empty with every mount, so the picker opens on a fresh search.
 */
export function useHeaderSearch(placeholder: string) {
  const searchBar = useRef<SearchBarCommands | null>(null);
  const [search, setSearch] = useState("");

  const clearSearch = useCallback(() => setSearch(""), []);

  const onSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (text === "") {
      searchBar.current?.clearText();
    }
  }, []);

  const searchBarOptions = useMemo<SearchBarProps>(
    () => ({
      autoCapitalize: "none",
      // Hidden until the User pulls the list down.
      hideWhenScrolling: true,
      onCancelButtonPress: clearSearch,
      onChangeText: ({ nativeEvent }) => setSearch(nativeEvent.text),
      onClose: clearSearch,
      placeholder,
      placement: "stacked",
      ref: searchBar,
    }),
    [clearSearch, placeholder]
  );

  return { onSearchChange, search, searchBarOptions };
}
