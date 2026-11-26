import { describe, expect, it } from "vitest";

import { isLocalDatabaseUrl } from "../local-database";

describe("the run-once command's database check", () => {
  it.each([
    "postgresql://fitme.pooler-dev:fitme-local-only@127.0.0.1:54329/postgres?application_name=jobs",
    "postgresql://fitme.pooler-dev:pw@localhost:54329/postgres",
    "postgresql://fitme.pooler-dev:pw@[::1]:54329/postgres",
  ])("accepts a local stack: %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBeTruthy();
  });

  it.each([
    "postgresql://fitme.abcdef:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
    "postgresql://fitme:pw@127.0.0.1.example.com:5432/postgres",
    "postgresql://fitme:pw@localhost.example.com/postgres",
    "not a url",
    "",
    undefined,
  ])("refuses anything else: %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBeFalsy();
  });
});
