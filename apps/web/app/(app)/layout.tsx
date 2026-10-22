import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { DASHBOARD_PATH } from "~/lib/routes";

// Signed-out requests never get here: the proxy redirects them to sign-in.
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Server errors in this request carry the User's Clerk id, nothing else.
  const { userId } = await auth();
  if (userId) {
    Sentry.setUser({ id: userId });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link className="font-bold text-lg" href={DASHBOARD_PATH}>
          Fitme
        </Link>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col gap-8 px-6 py-8">{children}</main>
    </div>
  );
}
