import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-96 flex-col items-center justify-center gap-8 px-6">
      <SignIn />
    </main>
  );
}
