import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { getClerk } from "~/lib/clerk";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Every Data API call and edge-function invocation carries the Clerk session
// token, which Supabase trusts through third-party auth. Clerk refreshes the
// token itself; signed out, requests go with the anon key alone.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => (await getClerk().session?.getToken()) ?? null,
});
