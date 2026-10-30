import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SearchBarCommands, SearchBarProps } from "react-native-screens";

/**
 * The Library's search from the native header search bar (the Library tab and
 * the Exercise picker): the bar holds the text, `search` follows it, and
 * `onSearchChange("")` ("Show All Exercises") clears the bar too. It starts
 * empty with every mount, so the picker opens on a fresh search.
 *
 * `inSheet` (the picker, a page sheet): the bar stays shown, since pulling a
 * sheet's list down dismisses the sheet, and the header stays while
 * searching, keeping the title and Close. Otherwise (the Library tab) the bar
 * is hidden until the User pulls the list down.
 */
export function useHeaderSearch({
  inSheet = false,
}: {
  inSheet?: boolean;
} = {}) {
  const { t } = useTranslation();
  const placeholder = t("library.search");
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
      hideNavigationBar: !inSheet,
      hideWhenScrolling: !inSheet,
      onCancelButtonPress: clearSearch,
      onChangeText: ({ nativeEvent }) => setSearch(nativeEvent.text),
      onClose: clearSearch,
      placeholder,
      placement: "stacked",
      ref: searchBar,
    }),
    [clearSearch, inSheet, placeholder]
  );

  return { onSearchChange, search, searchBarOptions };
}
