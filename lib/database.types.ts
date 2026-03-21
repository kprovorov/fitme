export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      exercises: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          instructions: string | null;
          muscle_groups: Json | null;
          name: string;
          slug: string;
          thumbnail_url: string | null;
          updated_at: string | null;
          video_url: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          instructions?: string | null;
          muscle_groups?: Json | null;
          name: string;
          slug: string;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          video_url?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          instructions?: string | null;
          muscle_groups?: Json | null;
          name?: string;
          slug?: string;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          video_url?: string | null;
        };
        Relationships: [];
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
      workout_exercise_sets: {
        Row: {
          created_at: string | null;
          id: string;
          order: number;
          reps_recommended: number;
          rest_recommended: number;
          updated_at: string | null;
          weight_recommended: number;
          workout_exercise_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          order: number;
          reps_recommended: number;
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
          exercise_id: string;
          id: string;
          order: number;
          updated_at: string | null;
          workout_id: string;
        };
        Insert: {
          created_at?: string | null;
          exercise_id: string;
          id?: string;
          order: number;
          updated_at?: string | null;
          workout_id: string;
        };
        Update: {
          created_at?: string | null;
          exercise_id?: string;
          id?: string;
          order?: number;
          updated_at?: string | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
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
          exercise_id: string;
          id: string;
          order: number;
          updated_at: string | null;
          workout_session_id: string;
        };
        Insert: {
          created_at?: string | null;
          exercise_id: string;
          id?: string;
          order: number;
          updated_at?: string | null;
          workout_session_id: string;
        };
        Update: {
          created_at?: string | null;
          exercise_id?: string;
          id?: string;
          order?: number;
          updated_at?: string | null;
          workout_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_session_exercises_workout_session_id_fkey";
            columns: ["workout_session_id"];
            isOneToOne: false;
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
          started_at: string;
          updated_at: string | null;
          workout_id: string;
        };
        Insert: {
          created_at?: string | null;
          finished_at?: string | null;
          id?: string;
          started_at: string;
          updated_at?: string | null;
          workout_id: string;
        };
        Update: {
          created_at?: string | null;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          updated_at?: string | null;
          workout_id?: string;
        };
        Relationships: [
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
          created_at: string | null;
          description: string;
          id: string;
          name: string;
          order: number;
          plan_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description: string;
          id?: string;
          name: string;
          order: number;
          plan_id: string;
          updated_at?: string | null;
        };
        Update: {
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
      activate_plan: {
        Args: { plan_id: string };
        Returns: {
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
        SetofOptions: {
          from: "*";
          to: "plans";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_workout_session: {
        Args: { p_workout_id: string };
        Returns: string;
      };
      finish_workout_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      create_plan: {
        Args: { p_plan_data: Json };
        Returns: string;
      };
      convert_measurement_system: {
        Args: { p_new_system: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
