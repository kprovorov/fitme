import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "~/components/ui/button";
import { DASHBOARD_PATH, SIGN_IN_PATH } from "~/lib/routes";

export default async function HomePage() {
  const { isAuthenticated } = await auth();

  if (isAuthenticated) {
    redirect(DASHBOARD_PATH);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-bold text-4xl tracking-tight">Fitme</h1>
      <p className="text-muted-foreground">
        Review your training plans and workout history from any browser. Sign in
        with the same account you use in the Fitme app.
      </p>
      <Link className={buttonVariants({ size: "lg" })} href={SIGN_IN_PATH}>
        Sign in
      </Link>
    </main>
  );
}
