import { appLanguages, arnoldToolNames } from "@fitme/core";
import { describe, expect, it } from "vitest";

import { catalogs } from "..";

// The line under Arnold's answer while he works says what he is doing, one
// string per tool he can call, keyed by the tool's name: each catalog holds
// exactly core's tool list, so a new tool can't ship without its line.
describe.each(appLanguages)("the %s Arnold status line", (language) => {
  it("has a line for every tool in core's list, and no other", () => {
    expect(
      Object.keys(catalogs[language].arnold.status.tools).toSorted()
    ).toStrictEqual([...arnoldToolNames].toSorted());
  });
});
