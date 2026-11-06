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
