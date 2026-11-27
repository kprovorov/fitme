// First, before anything that may generate an id: `crypto.getRandomValues`,
// which Hermes lacks and the Arnold runtime's id generator may need. Nothing
// else loads it, so it stays a direct dependency (its native module is only
// autolinked as one).
import "react-native-get-random-values";
import "core-js/actual/array/to-sorted";
import "core-js/actual/array/to-reversed";
import structuredClone from "@ungap/structured-clone";
import { Platform } from "react-native";
import { z } from "zod";

const setupPolyfills = async () => {
  const [{ polyfillGlobal }, { TextEncoderStream, TextDecoderStream }] =
    await Promise.all([
      import("react-native/Libraries/Utilities/PolyfillFunctions").then(
        (polyfills) =>
          z.object({ polyfillGlobal: z.function() }).parse(polyfills)
      ),
      import("@stardazed/streams-text-encoding"),
    ]);

  if (!("structuredClone" in global)) {
    /** @type {unknown} */
    const clone = structuredClone;
    polyfillGlobal("structuredClone", () => clone);
  }

  polyfillGlobal("TextEncoderStream", () => TextEncoderStream);
  polyfillGlobal("TextDecoderStream", () => TextDecoderStream);
};

if (Platform.OS !== "web") {
  void setupPolyfills();
}
