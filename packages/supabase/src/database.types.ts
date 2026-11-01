export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      arnold_sessions: {
        Row: {
          created_at: string;
          session_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      personal_record_initializations: {
        Row: {
          completed_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      personal_records: {
        Row: {
          created_at: string;
          exercise_slug: string;
          id: string;
          kind: string;
          reps: number;
          user_id: string;
          weight: number;
          workout_session_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          exercise_slug: string;
          id?: string;
          kind: string;
          reps: number;
          user_id: string;
          weight: number;
          workout_session_id: string;
        };
        Update: {
          created_at?: string;
          exercise_slug?: string;
          id?: string;
          kind?: string;
          reps?: number;
          user_id?: string;
          weight?: number;
          workout_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_records_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          created_at: string | null;
          deleted_at: string | null;
          description: string | null;
          experience_level: string;
          frequency: number;
          goal: string;
          id: string;
          is_active: boolean;
          name: string | null;
          note: string | null;
          place: string;
          updated_at: string | null;
          user_id: string;
          workout_duration: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          experience_level?: string;
          frequency: number;
          goal: string;
          id?: string;
          is_active?: boolean;
          name?: string | null;
          note?: string | null;
          place: string;
          updated_at?: string | null;
          user_id: string;
          workout_duration?: number;
        };
        Update: {
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          experience_level?: string;
          frequency?: number;
          goal?: string;
          id?: string;
          is_active?: boolean;
          name?: string | null;
          note?: string | null;
          place?: string;
          updated_at?: string | null;
          user_id?: string;
          workout_duration?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          age: number;
          created_at: string | null;
          gender: string;
          height: number;
          id: string;
          measurement_system: string;
          updated_at: string | null;
          user_id: string;
          weight: number;
        };
        ComputedFields: never;
        Insert: {
          age: number;
          created_at?: string | null;
          gender: string;
          height: number;
          id?: string;
          measurement_system?: string;
          updated_at?: string | null;
          user_id: string;
          weight: number;
        };
        Update: {
          age?: number;
          created_at?: string | null;
          gender?: string;
          height?: number;
          id?: string;
          measurement_system?: string;
          updated_at?: string | null;
          user_id?: string;
          weight?: number;
        };
        Relationships: [];
      };
      weekly_goal_changes: {
        Row: {
          id: string;
          recorded_at: string;
          target: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          recorded_at?: string;
          target?: number | null;
          user_id: string;
        };
        Update: {
          id?: string;
          recorded_at?: string;
          target?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_exercise_sets: {
        Row: {
          created_at: string | null;
          id: string;
          order: number;
          reps_recommended: number;
          request_key: string | null;
          rest_recommended: number;
          updated_at: string | null;
          weight_recommended: number;
          workout_exercise_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          id?: string;
          order: number;
          reps_recommended: number;
          request_key?: string | null;
          rest_recommended: number;
          updated_at?: string | null;
          weight_recommended: number;
          workout_exercise_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          order?: number;
          reps_recommended?: number;
          request_key?: string | null;
          rest_recommended?: number;
          updated_at?: string | null;
          weight_recommended?: number;
          workout_exercise_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_exercise_sets_workout_exercise_id_fkey";
            columns: ["workout_exercise_id"];
            isOneToOne: false;
            referencedRelation: "workout_exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_exercises: {
        Row: {
          created_at: string | null;
          exercise_slug: string;
          id: string;
          order: number;
          request_key: string | null;
          updated_at: string | null;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          exercise_slug: string;
          id?: string;
          order: number;
          request_key?: string | null;
          updated_at?: string | null;
          workout_id: string;
        };
        Update: {
          created_at?: string | null;
          exercise_slug?: string;
          id?: string;
          order?: number;
          request_key?: string | null;
          updated_at?: string | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_exercises_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_session_exercise_sets: {
        Row: {
          created_at: string | null;
          id: string;
          logged_at: string | null;
          order: number;
          reps_completed: number | null;
          reps_recommended: number | null;
          rest_recommended: number | null;
          updated_at: string | null;
          weight_completed: number | null;
          weight_recommended: number | null;
          workout_session_exercise_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          id?: string;
          logged_at?: string | null;
          order: number;
          reps_completed?: number | null;
          reps_recommended?: number | null;
          rest_recommended?: number | null;
          updated_at?: string | null;
          weight_completed?: number | null;
          weight_recommended?: number | null;
          workout_session_exercise_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          logged_at?: string | null;
          order?: number;
          reps_completed?: number | null;
          reps_recommended?: number | null;
          rest_recommended?: number | null;
          updated_at?: string | null;
          weight_completed?: number | null;
          weight_recommended?: number | null;
          workout_session_exercise_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_session_exercise_sets_workout_session_exercise_id_fkey";
            columns: ["workout_session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "workout_session_exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_session_exercises: {
        Row: {
          created_at: string | null;
          exercise_slug: string;
          id: string;
          order: number;
          updated_at: string | null;
          workout_session_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          exercise_slug: string;
          id?: string;
          order: number;
          updated_at?: string | null;
          workout_session_id: string;
        };
        Update: {
          created_at?: string | null;
          exercise_slug?: string;
          id?: string;
          order?: number;
          updated_at?: string | null;
          workout_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_session_progress: {
        Row: {
          completed_set_count: number;
          finished_at: string | null;
          started_at: string;
          user_id: string;
          workout_session_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_set_count?: number;
          finished_at?: string | null;
          started_at: string;
          user_id: string;
          workout_session_id: string;
        };
        Update: {
          completed_set_count?: number;
          finished_at?: string | null;
          started_at?: string;
          user_id?: string;
          workout_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_session_progress_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: true;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          created_at: string | null;
          finished_at: string | null;
          id: string;
          plan_changes_applied_at: string | null;
          plan_id: string | null;
          started_at: string;
          updated_at: string | null;
          user_id: string;
          workout_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          finished_at?: string | null;
          id?: string;
          plan_changes_applied_at?: string | null;
          plan_id?: string | null;
          started_at: string;
          updated_at?: string | null;
          user_id: string;
          workout_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          finished_at?: string | null;
          id?: string;
          plan_changes_applied_at?: string | null;
          plan_id?: string | null;
          started_at?: string;
          updated_at?: string | null;
          user_id?: string;
          workout_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      workouts: {
        Row: {
          cover: string | null;
          created_at: string | null;
          description: string;
          id: string;
          name: string;
          order: number;
          plan_id: string;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          cover?: string | null;
          created_at?: string | null;
          description: string;
          id?: string;
          name: string;
          order: number;
          plan_id: string;
          updated_at?: string | null;
        };
        Update: {
          cover?: string | null;
          created_at?: string | null;
          description?: string;
          id?: string;
          name?: string;
          order?: number;
          plan_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workouts_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_id: { Args: Record<PropertyKey, never>; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
