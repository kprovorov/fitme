import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { DASHBOARD_PATH } from "~/lib/routes";

// Signed-out requests never get here: the proxy redirects them to sign-in.
export default function AppLayout({ children }: { children: ReactNode }) {
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
