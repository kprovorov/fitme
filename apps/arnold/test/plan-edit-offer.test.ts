import type { ModelMessage } from "ai";
import type * as EveTools from "eve/tools";
import { describe, expect, it, vi } from "vitest";

type EveUserMessage = ModelMessage & { kind: "context.instruction" | "user" };

type Resolver = (ctx: {
  messages: () => Promise<readonly EveUserMessage[]>;
}) => Promise<unknown>;

// eve's dynamic value is opaque, so the test resolves it as eve would: with a
// model call's messages.
const fakeTools = vi.hoisted(() => ({
  defineDynamic: (resolve: Resolver) => ({ resolve }),
}));

vi.mock<typeof EveTools | typeof fakeTools>(
  import("eve/tools"),
  async (importOriginal) => ({ ...(await importOriginal()), ...fakeTools })
);

const clientContext = (value: {
  cards?: string[];
  language: string;
}): EveUserMessage => ({
  content: `Client context:\n${JSON.stringify(value)}`,
  kind: "context.instruction",
  role: "user",
});

const builds = {
  "an old build, which sends no card list": [clientContext({ language: "en" })],
  "a build whose card list lacks plan_proposal": [
    clientContext({ cards: ["workout", "plan"], language: "en" }),
  ],
  "a build whose card list holds plan_proposal": [
    clientContext({ cards: ["workout", "plan_proposal"], language: "en" }),
  ],
} as const;

type Build = keyof typeof builds;

const hasResolver = (entry: unknown): entry is { resolve: Resolver } =>
  typeof entry === "object" &&
  entry !== null &&
  "resolve" in entry &&
  typeof entry.resolve === "function";

/** The tool a tool file's default export offers to `build`, or `null`. */
const offeredTo = async (entry: unknown, build: Build) =>
  hasResolver(entry)
    ? await entry.resolve({ messages: () => Promise.resolve(builds[build]) })
    : entry;

const withheld = [
  "add_exercise_to_workout",
  "add_set_to_exercise",
  "remove_exercise_from_workout",
  "remove_set_from_exercise",
  "replace_exercise_in_workout",
  "update_set_recommendations",
  "display_workout_plan",
];

const kept = [
  "activate_plan",
  "update_user_profile",
  "set_exercise_note",
  "set_workout_session_set_note",
  "remove_set_from_workout_session",
];

// Loaded once up front: a cold import of a tool's dependencies can outlast a
// test's timeout.
const toolModules = new Map(
  await Promise.all(
    [...withheld, ...kept].map(
      async (name) => [name, await import(`../agent/tools/${name}.ts`)] as const
    )
  )
);

const loadTool = (name: string) => {
  const toolModule = toolModules.get(name);

  if (!toolModule) {
    throw new Error(`No tool module loaded for ${name}`);
  }

  return toolModule;
};

const offeringBuilds: Build[] = [
  "an old build, which sends no card list",
  "a build whose card list lacks plan_proposal",
];

const pairs = (names: string[], forBuilds: Build[]) =>
  names.flatMap((name) => forBuilds.map((build) => [name, build] as const));

describe("the tools a build that draws the Plan Proposal no longer gets", () => {
  it.each(pairs(withheld, offeringBuilds))(
    "%s is offered to %s",
    async (name, build) => {
      const toolModule = loadTool(name);

      await expect(offeredTo(toolModule.default, build)).resolves.toBe(
        toolModule.tool
      );
      expect(toolModule.tool).toHaveProperty("execute");
    }
  );

  it.each(withheld)(
    "%s is not offered to a build whose card list holds plan_proposal",
    async (name) => {
      const toolModule = loadTool(name);

      await expect(
        offeredTo(
          toolModule.default,
          "a build whose card list holds plan_proposal"
        )
      ).resolves.toBeNull();
    }
  );
});

describe("the tools every build keeps", () => {
  it.each(pairs(kept, Object.keys(builds) as Build[]))(
    "%s is offered to %s",
    async (name, build) => {
      const toolModule = loadTool(name);

      await expect(offeredTo(toolModule.default, build)).resolves.toBe(
        toolModule.default
      );
      expect(toolModule.default).toHaveProperty("execute");
    }
  );
});
