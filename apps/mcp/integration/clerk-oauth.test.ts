import { readFileSync } from "node:fs";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { decodeJwt } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ClerkDev,
  type ClerkOAuthApp,
  type ClerkTestUser,
  clerkDev,
  HeadlessOAuthProvider,
  startMcpServer,
} from "./clerk.js";
import {
  callError,
  callOk,
  type PlanDetail,
  type PlanSummary,
  pickExercises,
  planInput,
  requireEnv,
} from "./setup.js";

const secretKey = process.env.CLERK_DEV_SECRET_KEY;
const RESOURCE_METADATA = /resource_metadata="([^"]+)"/;

/**
 * The whole chain against the Clerk development instance and the local stack:
 * an MCP client over HTTP discovers Clerk from the server's 401, a
 * `+clerk_test` User signs in and consents, the client exchanges the code with
 * PKCE for a Clerk access token, and the user tools run past RLS with the
 * Supabase token the server signs. Skipped without CLERK_DEV_SECRET_KEY.
 */
describe.skipIf(!secretKey)("Clerk OAuth flow end to end", () => {
  let clerk: ClerkDev;
  let server: Awaited<ReturnType<typeof startMcpServer>>;
  let app: ClerkOAuthApp | undefined;
  const users: ClerkTestUser[] = [];
  const clients: Client[] = [];

  /** Runs the OAuth flow for `user` and connects with the token it yields. */
  async function signIn(user: ClerkTestUser) {
    if (!app) {
      throw new Error("No OAuth application.");
    }
    const { redirectUri } = app;
    const provider = new HeadlessOAuthProvider(app, (url) =>
      clerk.authorize(url, user, redirectUri)
    );

    // The first connect hits the 401, discovers Clerk and runs the flow.
    const transport = new StreamableHTTPClientTransport(server.url, {
      authProvider: provider,
    });
    const error = await new Client({ name: "integration", version: "0.0.0" })
      .connect(transport)
      .then(
        () => undefined,
        (reason: unknown) => reason
      );
    if (!(error instanceof UnauthorizedError)) {
      throw new Error("The first connect did not start OAuth.", {
        cause: error,
      });
    }
    if (!provider.code) {
      throw new Error("The OAuth flow returned no code.");
    }
    await transport.finishAuth(provider.code);

    const client = new Client({ name: "integration", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(server.url, { authProvider: provider })
    );
    clients.push(client);
    return { client, provider };
  }

  beforeAll(async () => {
    requireEnv();
    clerk = clerkDev(String(secretKey));
    // The server under test trusts the development instance and signs
    // Supabase tokens with the key the local stack trusts.
    process.env.CLERK_SECRET_KEY = secretKey;
    process.env.CLERK_PUBLISHABLE_KEY = await clerk.publishableKey();
    process.env.SUPABASE_JWT_SIGNING_KEY ||= readFileSync(
      new URL("local-only-signing-key.json", import.meta.url),
      "utf8"
    );
    server = await startMcpServer();
    app = await clerk.createOAuthApp(
      new URL("/oauth/callback", server.url).href
    );
    // One at a time, each tracked as soon as it exists, so afterAll deletes
    // it even when the next one fails.
    users.push(await clerk.createUser("owner"));
    users.push(await clerk.createUser("other"));
  });

  afterAll(async () => {
    await Promise.allSettled(clients.map((client) => client.close()));
    // Clean up every Clerk object, even when one deletion fails.
    const cleanup = await Promise.allSettled([
      ...users.map((user) => clerk.deleteUser(user)),
      ...(app ? [clerk.deleteOAuthApp(app)] : []),
    ]);
    await server?.close();
    const failed = cleanup.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      throw new AggregateError(
        failed.map((result) => result.reason),
        "Failed to clean up Clerk test objects."
      );
    }
  });

  it("answers an unauthenticated request with a 401 pointing at the metadata", async () => {
    const response = await fetch(server.url, {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(401);

    const metadataUrl = response.headers
      .get("WWW-Authenticate")
      ?.match(RESOURCE_METADATA)?.[1];
    expect(metadataUrl).toBe(
      new URL("/.well-known/oauth-protected-resource", server.url).href
    );
    const metadata = await (await fetch(String(metadataUrl))).json();
    expect(metadata).toMatchObject({
      authorization_servers: [await clerk.frontendApiUrl()],
      resource: server.url.href,
    });
  });

  it("gets a Clerk access token through the PKCE flow and calls user tools", async () => {
    const [owner, other] = users as [ClerkTestUser, ClerkTestUser];
    const { client, provider } = await signIn(owner);

    expect(provider.authorizationUrl?.origin).toBe(
      new URL(await clerk.frontendApiUrl()).origin
    );
    expect(
      provider.authorizationUrl?.searchParams.get("code_challenge_method")
    ).toBe("S256");
    const accessToken = provider.tokens()?.access_token;
    expect(accessToken).toBeTruthy();
    expect(decodeJwt(String(accessToken)).sub).toBe(owner.id);

    expect(await callOk<PlanSummary[]>(client, "list_plans")).toEqual([]);
    const plan = await callOk<PlanDetail>(
      client,
      "create_plan",
      planInput(await pickExercises(client), "OAuth plan")
    );
    expect(
      (await callOk<PlanSummary[]>(client, "list_plans")).map(({ id }) => id)
    ).toEqual([plan.id]);

    const { client: otherClient } = await signIn(other);
    expect(await callOk<PlanSummary[]>(otherClient, "list_plans")).toEqual([]);
    await callError(otherClient, "get_plan", { planId: plan.id });
  });
});
