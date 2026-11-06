import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";

import { serve } from "@hono/node-server";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { createApp } from "../src/create-app.js";
import { integrationLibrary } from "./setup.js";

/**
 * Helpers for the Clerk OAuth suite, which runs the real authorization flow
 * against the Clerk development instance: Users and the OAuth application are
 * created through the Backend API, sign-in and consent go through the Frontend
 * API the way Clerk's hosted pages do, so no browser is needed.
 */

const CLERK_API_URL = "https://api.clerk.com/v1";

/** How many redirects the headless consent may follow before giving up. */
const MAX_REDIRECTS = 10;
const TRAILING_SLASHES = /\/+$/u;

export interface ClerkTestUser {
  email: string;
  id: string;
}

export interface ClerkOAuthApp {
  clientId: string;
  id: string;
  redirectUri: string;
}

export type ClerkDev = ReturnType<typeof clerkDev>;

/** Drops the dev browser token from a URL before it goes into an error. */
const redact = (url: URL) => {
  const safe = new URL(url);
  safe.searchParams.delete("__clerk_db_jwt");

  return safe;
};

const frontend = async <T>(url: URL, form?: URLSearchParams): Promise<T> => {
  const response = await fetch(url, { body: form, method: "POST" });

  if (!response.ok) {
    throw new Error(
      `Clerk Frontend API POST ${url.pathname} failed with ${response.status}: ${await response.text()}`
    );
  }

  // SAFETY: A successful Clerk Frontend API response follows the endpoint contract
  // described by T at each integration-test call site.
  return (await response.json()) as T;
};

