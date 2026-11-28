import { readdirSync } from "node:fs";
import path from "node:path";

import { isArnoldToolName } from "@fitme/core/arnold";
import { describe, expect, it } from "vitest";

// Every file in agent/tools is a tool named after the file. The app's status
// line and its catalog strings are keyed by core's `arnoldToolNames`, so a
// tool outside that list would reach the User as a name the app doesn't know.
const toolsDir = new URL("../agent/tools/", import.meta.url);

const toolNames = readdirSync(toolsDir)
  .filter((file) => path.extname(file) === ".ts")
  .map((file) => path.basename(file, ".ts"));

describe("Arnold's tool files", () => {
  it("has tool files to check", () => {
    expect(toolNames.length).toBeGreaterThan(0);
  });

  it.each(toolNames)("%s is in core's tool list", (name) => {
    expect(isArnoldToolName(name)).toBeTruthy();
  });
});
