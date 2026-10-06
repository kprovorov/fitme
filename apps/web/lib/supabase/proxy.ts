import type { Database } from "@fitme/supabase";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "~/lib/env";

const PUBLIC_PATHS = ["/", "/login", "/auth"];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some(
    (path) => pathname === path || (path !== "/" && pathname.startsWith(path))
  );

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session cookie if it expired. Do not put logic between
  // client creation and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!(user || isPublicPath(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Keep the query: the OAuth consent page needs its `authorization_id`.
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
