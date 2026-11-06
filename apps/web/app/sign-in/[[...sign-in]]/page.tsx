import { SignIn } from "@clerk/nextjs";

const SignInPage = () => (
  <main className="mx-auto flex min-h-dvh max-w-96 flex-col items-center justify-center gap-8 px-6">
    <SignIn />
  </main>
);

export default SignInPage;
