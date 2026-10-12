import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { SIGN_IN_PATH } from "~/lib/routes";

// Everything else needs a signed-in User; new pages are protected by default.
const isPublicRoute = createRouteMatcher(["/", `${SIGN_IN_PATH}(.*)`]);

export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicRoute(request)) {
      // Redirects to sign-in with a `redirect_url` back to the requested page.
      await auth.protect();
    }
  },
  { signInUrl: SIGN_IN_PATH }
);

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api)(.*)",
  ],
};
