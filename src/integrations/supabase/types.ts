export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          new_value: Json | null;
          old_value: Json | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          asset_group: string;
          asset_type: string;
          assigned_by: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_active: boolean;
          link_url: string | null;
          owner_profile_id: string | null;
          owner_team_id: string | null;
          title: string;
          updated_at: string;
          value: string | null;
        };
        Insert: {
          asset_group: string;
          asset_type: string;
          assigned_by?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          link_url?: string | null;
          owner_profile_id?: string | null;
          owner_team_id?: string | null;
          title: string;
          updated_at?: string;
          value?: string | null;
        };
        Update: {
          asset_group?: string;
          asset_type?: string;
          assigned_by?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          link_url?: string | null;
          owner_profile_id?: string | null;
          owner_team_id?: string | null;
          title?: string;
          updated_at?: string;
          value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assets_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_owner_team_id_fkey";
            columns: ["owner_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_records: {
        Row: {
          attendance_date: string;
          checked_in_at: string | null;
          created_at: string;
          id: string;
          note: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attendance_date: string;
          checked_in_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attendance_date?: string;
          checked_in_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      facebook_ad_spend_campaign_daily: {
        Row: {
          ad_account_id: string;
          campaign_id: string;
          campaign_name: string;
          created_at: string;
          id: string;
          raw: Json | null;
          spend: number;
          spend_date: string;
          synced_at: string;
        };
        Insert: {
          ad_account_id: string;
          campaign_id: string;
          campaign_name: string;
          created_at?: string;
          id?: string;
          raw?: Json | null;
          spend?: number;
          spend_date: string;
          synced_at?: string;
        };
        Update: {
          ad_account_id?: string;
          campaign_id?: string;
          campaign_name?: string;
          created_at?: string;
          id?: string;
          raw?: Json | null;
          spend?: number;
          spend_date?: string;
          synced_at?: string;
        };
        Relationships: [];
      };
      floating_leads: {
        Row: {
          assigned_at: string | null;
          assigned_sale_id: string | null;
          assigned_sale_name: string | null;
          blocked_sale_ids: string[];
          call_1: string | null;
          call_2: string | null;
          call_3: string | null;
          claim_count: number;
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          created_by: string;
          created_by_name: string | null;
          id: string;
          is_closed: boolean;
          last_claimed_at: string | null;
          lead_date: string;
          lifecycle_status: string;
          note: string | null;
          phone: string;
          source: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_sale_id?: string | null;
          assigned_sale_name?: string | null;
          blocked_sale_ids?: string[];
          call_1?: string | null;
          call_2?: string | null;
          call_3?: string | null;
          claim_count?: number;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          created_by: string;
          created_by_name?: string | null;
          id?: string;
          is_closed?: boolean;
          last_claimed_at?: string | null;
          lead_date?: string;
          lifecycle_status?: string;
          note?: string | null;
          phone: string;
          source?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_sale_id?: string | null;
          assigned_sale_name?: string | null;
          blocked_sale_ids?: string[];
          call_1?: string | null;
          call_2?: string | null;
          call_3?: string | null;
          claim_count?: number;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          created_by?: string;
          created_by_name?: string | null;
          id?: string;
          is_closed?: boolean;
          last_claimed_at?: string | null;
          lead_date?: string;
          lifecycle_status?: string;
          note?: string | null;
          phone?: string;
          source?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "floating_leads_assigned_sale_id_fkey";
            columns: ["assigned_sale_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floating_leads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "floating_leads_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_checklist_completions: {
        Row: {
          completed_at: string;
          completion_date: string;
          created_at: string;
          id: string;
          note: string | null;
          proof_url: string | null;
          template_id: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string;
          completion_date: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          proof_url?: string | null;
          template_id: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          completion_date?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          proof_url?: string | null;
          template_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_checklist_completions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "daily_checklist_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_checklist_completions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_checklist_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_checklist_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_task_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          department: string;
          description: string | null;
          id: string;
          is_active: boolean;
          sort_order: number;
          team_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
          team_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_task_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_task_templates_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      intro_sections: {
        Row: {
          content: string | null;
          created_at: string;
          id: string;
          icon: string | null;
          image_url: string | null;
          is_active: boolean;
          link_url: string | null;
          section_key: string;
          sort_order: number;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          id?: string;
          icon?: string | null;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          section_key: string;
          sort_order?: number;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          id?: string;
          icon?: string | null;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          section_key?: string;
          sort_order?: number;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "intro_sections_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_answers: {
        Row: {
          answers: Json;
          completed_at: string;
          created_at: string;
          id: string;
          profile_id: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          section_id: string;
          status: string;
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          completed_at?: string;
          created_at?: string;
          id?: string;
          profile_id: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          section_id: string;
          status?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          completed_at?: string;
          created_at?: string;
          id?: string;
          profile_id?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          section_id?: string;
          status?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_answers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_answers_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_answers_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_card_progress: {
        Row: {
          accepted_commitment: boolean;
          card_id: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          accepted_commitment?: boolean;
          card_id: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          accepted_commitment?: boolean;
          card_id?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_card_progress_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_card_progress_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_cards: {
        Row: {
          content: string | null;
          created_at: string;
          created_by: string | null;
          icon: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          link_url: string | null;
          section_id: string;
          sort_order: number;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          youtube_url: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          section_id: string;
          sort_order?: number;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          youtube_url?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          link_url?: string | null;
          section_id?: string;
          sort_order?: number;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          youtube_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_cards_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_cards_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_cards_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_documents: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          department: string;
          document_type: string | null;
          file_name: string | null;
          file_size: number | null;
          file_type: string;
          file_url: string | null;
          id: string;
          is_active: boolean;
          is_pinned: boolean;
          link_url: string | null;
          mime_type: string | null;
          sort_order: number;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          department?: string;
          document_type?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string;
          file_url?: string | null;
          id?: string;
          is_active?: boolean;
          is_pinned?: boolean;
          link_url?: string | null;
          mime_type?: string | null;
          sort_order?: number;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          department?: string;
          document_type?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string;
          file_url?: string | null;
          id?: string;
          is_active?: boolean;
          is_pinned?: boolean;
          link_url?: string | null;
          mime_type?: string | null;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_documents_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_questions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          options: Json;
          question_text: string;
          question_type: string;
          section_id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          options?: Json;
          question_text: string;
          question_type?: string;
          section_id: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          options?: Json;
          question_text?: string;
          question_type?: string;
          section_id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_questions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_questions_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_questions_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_sections: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          section_key: string;
          sort_order: number;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          section_key: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          section_key?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_sections_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_sections_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      fixed_assets: {
        Row: {
          asset_type: string;
          asset_value: string;
          assigned_at: string;
          assigned_by: string | null;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          asset_type: string;
          asset_value: string;
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          asset_type?: string;
          asset_value?: string;
          assigned_at?: string;
          assigned_by?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fixed_assets_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fixed_assets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kpi_targets: {
        Row: {
          ads_target: number;
          conversion_rate_target: number;
          created_at: string;
          created_by: string | null;
          custom_label: string | null;
          custom_target: number;
          data_target: number;
          id: string;
          mess_target: number;
          note: string | null;
          orders_target: number;
          period_end: string;
          period_start: string;
          period_type: Database["public"]["Enums"]["kpi_period"];
          revenue_target: number;
          roas_target: number;
          team_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          ads_target?: number;
          conversion_rate_target?: number;
          created_at?: string;
          created_by?: string | null;
          custom_label?: string | null;
          custom_target?: number;
          data_target?: number;
          id?: string;
          mess_target?: number;
          note?: string | null;
          orders_target?: number;
          period_end: string;
          period_start: string;
          period_type: Database["public"]["Enums"]["kpi_period"];
          revenue_target?: number;
          roas_target?: number;
          team_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          ads_target?: number;
          conversion_rate_target?: number;
          created_at?: string;
          created_by?: string | null;
          custom_label?: string | null;
          custom_target?: number;
          data_target?: number;
          id?: string;
          mess_target?: number;
          note?: string | null;
          orders_target?: number;
          period_end?: string;
          period_start?: string;
          period_type?: Database["public"]["Enums"]["kpi_period"];
          revenue_target?: number;
          roas_target?: number;
          team_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kpi_targets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpi_targets_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kpi_targets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      salary_rules: {
        Row: {
          base_salary: number;
          commission_rate_month: number | null;
          commission_rate_year: number | null;
          created_at: string;
          id: string;
          is_active: boolean;
          milestone_bonus: number;
          over_kpi_bonus: number;
          revenue_max: number | null;
          revenue_min: number;
          role: string;
          updated_at: string;
        };
        Insert: {
          base_salary?: number;
          commission_rate_month?: number | null;
          commission_rate_year?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          milestone_bonus?: number;
          over_kpi_bonus?: number;
          revenue_max?: number | null;
          revenue_min?: number;
          role: string;
          updated_at?: string;
        };
        Update: {
          base_salary?: number;
          commission_rate_month?: number | null;
          commission_rate_year?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          milestone_bonus?: number;
          over_kpi_bonus?: number;
          revenue_max?: number | null;
          revenue_min?: number;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leave_requests: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          leave_type: string;
          reason: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          start_date: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          leave_type?: string;
          reason: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          start_date: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          leave_type?: string;
          reason?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          start_date?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      manager_team_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          manager_id: string;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          manager_id: string;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          manager_id?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          actor_profile_id: string | null;
          body: string | null;
          created_at: string;
          created_by: string | null;
          entity_id: string | null;
          entity_type: string | null;
          event_key: string | null;
          id: string;
          is_read: boolean;
          kind: string;
          message: string | null;
          metadata: Json;
          scope: string | null;
          severity: string;
          target_scope: string;
          target_profile_id: string | null;
          team_id: string | null;
          title: string;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          actor_profile_id?: string | null;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          event_key?: string | null;
          id?: string;
          is_read?: boolean;
          kind?: string;
          message?: string | null;
          metadata?: Json;
          scope?: string | null;
          severity?: string;
          target_scope?: string;
          target_profile_id?: string | null;
          team_id?: string | null;
          title: string;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          actor_profile_id?: string | null;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          event_key?: string | null;
          id?: string;
          is_read?: boolean;
          kind?: string;
          message?: string | null;
          metadata?: Json;
          scope?: string | null;
          severity?: string;
          target_scope?: string;
          target_profile_id?: string | null;
          team_id?: string | null;
          title?: string;
          type?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_target_profile_id_fkey";
            columns: ["target_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_reads: {
        Row: {
          notification_id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          notification_id: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          notification_id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_task_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          deadline_hours: number;
          description: string | null;
          id: string;
          is_active: boolean;
          link_url: string | null;
          priority: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deadline_hours?: number;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          link_url?: string | null;
          priority?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deadline_hours?: number;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          link_url?: string | null;
          priority?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_task_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_channels: {
        Row: {
          channel: string;
          created_at: string;
          id: string;
          link_url: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          id?: string;
          link_url?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          id?: string;
          link_url?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_channels_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          auth_user_id: string;
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          phone: string | null;
          status: Database["public"]["Enums"]["user_status"];
          updated_at: string;
          username: string;
        };
        Insert: {
          auth_user_id: string;
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
          username: string;
        };
        Update: {
          auth_user_id?: string;
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["user_status"];
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      report_audit_logs: {
        Row: {
          action_type: string;
          actor_profile_id: string | null;
          created_at: string;
          id: string;
          new_payload: Json;
          old_payload: Json | null;
          report_id: string;
        };
        Insert: {
          action_type: string;
          actor_profile_id?: string | null;
          created_at?: string;
          id?: string;
          new_payload: Json;
          old_payload?: Json | null;
          report_id: string;
        };
        Update: {
          action_type?: string;
          actor_profile_id?: string | null;
          created_at?: string;
          id?: string;
          new_payload?: Json;
          old_payload?: Json | null;
          report_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_audit_logs_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_audit_logs_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "slot_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      report_comments: {
        Row: {
          comment: string;
          created_at: string;
          id: string;
          report_id: string;
          user_id: string;
        };
        Insert: {
          comment: string;
          created_at?: string;
          id?: string;
          report_id: string;
          user_id: string;
        };
        Update: {
          comment?: string;
          created_at?: string;
          id?: string;
          report_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_comments_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "slot_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      report_slots: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          slot_name: string;
          slot_time: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          slot_name: string;
          slot_time: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          slot_name?: string;
          slot_time?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      resource_items: {
        Row: {
          content: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_provided: boolean;
          link_url: string | null;
          name: string;
          note: string | null;
          resource_scope: string | null;
          sort_order: number;
          target_team_id: string | null;
          target_user_id: string | null;
          team_id: string | null;
          title: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_provided?: boolean;
          link_url?: string | null;
          name: string;
          note?: string | null;
          resource_scope?: string | null;
          sort_order?: number;
          target_team_id?: string | null;
          target_user_id?: string | null;
          team_id?: string | null;
          title?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_provided?: boolean;
          link_url?: string | null;
          name?: string;
          note?: string | null;
          resource_scope?: string | null;
          sort_order?: number;
          target_team_id?: string | null;
          target_user_id?: string | null;
          team_id?: string | null;
          title?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resource_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_items_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_items_target_team_id_fkey";
            columns: ["target_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_items_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_items_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_provided: boolean;
          note: string | null;
          team_id: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_provided?: boolean;
          note?: string | null;
          team_id?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_provided?: boolean;
          note?: string | null;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resource_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_links_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_links_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_reports: {
        Row: {
          created_at: string;
          floating_data_closed: number;
          floating_data_received: number;
          floating_revenue: number;
          id: string;
          new_customer_revenue: number;
          new_data_closed: number;
          new_data_received: number;
          note: string | null;
          old_customers: number;
          report_date: string;
          slot_key: string;
          slot_time: string;
          status: string;
          submitted_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          floating_data_closed?: number;
          floating_data_received?: number;
          floating_revenue?: number;
          id?: string;
          new_customer_revenue?: number;
          new_data_closed?: number;
          new_data_received?: number;
          note?: string | null;
          old_customers?: number;
          report_date: string;
          slot_key: string;
          slot_time: string;
          status?: string;
          submitted_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          floating_data_closed?: number;
          floating_data_received?: number;
          floating_revenue?: number;
          id?: string;
          new_customer_revenue?: number;
          new_data_closed?: number;
          new_data_received?: number;
          note?: string | null;
          old_customers?: number;
          report_date?: string;
          slot_key?: string;
          slot_time?: string;
          status?: string;
          submitted_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_reports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_kpi_targets: {
        Row: {
          average_order_target: number;
          close_rate_target: number;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          orders_target: number;
          period_end: string;
          period_start: string;
          period_type: Database["public"]["Enums"]["kpi_period"];
          revenue_target: number;
          team_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          average_order_target?: number;
          close_rate_target?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          orders_target?: number;
          period_end: string;
          period_start: string;
          period_type?: Database["public"]["Enums"]["kpi_period"];
          revenue_target?: number;
          team_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          average_order_target?: number;
          close_rate_target?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          orders_target?: number;
          period_end?: string;
          period_start?: string;
          period_type?: Database["public"]["Enums"]["kpi_period"];
          revenue_target?: number;
          team_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sale_kpi_targets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_kpi_targets_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_kpi_targets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      slot_reports: {
        Row: {
          ads_cost: number;
          approved_at: string | null;
          approved_by: string | null;
          average_order_value: number | null;
          closed_orders: number;
          conversion_rate: number | null;
          cp_daily_revenue: number | null;
          cp_data: number | null;
          cp_mess: number | null;
          cp_total_revenue: number | null;
          created_at: string;
          daily_data_revenue: number;
          data_count: number;
          id: string;
          mess_count: number;
          note: string | null;
          recovered_revenue: number | null;
          rejected_reason: string | null;
          report_date: string;
          roas: number | null;
          slot_id: string;
          status: Database["public"]["Enums"]["report_status"];
          submitted_at: string | null;
          team_id: string | null;
          total_orders: number;
          total_revenue: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ads_cost?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          average_order_value?: number | null;
          closed_orders?: number;
          conversion_rate?: number | null;
          cp_daily_revenue?: number | null;
          cp_data?: number | null;
          cp_mess?: number | null;
          cp_total_revenue?: number | null;
          created_at?: string;
          daily_data_revenue?: number;
          data_count?: number;
          id?: string;
          mess_count?: number;
          note?: string | null;
          recovered_revenue?: number | null;
          rejected_reason?: string | null;
          report_date: string;
          roas?: number | null;
          slot_id: string;
          status?: Database["public"]["Enums"]["report_status"];
          submitted_at?: string | null;
          team_id?: string | null;
          total_orders?: number;
          total_revenue?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ads_cost?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          average_order_value?: number | null;
          closed_orders?: number;
          conversion_rate?: number | null;
          cp_daily_revenue?: number | null;
          cp_data?: number | null;
          cp_mess?: number | null;
          cp_total_revenue?: number | null;
          created_at?: string;
          daily_data_revenue?: number;
          data_count?: number;
          id?: string;
          mess_count?: number;
          note?: string | null;
          recovered_revenue?: number | null;
          rejected_reason?: string | null;
          report_date?: string;
          roas?: number | null;
          slot_id?: string;
          status?: Database["public"]["Enums"]["report_status"];
          submitted_at?: string | null;
          team_id?: string | null;
          total_orders?: number;
          total_revenue?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slot_reports_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slot_reports_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "report_slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slot_reports_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slot_reports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      team_memberships: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          is_active: boolean;
          role_in_team: Database["public"]["Enums"]["team_member_role"];
          start_date: string;
          team_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          role_in_team?: Database["public"]["Enums"]["team_member_role"];
          start_date?: string;
          team_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          role_in_team?: Database["public"]["Enums"]["team_member_role"];
          start_date?: string;
          team_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          department: string;
          description: string | null;
          id: string;
          leader_id: string | null;
          name: string;
          status: Database["public"]["Enums"]["team_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department?: string;
          description?: string | null;
          id?: string;
          leader_id?: string | null;
          name: string;
          status?: Database["public"]["Enums"]["team_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department?: string;
          description?: string | null;
          id?: string;
          leader_id?: string | null;
          name?: string;
          status?: Database["public"]["Enums"]["team_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teams_leader_id_fkey";
            columns: ["leader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_completions: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          completion_date: string;
          completion_note: string | null;
          created_at: string;
          id: string;
          note: string | null;
          proof_url: string | null;
          priority: string | null;
          review_feedback: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string | null;
          submitted_at: string | null;
          template_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          completion_date?: string;
          completion_note?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          proof_url?: string | null;
          priority?: string | null;
          review_feedback?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string | null;
          submitted_at?: string | null;
          template_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          completion_date?: string;
          completion_note?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          proof_url?: string | null;
          priority?: string | null;
          review_feedback?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string | null;
          submitted_at?: string | null;
          template_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_completions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "daily_task_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_completions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_read_states: {
        Row: {
          created_at: string;
          id: string;
          last_seen_status: string | null;
          seen_at: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_seen_status?: string | null;
          seen_at?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_seen_status?: string | null;
          seen_at?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_read_states_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_read_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assigned_by: string | null;
          assigned_to: string;
          completed_at: string | null;
          completion_note: string | null;
          created_at: string;
          created_by: string | null;
          deadline: string | null;
          dedupe_key: string | null;
          department: string;
          description: string | null;
          id: string;
          link_url: string | null;
          onboarding_template_id: string | null;
          proof_url: string | null;
          priority: string | null;
          review_feedback: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["task_status"];
          submitted_at: string | null;
          task_date: string;
          team_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_by?: string | null;
          assigned_to: string;
          completed_at?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          deadline?: string | null;
          dedupe_key?: string | null;
          department?: string;
          description?: string | null;
          id?: string;
          link_url?: string | null;
          onboarding_template_id?: string | null;
          proof_url?: string | null;
          priority?: string | null;
          review_feedback?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          submitted_at?: string | null;
          task_date?: string;
          team_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          assigned_by?: string | null;
          assigned_to?: string;
          completed_at?: string | null;
          completion_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          deadline?: string | null;
          dedupe_key?: string | null;
          department?: string;
          description?: string | null;
          id?: string;
          link_url?: string | null;
          onboarding_template_id?: string | null;
          proof_url?: string | null;
          priority?: string | null;
          review_feedback?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          submitted_at?: string | null;
          task_date?: string;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_onboarding_template_id_fkey";
            columns: ["onboarding_template_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_task_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_accounts: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          linked_at: string;
          profile_id: string;
          telegram_chat_id: string;
          telegram_user_id: string | null;
          telegram_username: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          linked_at?: string;
          profile_id: string;
          telegram_chat_id: string;
          telegram_user_id?: string | null;
          telegram_username?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          linked_at?: string;
          profile_id?: string;
          telegram_chat_id?: string;
          telegram_user_id?: string | null;
          telegram_username?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_accounts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_link_codes: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string;
          id: string;
          profile_id: string;
          used_at: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          profile_id: string;
          used_at?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          profile_id?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_notification_logs: {
        Row: {
          created_at: string;
          dedupe_key: string | null;
          error: string | null;
          id: string;
          notification_id: string | null;
          recipient_profile_id: string | null;
          status: string;
          telegram_chat_id: string | null;
        };
        Insert: {
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          notification_id?: string | null;
          recipient_profile_id?: string | null;
          status: string;
          telegram_chat_id?: string | null;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          notification_id?: string | null;
          recipient_profile_id?: string | null;
          status?: string;
          telegram_chat_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_notification_logs_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_notification_logs_recipient_profile_id_fkey";
            columns: ["recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_assign_task_to_team: {
        Args: { _assignee: string; _team_id: string };
        Returns: boolean;
      };
      can_manage_team_kpi: { Args: { _team_id: string }; Returns: boolean };
      can_view_team: { Args: { _team_id: string }; Returns: boolean };
      can_view_user: { Args: { _user_id: string }; Returns: boolean };
      create_task_rpc: {
        Args: {
          p_assigned_to: string;
          p_deadline?: string | null;
          p_description?: string | null;
          p_task_date?: string;
          p_priority?: string | null;
          p_team_id: string;
          p_title: string;
        };
        Returns: Database["public"]["Tables"]["tasks"]["Row"];
      };
      clone_onboarding_tasks_for_user: {
        Args: { p_team_id?: string | null; p_user_id: string };
        Returns: number;
      };
      create_in_app_notification: {
        Args: {
          p_description?: string | null;
          p_entity_id?: string | null;
          p_entity_type?: string | null;
          p_event_key?: string | null;
          p_metadata?: Json;
          p_title: string;
          p_type: string;
          p_user_id: string;
        };
        Returns: string;
      };
      get_current_profile_id: { Args: never; Returns: string };
      get_ranking_entries: {
        Args: { p_from?: string; p_to?: string };
        Returns: {
          avatar_url: string | null;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"] | null;
          streak_days: number;
          team_id: string | null;
          team_name: string;
          total_revenue: number;
          username: string;
        }[];
      };
      get_ranking_directory: {
        Args: never;
        Returns: {
          avatar_url: string | null;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"] | null;
          team_id: string | null;
          team_name: string;
          username: string;
        }[];
      };
      get_visible_profile_directory: {
        Args: never;
        Returns: {
          avatar_url: string | null;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"] | null;
          team_id: string;
          team_name: string;
          username: string;
        }[];
      };
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      is_active_user: { Args: never; Returns: boolean };
      is_manager: { Args: never; Returns: boolean };
      leads_team: { Args: { _team_id: string }; Returns: boolean };
      manager_leads_team: { Args: { _team_id: string }; Returns: boolean };
      manager_leads_user: { Args: { _user_id: string }; Returns: boolean };
      release_expired_floating_leads_for_sale: {
        Args: { p_sale_id: string };
        Returns: number;
      };
      telegram_review_leave_request: {
        Args: { _approved: boolean; _leave_request_id: string; _reviewer_profile_id: string };
        Returns: Json;
      };
      telegram_review_onboarding_answer: {
        Args: {
          _answer_id: string;
          _approved: boolean;
          _feedback?: string | null;
          _reviewer_profile_id: string;
        };
        Returns: Json;
      };
      telegram_review_task: {
        Args: {
          _approved: boolean;
          _entity_id: string;
          _entity_type: string;
          _reviewer_profile_id: string;
        };
        Returns: Json;
      };
      user_active_in_team: {
        Args: { _team_id: string; _user_id: string };
        Returns: boolean;
      };
      user_in_my_team: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      app_role: "admin" | "leader" | "employee" | "manager" | "sale" | "leader_sale";
      kpi_period: "day" | "week" | "month";
      report_status: "draft" | "submitted" | "approved" | "rejected" | "locked";
      task_status: "todo" | "in_progress" | "rejected" | "pending_review" | "done";
      team_member_role: "leader" | "employee";
      team_status: "active" | "inactive";
      user_status: "active" | "inactive";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    Enums: {
      app_role: ["admin", "leader", "employee", "manager", "sale", "leader_sale"],
      kpi_period: ["day", "week", "month"],
      report_status: ["draft", "submitted", "approved", "rejected", "locked"],
      task_status: ["todo", "in_progress", "rejected", "pending_review", "done"],
      team_member_role: ["leader", "employee"],
      team_status: ["active", "inactive"],
      user_status: ["active", "inactive"],
    },
  },
} as const;
