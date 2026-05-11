export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_targets: {
        Row: {
          ads_target: number
          conversion_rate_target: number
          created_at: string
          data_target: number
          id: string
          mess_target: number
          orders_target: number
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["kpi_period"]
          revenue_target: number
          roas_target: number
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ads_target?: number
          conversion_rate_target?: number
          created_at?: string
          data_target?: number
          id?: string
          mess_target?: number
          orders_target?: number
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["kpi_period"]
          revenue_target?: number
          roas_target?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ads_target?: number
          conversion_rate_target?: number
          created_at?: string
          data_target?: number
          id?: string
          mess_target?: number
          orders_target?: number
          period_end?: string
          period_start?: string
          period_type?: Database["public"]["Enums"]["kpi_period"]
          revenue_target?: number
          roas_target?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_team_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          manager_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          username: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          username: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      report_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          report_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          report_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "slot_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_slots: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          slot_name: string
          slot_time: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          slot_name: string
          slot_time: string
          sort_order: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          slot_name?: string
          slot_time?: string
          sort_order?: number
        }
        Relationships: []
      }
      slot_reports: {
        Row: {
          ads_cost: number
          approved_at: string | null
          approved_by: string | null
          average_order_value: number | null
          closed_orders: number
          conversion_rate: number | null
          cp_daily_revenue: number | null
          cp_data: number | null
          cp_mess: number | null
          cp_total_revenue: number | null
          created_at: string
          daily_data_revenue: number
          data_count: number
          id: string
          mess_count: number
          note: string | null
          recovered_revenue: number | null
          rejected_reason: string | null
          report_date: string
          roas: number | null
          slot_id: string
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          team_id: string | null
          total_orders: number
          total_revenue: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ads_cost?: number
          approved_at?: string | null
          approved_by?: string | null
          average_order_value?: number | null
          closed_orders?: number
          conversion_rate?: number | null
          cp_daily_revenue?: number | null
          cp_data?: number | null
          cp_mess?: number | null
          cp_total_revenue?: number | null
          created_at?: string
          daily_data_revenue?: number
          data_count?: number
          id?: string
          mess_count?: number
          note?: string | null
          recovered_revenue?: number | null
          rejected_reason?: string | null
          report_date: string
          roas?: number | null
          slot_id: string
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          team_id?: string | null
          total_orders?: number
          total_revenue?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ads_cost?: number
          approved_at?: string | null
          approved_by?: string | null
          average_order_value?: number | null
          closed_orders?: number
          conversion_rate?: number | null
          cp_daily_revenue?: number | null
          cp_data?: number | null
          cp_mess?: number | null
          cp_total_revenue?: number | null
          created_at?: string
          daily_data_revenue?: number
          data_count?: number
          id?: string
          mess_count?: number
          note?: string | null
          recovered_revenue?: number | null
          rejected_reason?: string | null
          report_date?: string
          roas?: number | null
          slot_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          team_id?: string | null
          total_orders?: number
          total_revenue?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_reports_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "report_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_reports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          role_in_team: Database["public"]["Enums"]["team_member_role"]
          start_date: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          role_in_team?: Database["public"]["Enums"]["team_member_role"]
          start_date?: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          role_in_team?: Database["public"]["Enums"]["team_member_role"]
          start_date?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          leader_id: string | null
          name: string
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          name: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          name?: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_team_kpi: { Args: { _team_id: string }; Returns: boolean }
      can_view_team: { Args: { _team_id: string }; Returns: boolean }
      can_view_user: { Args: { _user_id: string }; Returns: boolean }
      get_current_profile_id: { Args: never; Returns: string }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_active_user: { Args: never; Returns: boolean }
      is_marketing_manager: { Args: never; Returns: boolean }
      leads_team: { Args: { _team_id: string }; Returns: boolean }
      manager_leads_team: { Args: { _team_id: string }; Returns: boolean }
      manager_leads_user: { Args: { _user_id: string }; Returns: boolean }
      user_in_my_team: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "leader" | "employee" | "marketing_manager"
      kpi_period: "day" | "week" | "month"
      report_status: "draft" | "submitted" | "approved" | "rejected" | "locked"
      team_member_role: "leader" | "employee"
      team_status: "active" | "inactive"
      user_status: "active" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "leader", "employee", "marketing_manager"],
      kpi_period: ["day", "week", "month"],
      report_status: ["draft", "submitted", "approved", "rejected", "locked"],
      team_member_role: ["leader", "employee"],
      team_status: ["active", "inactive"],
      user_status: ["active", "inactive"],
    },
  },
} as const
