import { useAuth, useSignIn } from "@clerk/expo";
import { closeMenu, setToolsButtonVisible } from "expo-dev-menu";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

const TARGET =
  "/plans/eeff3d5d-4e7e-4961-bbd9-d80be443e735/workouts/99c7dd3f-96c0-4072-8fc3-9fc016d180ec/sessions/292b473e-31ef-45a2-8dc8-0c8b3c22ebb6";

export default function DevSignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const router = useRouter();
  const started = useRef(false);
  const navigated = useRef(false);

  useEffect(() => {
    closeMenu();
    setToolsButtonVisible(false);
  }, []);

  useEffect(() => {
    if (!isLoaded || isSignedIn || started.current) return;
    started.current = true;
    (async () => {
      await signIn.password({
        emailAddress: "fit251+clerk_test@example.com",
        password: "Fit251-9162124d480843d3395b109c",
      });
      if (signIn.status !== "complete") {
        await signIn.mfa.sendEmailCode();
        await signIn.mfa.verifyEmailCode({ code: "424242" });
      }
      await signIn.finalize();
    })();
  }, [isLoaded, isSignedIn, signIn]);

  useEffect(() => {
    if (!isSignedIn || navigated.current) return;
    navigated.current = true;
    setTimeout(() => router.push(TARGET), 1500);
  }, [isSignedIn, router]);

  return null;
}
