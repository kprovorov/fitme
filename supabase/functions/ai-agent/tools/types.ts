import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type Log = (event: string, data?: Record<string, unknown>) => void;

export interface ToolContext {
  log: Log;
  onPlanCreated?: (planId: string) => void;
  onPlanUpdated?: (planId: string) => void;
  supabaseClient: SupabaseClient;
  supabaseService: SupabaseClient;
}