/** Backend + Frontend API access to the development instance of `secretKey`. */
export const clerkDev = (secretKey: string) => {
  // Only development instances may get throwaway Users and apps from tests.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "CLERK_DEV_SECRET_KEY must be a development key (sk_test_…)"
    );
  }

  const backend = async <T>(
    method: "DELETE" | "GET" | "POST",
    path: string,
    body?:
      | { expires_in_seconds: number; user_id: string }
      | {
          name: string;
          public: boolean;
          redirect_uris: string[];
          scopes: string;
        }
      | {
          email_address: string[];
          password: string;
          skip_password_checks: boolean;
        }
      | Record<string, never>
  ): Promise<T> => {
    const response = await fetch(`${CLERK_API_URL}${path}`, {
      ...(method !== "GET" && body && { body: JSON.stringify(body) }),
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      method,
    });

    if (!response.ok) {
      throw new Error(
        `Clerk ${method} ${path} failed with ${response.status}: ${await response.text()}`
      );
    }

    // SAFETY: A successful Clerk Backend API response follows the endpoint contract
    // described by T at each integration-test call site.
    return (await response.json()) as T;
  };

  let frontendApi: Promise<string> | undefined;

  const lookUpFrontendApiUrl = async (): Promise<string> => {
    const { data } = await backend<{
      data: { frontend_api_url: string; is_satellite: boolean }[];
    }>("GET", "/domains");

    const primary = data.find((domain) => !domain.is_satellite);

    if (!primary) {
      throw new Error("The Clerk instance has no primary domain.");
    }

    return primary.frontend_api_url.replace(TRAILING_SLASHES, "");
  };

  /** The instance's Frontend API, e.g. https://foo-bar-1.clerk.accounts.dev. */
  const frontendApiUrl = (): Promise<string> => {
    frontendApi ??= lookUpFrontendApiUrl();

    return frontendApi;
  };

  return {
    /**
     * Signs `user` in on a fresh headless "browser" and approves the
     * authorization request at `authorizationUrl`, as a User would on Clerk's
     * hosted sign-in and consent screens. Returns the redirect it ends on
     * (the client's redirect URI with `code`, `state` and `iss`).
     */
    async authorize(
      authorizationUrl: URL,
      user: ClerkTestUser,
      redirectUri: string
    ): Promise<URL> {
      const fapi = new URL(await frontendApiUrl());

      // A development instance keeps its client in a dev browser token,
      // passed as `__clerk_db_jwt`, instead of a first-party cookie.
      const devBrowser = await frontend<{ id?: string; token?: string }>(
        new URL("/v1/dev_browser", fapi)
      );

      const devBrowserToken = devBrowser.token ?? devBrowser.id;

      if (!devBrowserToken) {
        throw new Error("Clerk returned no dev browser token.");
      }

      const withDevBrowser = (target: URL) => {
        const next = new URL(target);

        if (next.origin === fapi.origin) {
          next.searchParams.set("__clerk_db_jwt", devBrowserToken);
        }

        return next;
      };

      // Sign-in token (ticket strategy) instead of a password, and a testing
      // token so bot protection lets a script through.
      const [{ token: ticket }, { token: testingToken }] = await Promise.all([
        backend<{ token: string }>("POST", "/sign_in_tokens", {
          expires_in_seconds: 300,
          user_id: user.id,
        }),
        // Clerk answers 415 to a POST without a JSON body.
        backend<{ token: string }>("POST", "/testing_tokens", {}),
      ]);

      const signInUrl = withDevBrowser(new URL("/v1/client/sign_ins", fapi));
      signInUrl.searchParams.set("__clerk_testing_token", testingToken);

      const signIn = await frontend<{
        response: { created_session_id: string | null; status: string };
      }>(signInUrl, new URLSearchParams({ strategy: "ticket", ticket }));

      const sessionId = signIn.response.created_session_id;

      if (!(signIn.response.status === "complete" && sessionId)) {
        throw new Error(
          `Clerk sign-in did not complete: ${JSON.stringify(signIn.response)}`
        );
      }

      // The flow must pass the consent screen, not skip it.
      let consented = false;

      const redirectOf = async (target: URL, form?: URLSearchParams) => {
        const response = await fetch(target, {
          body: form,
          headers: { Cookie: `__clerk_db_jwt=${devBrowserToken}` },
          method: form ? "POST" : "GET",
          redirect: "manual",
        });

        const location = response.headers.get("location");

        if (!location) {
          throw new Error(
            `Expected a redirect from ${redact(target).href}, got ${response.status}: ${await response.text()}`
          );
        }

        return withDevBrowser(new URL(location, target));
      };

      /**
       * Clerk's hosted consent page: submits "Allow" the way its form does,
       * to the Frontend API with every authorization parameter of the page.
       */
      const consent = async (page: URL, session: string) => {
        const params = new URLSearchParams(page.search);
        const clientId = params.get("client_id");

        if (!clientId) {
          throw new Error(
            `Unexpected page in the OAuth flow: ${redact(page).href}`
          );
        }

        params.delete("__clerk_db_jwt");
        params.set("consented", "true");
        consented = true;

        const action = withDevBrowser(
          new URL(`/v1/me/oauth/consent/${encodeURIComponent(clientId)}`, fapi)
        );

        action.searchParams.set("_clerk_session_id", session);

        return await redirectOf(action, params);
      };

      const nextPage = async (url: URL) => {
        if (url.origin === fapi.origin) {
          return await redirectOf(url);
        }

        // Clerk's Account Portal (hosted pages). Its sign-in page sends a
        // signed-in User straight on to `redirect_url` (the consent page).
        const afterSignIn = url.searchParams.get("redirect_url");

        if (url.pathname === "/sign-in" && afterSignIn) {
          return withDevBrowser(new URL(afterSignIn));
        }

        return await consent(url, String(sessionId));
      };

      /** Follows Clerk's redirects, consenting on the way, to the client. */
      const follow = async (url: URL, hopsLeft: number): Promise<URL> => {
        if (url.href.startsWith(redirectUri)) {
          if (!consented) {
            throw new Error("Clerk redirected back without asking consent.");
          }

          return url;
        }

        if (hopsLeft === 0) {
          throw new Error(`Clerk authorization did not reach ${redirectUri}.`);
        }

        return await follow(await nextPage(url), hopsLeft - 1);
      };

      return await follow(withDevBrowser(authorizationUrl), MAX_REDIRECTS);
    },

    async createOAuthApp(redirectUri: string): Promise<ClerkOAuthApp> {
      // A public client (PKCE, no secret), the shape of an MCP client.
      const app = await backend<{ client_id: string; id: string }>(
        "POST",
        "/oauth_applications",
        {
          name: `MCP integration ${randomUUID()}`,
          public: true,
          redirect_uris: [redirectUri],
          scopes: "openid profile email",
        }
      );

      return { clientId: app.client_id, id: app.id, redirectUri };
    },

    async createUser(label: string): Promise<ClerkTestUser> {
      const email = `mcp-oauth-${label}-${randomUUID()}+clerk_test@fitmeproject.com`;

      const user = await backend<{ id: string }>("POST", "/users", {
        email_address: [email],
        password: randomUUID(),
        skip_password_checks: true,
      });

      return { email, id: user.id };
    },

    deleteOAuthApp: (app: ClerkOAuthApp) =>
      backend("DELETE", `/oauth_applications/${app.id}`),

    deleteUser: (user: ClerkTestUser) => backend("DELETE", `/users/${user.id}`),

    frontendApiUrl,

    /** The development publishable key: `pk_test_` + base64("<fapi host>$"). */
    async publishableKey() {
      const { host } = new URL(await frontendApiUrl());

      return `pk_test_${Buffer.from(`${host}$`).toString("base64")}`;
    },
  };
};

