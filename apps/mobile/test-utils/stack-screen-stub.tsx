/**
 * Stand-in for expo-router's `Stack.Screen`, whose native header doesn't
 * mount under Jest: the header's title as text and, when the screen has
 * `headerSearchBarOptions`, its search bar as a text field labelled with its
 * placeholder. Typing calls the options' `onChangeText` with the native
 * event's shape, and its `ref` answers `clearText` / `setText` like the
 * native bar. Use it as `Stack.Screen` in a `jest.mock("expo-router", …)`
 * factory through `jest.requireActual("~/test-utils/stack-screen-stub")`.
 */
import { type Ref, useImperativeHandle, useState } from "react";
import { Text, TextInput } from "react-native";
import type { SearchBarCommands, SearchBarProps } from "react-native-screens";

/** The search bar's text, as the stand-in's field holds it. */
export const SEARCH_BAR_TEST_ID = "header-search-bar";

const SearchBar = ({
  options,
}: {
  options: SearchBarProps & { ref?: Ref<SearchBarCommands> };
}) => {
  const [text, setText] = useState("");
  const change = (next: string) => {
    setText(next);
    options.onChangeText?.({ nativeEvent: { text: next } } as Parameters<
      NonNullable<SearchBarProps["onChangeText"]>
    >[0]);
  };
  useImperativeHandle(options.ref, () => ({
    blur: () => undefined,
    cancelSearch: () => setText(""),
    clearText: () => setText(""),
    focus: () => undefined,
    setText,
    toggleCancelButton: () => undefined,
  }));
  return (
    <TextInput
      accessibilityLabel={options.placeholder}
      onChangeText={change}
      placeholder={options.placeholder}
      testID={SEARCH_BAR_TEST_ID}
      value={text}
    />
  );
};

export const StackScreenStub = ({
  options,
}: {
  options: {
    headerSearchBarOptions?: SearchBarProps & { ref?: Ref<SearchBarCommands> };
    title?: string;
  };
}) => (
  <>
    {options.title ? <Text>{options.title}</Text> : null}
    {options.headerSearchBarOptions ? (
      <SearchBar options={options.headerSearchBarOptions} />
    ) : null}
  </>
);
