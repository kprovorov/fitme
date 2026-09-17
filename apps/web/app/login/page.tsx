import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Sign in with your Fitme account. New accounts are created in the
          mobile app.
        </p>
      </div>
      {/* LoginForm reads search params, which requires a Suspense boundary for static prerendering. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
