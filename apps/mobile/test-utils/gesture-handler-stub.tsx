/**
 * `react-native-gesture-handler` for a screen test that mocks Reanimated as
 * plain values (the Arnold screen's): only the root view the toasts sit in
 * (`~/components/ui/toast`), as a plain View. The real module queues its
 * native UI-runtime bindings on import, which fail against that Reanimated
 * mock once the suite has run. Use it with
 * `jest.mock("react-native-gesture-handler", () => jest.requireActual("~/test-utils/gesture-handler-stub"))`.
 */
export { View as GestureHandlerRootView } from "react-native";