/**
 * The MCP client's side of OAuth: a pre-registered public client whose
 * "browser" is `approve`, which hands back the redirect with the code.
 */
export class HeadlessOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: URL;
  code?: string;
  #codeVerifier?: string;
  #tokens?: OAuthTokens;
  readonly #app: ClerkOAuthApp;
  readonly #approve: (authorizationUrl: URL) => Promise<URL>;

  constructor(
    app: ClerkOAuthApp,
    approve: (authorizationUrl: URL) => Promise<URL>
  ) {
    this.#app = app;
    this.#approve = approve;
  }

  get redirectUrl() {
    return this.#app.redirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Fitme MCP integration test",
      grant_types: ["authorization_code"],
      redirect_uris: [this.#app.redirectUri],
      response_types: ["code"],
      scope: "openid profile email",
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationMixed {
    return { client_id: this.#app.clientId };
  }

  tokens() {
    return this.#tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    this.#tokens = tokens;
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
    const callback = await this.#approve(authorizationUrl);
    const code = callback.searchParams.get("code");

    if (!code) {
      throw new Error(`Clerk redirected without a code: ${callback.search}`);
    }

    if (
      callback.searchParams.get("state") !==
      authorizationUrl.searchParams.get("state")
    ) {
      throw new Error("Clerk returned a different OAuth state.");
    }

    this.code = code;
  }

  saveCodeVerifier(codeVerifier: string) {
    this.#codeVerifier = codeVerifier;
  }

  codeVerifier() {
    if (!this.#codeVerifier) {
      throw new Error("No PKCE code verifier saved.");
    }

    return this.#codeVerifier;
  }

  state = randomUUID;
}

/** Serves the real MCP app over HTTP on a free local port. */
export const startMcpServer = async () => {
  const server = serve({
    fetch: createApp({
      createLibrary: integrationLibrary,
      logRequests: false,
      reportError: (error) => {
        console.error(error);

        return Promise.resolve();
      },
    }).fetch,
    hostname: "127.0.0.1",
    port: 0,
  });

  await once(server, "listening");
  // SAFETY: The listening event confirms that serve bound the configured TCP
  // hostname and port, so address() returns AddressInfo rather than a pipe or null.
  const { port } = server.address() as AddressInfo;

  return {
    close: promisify(server.close.bind(server)),
    url: new URL(`http://127.0.0.1:${port}/`),
  };
};
