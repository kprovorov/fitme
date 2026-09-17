import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { createClient } from "~/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link className="font-bold text-lg" href="/dashboard">
          Fitme
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-sm">{user.email}</span>
          <form action="/auth/signout" method="post">
            <Button size="sm" type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-8 px-6 py-8">{children}</main>
    </div>
  );
}
