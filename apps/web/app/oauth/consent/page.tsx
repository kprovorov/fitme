import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { createClient } from "~/lib/supabase/server";
import { decideAuthorization } from "./actions";
import { consentPath, isAuthorizationId } from "./authorization";

export const metadata: Metadata = { title: "Authorize access · Fitme" };

interface ConsentPageProps {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}

const GRANTED_ACCESS = [
  "View your profile and the exercise library",
  "Create, change and delete your training plans",
  "Start, log and delete your workout sessions",
];

function ConsentShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      {children}
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <ConsentShell>
      <Card>
        <CardHeader>
          <CardTitle>Can't complete this request</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Go back to the app that sent you here and connect again.
          </p>
        </CardContent>
      </Card>
    </ConsentShell>
  );
}

const hostOf = (uri: string) => {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
};

/**
 * Authorization (consent) page for Supabase Auth's OAuth 2.1 server: OAuth
 * clients such as the Fitme MCP server's clients land here with an
 * `authorization_id` after `/auth/v1/oauth/authorize`.
 */
export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id: authorizationId, error: decisionError } =
    await searchParams;
  if (!isAuthorizationId(authorizationId)) {
    return <ConsentError message="The authorization request is missing." />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(consentPath(authorizationId))}`);
  }

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) {
    return <ConsentError message={error.message} />;
  }
  // Already approved for these scopes: straight back to the client.
  if (!("authorization_id" in data)) {
    redirect(data.redirect_url);
  }

  const clientName = data.client.name || "An application";

  return (
    <ConsentShell>
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl">Connect to Fitme</h1>
        <p className="text-muted-foreground text-sm">
          <span className="font-semibold text-foreground">{clientName}</span>{" "}
          wants to access your Fitme account ({data.user.email}).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>It will be able to</CardTitle>
          <CardDescription>
            Only allow apps you trust: it acts as you, with the same access you
            have in the Fitme app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {GRANTED_ACCESS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground text-xs">
            <dt>Redirects to</dt>
            <dd className="break-all font-mono">{hostOf(data.redirect_uri)}</dd>
            {data.scope ? (
              <>
                <dt>Scopes</dt>
                <dd className="font-mono">{data.scope}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {decisionError ? (
        <p className="text-destructive text-sm">{decisionError}</p>
      ) : null}

      <form action={decideAuthorization} className="flex gap-3">
        <input name="authorization_id" type="hidden" value={authorizationId} />
        <Button
          className="flex-1"
          name="decision"
          type="submit"
          value="deny"
          variant="outline"
        >
          Deny
        </Button>
        <Button
          className="flex-1"
          name="decision"
          type="submit"
          value="approve"
        >
          Allow
        </Button>
      </form>
    </ConsentShell>
  );
}
