import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type Log = (event: string, data?: Record<string, unknown>) => void;

export interface ToolContext {
  supabaseClient: SupabaseClient;
  supabaseService: SupabaseClient;
  log: Log;
  onPlanCreated?: (planId: string) => void;
}
