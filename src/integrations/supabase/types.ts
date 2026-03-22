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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      accounting_assignments: {
        Row: {
          accounting_user_id: string
          created_at: string | null
          entity_id: string
          id: string
          role_scope: string
        }
        Insert: {
          accounting_user_id: string
          created_at?: string | null
          entity_id: string
          id?: string
          role_scope?: string
        }
        Update: {
          accounting_user_id?: string
          created_at?: string | null
          entity_id?: string
          id?: string
          role_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_assignments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_entries: {
        Row: {
          accounting_period: string
          ai_suggested: boolean | null
          amount: number
          approved_at: string | null
          approved_by_user_id: string | null
          cost_center: string | null
          created_at: string | null
          created_by_user_id: string | null
          credit_account: string | null
          debit_account: string | null
          description: string | null
          document_id: string | null
          entity_id: string
          entry_date: string
          entry_type: string
          id: string
          invoice_id: string | null
          tax_category_id: string | null
          vat_register: string | null
        }
        Insert: {
          accounting_period: string
          ai_suggested?: boolean | null
          amount: number
          approved_at?: string | null
          approved_by_user_id?: string | null
          cost_center?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          credit_account?: string | null
          debit_account?: string | null
          description?: string | null
          document_id?: string | null
          entity_id: string
          entry_date?: string
          entry_type: string
          id?: string
          invoice_id?: string | null
          tax_category_id?: string | null
          vat_register?: string | null
        }
        Update: {
          accounting_period?: string
          ai_suggested?: boolean | null
          amount?: number
          approved_at?: string | null
          approved_by_user_id?: string | null
          cost_center?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          credit_account?: string | null
          debit_account?: string | null
          description?: string | null
          document_id?: string | null
          entity_id?: string
          entry_date?: string
          entry_type?: string
          id?: string
          invoice_id?: string | null
          tax_category_id?: string | null
          vat_register?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_entries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_entries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_entries_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          clicks: number | null
          created_at: string | null
          created_by: string | null
          id: string
          impressions: number | null
          is_active: boolean | null
          media_type: string
          media_url: string
          placement: string
          target_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          clicks?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          impressions?: number | null
          is_active?: boolean | null
          media_type: string
          media_url: string
          placement: string
          target_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          clicks?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          impressions?: number | null
          is_active?: boolean | null
          media_type?: string
          media_url?: string
          placement?: string
          target_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_communication_settings: {
        Row: {
          created_at: string
          email_enabled: boolean | null
          email_from_address: string | null
          email_from_name: string | null
          email_provider: string | null
          id: string
          sms_api_key_name: string | null
          sms_api_url: string | null
          sms_gateway_enabled: boolean | null
          smtp_host: string | null
          smtp_password_name: string | null
          smtp_port: number | null
          smtp_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          id?: string
          sms_api_key_name?: string | null
          sms_api_url?: string | null
          sms_gateway_enabled?: boolean | null
          smtp_host?: string | null
          smtp_password_name?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_provider?: string | null
          id?: string
          sms_api_key_name?: string | null
          sms_api_url?: string | null
          sms_gateway_enabled?: boolean | null
          smtp_host?: string | null
          smtp_password_name?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_roadmap_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roadmap_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "admin_roadmap_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roadmap_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          description: string | null
          id: string
          module: string | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          module?: string | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          module?: string | null
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      agency_crm_integrations: {
        Row: {
          added_count: number | null
          agency_id: string | null
          api_base_url: string | null
          api_key_secret_name: string | null
          api_login: string | null
          api_password_secret_name: string | null
          created_at: string | null
          deactivated_count: number | null
          error_count: number | null
          ftp_host: string | null
          ftp_login: string | null
          ftp_password_secret_name: string | null
          ftp_photos_path: string | null
          ftp_port: number | null
          ftp_xml_path: string | null
          id: string
          import_mode: string
          import_schedule: string | null
          is_enabled: boolean | null
          last_import_at: string | null
          last_import_message: string | null
          last_import_status: string | null
          provider_code: string | null
          total_offers_in_feed: number | null
          updated_at: string | null
          updated_count: number | null
          xml_login: string | null
          xml_password_secret_name: string | null
          xml_url: string | null
        }
        Insert: {
          added_count?: number | null
          agency_id?: string | null
          api_base_url?: string | null
          api_key_secret_name?: string | null
          api_login?: string | null
          api_password_secret_name?: string | null
          created_at?: string | null
          deactivated_count?: number | null
          error_count?: number | null
          ftp_host?: string | null
          ftp_login?: string | null
          ftp_password_secret_name?: string | null
          ftp_photos_path?: string | null
          ftp_port?: number | null
          ftp_xml_path?: string | null
          id?: string
          import_mode: string
          import_schedule?: string | null
          is_enabled?: boolean | null
          last_import_at?: string | null
          last_import_message?: string | null
          last_import_status?: string | null
          provider_code?: string | null
          total_offers_in_feed?: number | null
          updated_at?: string | null
          updated_count?: number | null
          xml_login?: string | null
          xml_password_secret_name?: string | null
          xml_url?: string | null
        }
        Update: {
          added_count?: number | null
          agency_id?: string | null
          api_base_url?: string | null
          api_key_secret_name?: string | null
          api_login?: string | null
          api_password_secret_name?: string | null
          created_at?: string | null
          deactivated_count?: number | null
          error_count?: number | null
          ftp_host?: string | null
          ftp_login?: string | null
          ftp_password_secret_name?: string | null
          ftp_photos_path?: string | null
          ftp_port?: number | null
          ftp_xml_path?: string | null
          id?: string
          import_mode?: string
          import_schedule?: string | null
          is_enabled?: boolean | null
          last_import_at?: string | null
          last_import_message?: string | null
          last_import_status?: string | null
          provider_code?: string | null
          total_offers_in_feed?: number | null
          updated_at?: string | null
          updated_count?: number | null
          xml_login?: string | null
          xml_password_secret_name?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_crm_integrations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_crm_integrations_provider_code_fkey"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "crm_integration_providers"
            referencedColumns: ["provider_code"]
          },
        ]
      }
      ai_admin_audit_log: {
        Row: {
          action_details: Json
          action_type: string
          admin_user_id: string | null
          affected_entities: Json | null
          ai_conversation_id: string | null
          confirmed_at: string | null
          created_at: string | null
          id: string
          requires_confirmation: boolean | null
        }
        Insert: {
          action_details?: Json
          action_type: string
          admin_user_id?: string | null
          affected_entities?: Json | null
          ai_conversation_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          requires_confirmation?: boolean | null
        }
        Update: {
          action_details?: Json
          action_type?: string
          admin_user_id?: string | null
          affected_entities?: Json | null
          ai_conversation_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          requires_confirmation?: boolean | null
        }
        Relationships: []
      }
      ai_agent_calendar_slots: {
        Row: {
          booking_notes: string | null
          call_id: string | null
          config_id: string
          confirmed_at: string | null
          created_at: string | null
          end_time: string
          id: string
          lead_id: string | null
          reminder_sent: boolean | null
          slot_date: string
          start_time: string
          status: string | null
        }
        Insert: {
          booking_notes?: string | null
          call_id?: string | null
          config_id: string
          confirmed_at?: string | null
          created_at?: string | null
          end_time: string
          id?: string
          lead_id?: string | null
          reminder_sent?: boolean | null
          slot_date: string
          start_time: string
          status?: string | null
        }
        Update: {
          booking_notes?: string | null
          call_id?: string | null
          config_id?: string
          confirmed_at?: string | null
          created_at?: string | null
          end_time?: string
          id?: string
          lead_id?: string | null
          reminder_sent?: boolean | null
          slot_date?: string
          start_time?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_calendar_slots_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_calendar_slots_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_calendar_slots_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_calls: {
        Row: {
          ai_summary: string | null
          booking_slot_id: string | null
          call_sid: string | null
          call_status: string | null
          config_id: string
          cost_minutes: number | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          lead_id: string | null
          outcome: string | null
          sentiment: string | null
          started_at: string | null
          tokens_used: number | null
          transcript: string | null
        }
        Insert: {
          ai_summary?: string | null
          booking_slot_id?: string | null
          call_sid?: string | null
          call_status?: string | null
          config_id: string
          cost_minutes?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string | null
          sentiment?: string | null
          started_at?: string | null
          tokens_used?: number | null
          transcript?: string | null
        }
        Update: {
          ai_summary?: string | null
          booking_slot_id?: string | null
          call_sid?: string | null
          call_status?: string | null
          config_id?: string
          cost_minutes?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string | null
          sentiment?: string | null
          started_at?: string | null
          tokens_used?: number | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_calls_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_configs: {
        Row: {
          agent_type: string | null
          booking_rules: Json | null
          calling_hours_end: string | null
          calling_hours_start: string | null
          company_description: string | null
          company_name: string
          conversation_style: string | null
          created_at: string | null
          faq: Json | null
          id: string
          is_active: boolean | null
          language: string | null
          lead_sources: Json | null
          max_calls_per_day: number | null
          max_minutes_per_month: number | null
          max_retries_per_lead: number | null
          service_area: string | null
          services: Json | null
          updated_at: string | null
          user_id: string
          voice_gender: string | null
          voice_id: string | null
          website_url: string | null
          working_hours: Json | null
        }
        Insert: {
          agent_type?: string | null
          booking_rules?: Json | null
          calling_hours_end?: string | null
          calling_hours_start?: string | null
          company_description?: string | null
          company_name: string
          conversation_style?: string | null
          created_at?: string | null
          faq?: Json | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          lead_sources?: Json | null
          max_calls_per_day?: number | null
          max_minutes_per_month?: number | null
          max_retries_per_lead?: number | null
          service_area?: string | null
          services?: Json | null
          updated_at?: string | null
          user_id: string
          voice_gender?: string | null
          voice_id?: string | null
          website_url?: string | null
          working_hours?: Json | null
        }
        Update: {
          agent_type?: string | null
          booking_rules?: Json | null
          calling_hours_end?: string | null
          calling_hours_start?: string | null
          company_description?: string | null
          company_name?: string
          conversation_style?: string | null
          created_at?: string | null
          faq?: Json | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          lead_sources?: Json | null
          max_calls_per_day?: number | null
          max_minutes_per_month?: number | null
          max_retries_per_lead?: number | null
          service_area?: string | null
          services?: Json | null
          updated_at?: string | null
          user_id?: string
          voice_gender?: string | null
          voice_id?: string | null
          website_url?: string | null
          working_hours?: Json | null
        }
        Relationships: []
      }
      ai_agent_conversations: {
        Row: {
          call_id: string | null
          config_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          outcome: string | null
          outcome_details: Json | null
          sentiment_scores: Json | null
          successful_patterns: Json | null
          transcript: Json | null
        }
        Insert: {
          call_id?: string | null
          config_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string | null
          outcome_details?: Json | null
          sentiment_scores?: Json | null
          successful_patterns?: Json | null
          transcript?: Json | null
        }
        Update: {
          call_id?: string | null
          config_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string | null
          outcome_details?: Json | null
          sentiment_scores?: Json | null
          successful_patterns?: Json | null
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_conversations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversations_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_global_knowledge: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_approved: boolean | null
          pattern: string
          source_config_id: string | null
          success_rate: number | null
          usage_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          pattern: string
          source_config_id?: string | null
          success_rate?: number | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          pattern?: string
          source_config_id?: string | null
          success_rate?: number | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_global_knowledge_source_config_id_fkey"
            columns: ["source_config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_pricing: {
        Row: {
          agent_type: string
          created_at: string | null
          free_minutes_per_month: number | null
          id: string
          is_active: boolean | null
          monthly_base_fee: number | null
          price_per_booking: number | null
          price_per_minute: number
        }
        Insert: {
          agent_type: string
          created_at?: string | null
          free_minutes_per_month?: number | null
          id?: string
          is_active?: boolean | null
          monthly_base_fee?: number | null
          price_per_booking?: number | null
          price_per_minute: number
        }
        Update: {
          agent_type?: string
          created_at?: string | null
          free_minutes_per_month?: number | null
          id?: string
          is_active?: boolean | null
          monthly_base_fee?: number | null
          price_per_booking?: number | null
          price_per_minute?: number
        }
        Relationships: []
      }
      ai_agent_types: {
        Row: {
          base_prompt: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name_pl: string
          type_key: string
        }
        Insert: {
          base_prompt?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name_pl: string
          type_key: string
        }
        Update: {
          base_prompt?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name_pl?: string
          type_key?: string
        }
        Relationships: []
      }
      ai_agent_usage: {
        Row: {
          bookings_count: number | null
          calls_count: number | null
          config_id: string
          created_at: string | null
          id: string
          is_limit_reached: boolean | null
          minutes_used: number | null
          month: string
          tokens_used: number | null
          updated_at: string | null
        }
        Insert: {
          bookings_count?: number | null
          calls_count?: number | null
          config_id: string
          created_at?: string | null
          id?: string
          is_limit_reached?: boolean | null
          minutes_used?: number | null
          month: string
          tokens_used?: number | null
          updated_at?: string | null
        }
        Update: {
          bookings_count?: number | null
          calls_count?: number | null
          config_id?: string
          created_at?: string | null
          id?: string
          is_limit_reached?: boolean | null
          minutes_used?: number | null
          month?: string
          tokens_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_usage_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      ai_call_business_profiles: {
        Row: {
          business_description: string | null
          config_id: string
          created_at: string | null
          faq_json: Json | null
          id: string
          last_script_generation_at: string | null
          pricing_notes: string | null
          rules_json: Json | null
          services_json: Json | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          business_description?: string | null
          config_id: string
          created_at?: string | null
          faq_json?: Json | null
          id?: string
          last_script_generation_at?: string | null
          pricing_notes?: string | null
          rules_json?: Json | null
          services_json?: Json | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          business_description?: string | null
          config_id?: string
          created_at?: string | null
          faq_json?: Json | null
          id?: string
          last_script_generation_at?: string | null
          pricing_notes?: string | null
          rules_json?: Json | null
          services_json?: Json | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_business_profiles_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: true
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_company_whitelist: {
        Row: {
          added_by: string | null
          company_name: string | null
          created_at: string | null
          id: string
          nip: string
          notes: string | null
          status: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          added_by?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          nip: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          added_by?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          nip?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      ai_call_legal_consents: {
        Row: {
          accepted: boolean | null
          accepted_at: string | null
          config_id: string | null
          consent_type: string
          created_at: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted?: boolean | null
          accepted_at?: string | null
          config_id?: string | null
          consent_type: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
          version?: string
        }
        Update: {
          accepted?: boolean | null
          accepted_at?: string | null
          config_id?: string | null
          consent_type?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_legal_consents_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_queue: {
        Row: {
          completed_at: string | null
          config_id: string
          created_at: string | null
          id: string
          last_error: string | null
          lead_id: string
          max_retries: number | null
          priority: number | null
          processing_started_at: string | null
          retry_count: number | null
          scheduled_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          config_id: string
          created_at?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          max_retries?: number | null
          priority?: number | null
          processing_started_at?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          config_id?: string
          created_at?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          max_retries?: number | null
          priority?: number | null
          processing_started_at?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_queue_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_call_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_scripts: {
        Row: {
          config_id: string
          content_json: Json
          created_at: string | null
          created_by: string | null
          id: string
          language: string | null
          scenario_type: string | null
          status: string | null
          style: string | null
          title: string | null
          updated_at: string | null
          version: number | null
          voice_id: string | null
        }
        Insert: {
          config_id: string
          content_json?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          language?: string | null
          scenario_type?: string | null
          status?: string | null
          style?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number | null
          voice_id?: string | null
        }
        Update: {
          config_id?: string
          content_json?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          language?: string | null
          scenario_type?: string | null
          status?: string | null
          style?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_scripts_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_user_whitelist: {
        Row: {
          added_by: string | null
          created_at: string | null
          email: string
          id: string
          notes: string | null
          status: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          email: string
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          email?: string
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      ai_conversation_sessions: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          messages: Json | null
          pending_action: Json | null
          session_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          pending_action?: Json | null
          session_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          pending_action?: Json | null
          session_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string | null
          id: string
          is_starred: boolean | null
          mode: string | null
          project_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_starred?: boolean | null
          mode?: string | null
          project_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_starred?: boolean | null
          mode?: string | null
          project_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "workspace_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_history: {
        Row: {
          ai_type: string | null
          created_at: string | null
          credits_used: number
          id: string
          model_used: string | null
          query_summary: string | null
          query_type: string
          response_time_ms: number | null
          tokens_used: number | null
          user_id: string | null
          was_free: boolean | null
        }
        Insert: {
          ai_type?: string | null
          created_at?: string | null
          credits_used: number
          id?: string
          model_used?: string | null
          query_summary?: string | null
          query_type: string
          response_time_ms?: number | null
          tokens_used?: number | null
          user_id?: string | null
          was_free?: boolean | null
        }
        Update: {
          ai_type?: string | null
          created_at?: string | null
          credits_used?: number
          id?: string
          model_used?: string | null
          query_summary?: string | null
          query_type?: string
          response_time_ms?: number | null
          tokens_used?: number | null
          user_id?: string | null
          was_free?: boolean | null
        }
        Relationships: []
      }
      ai_credit_packages: {
        Row: {
          created_at: string | null
          credits: number
          id: string
          is_active: boolean | null
          name: string
          price_pln: number
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          credits: number
          id?: string
          is_active?: boolean | null
          name: string
          price_pln: number
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          credits?: number
          id?: string
          is_active?: boolean | null
          name?: string
          price_pln?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      ai_feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          flag_key: string
          flag_name: string
          id: string
          is_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          flag_key: string
          flag_name: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          flag_key?: string
          flag_name?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_feedback_events: {
        Row: {
          conversion_result: string | null
          corrected_version: string | null
          created_at: string | null
          entity_id: string | null
          error_type: string | null
          feature: string
          id: string
          metadata: Json | null
          rating: string | null
          request_log_id: string | null
          user_id: string | null
        }
        Insert: {
          conversion_result?: string | null
          corrected_version?: string | null
          created_at?: string | null
          entity_id?: string | null
          error_type?: string | null
          feature: string
          id?: string
          metadata?: Json | null
          rating?: string | null
          request_log_id?: string | null
          user_id?: string | null
        }
        Update: {
          conversion_result?: string | null
          corrected_version?: string | null
          created_at?: string | null
          entity_id?: string | null
          error_type?: string | null
          feature?: string
          id?: string
          metadata?: Json | null
          rating?: string | null
          request_log_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_events_request_log_id_fkey"
            columns: ["request_log_id"]
            isOneToOne: false
            referencedRelation: "ai_requests_log"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_function_mapping: {
        Row: {
          category: string
          created_at: string | null
          custom_prompt: string | null
          function_description: string | null
          function_key: string
          function_name: string
          id: string
          is_enabled: boolean | null
          model_override: string | null
          provider_key: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          custom_prompt?: string | null
          function_description?: string | null
          function_key: string
          function_name: string
          id?: string
          is_enabled?: boolean | null
          model_override?: string | null
          provider_key?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          custom_prompt?: string | null
          function_description?: string | null
          function_key?: string
          function_name?: string
          id?: string
          is_enabled?: boolean | null
          model_override?: string | null
          provider_key?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_guest_usage: {
        Row: {
          created_at: string | null
          device_fingerprint: string | null
          id: string
          ip_address: string
          query_count: number | null
          usage_date: string | null
        }
        Insert: {
          created_at?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address: string
          query_count?: number | null
          usage_date?: string | null
        }
        Update: {
          created_at?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address?: string
          query_count?: number | null
          usage_date?: string | null
        }
        Relationships: []
      }
      ai_jobs: {
        Row: {
          created_at: string | null
          entity_id: string | null
          id: string
          input_snapshot: Json | null
          job_type: string
          output_snapshot: Json | null
          provider: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          id?: string
          input_snapshot?: Json | null
          job_type: string
          output_snapshot?: Json | null
          provider?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          id?: string
          input_snapshot?: Json | null
          job_type?: string
          output_snapshot?: Json | null
          provider?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_base: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          question: string
          updated_at: string | null
          use_count: number | null
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          question: string
          updated_at?: string | null
          use_count?: number | null
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          question?: string
          updated_at?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      ai_learning_consent: {
        Row: {
          consent_given: boolean | null
          consented_at: string | null
          consented_by: string | null
          created_at: string | null
          entity_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          consent_given?: boolean | null
          consented_at?: string | null
          consented_by?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          consent_given?: boolean | null
          consented_at?: string | null
          consented_by?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_limits_config: {
        Row: {
          budget_pln_per_month: number | null
          created_at: string | null
          enforcement_mode: string | null
          id: string
          max_documents_per_day: number | null
          max_images_per_day: number | null
          max_requests_per_day: number | null
          max_tokens_per_day: number | null
          scope: string
          scope_id: string | null
          updated_at: string | null
        }
        Insert: {
          budget_pln_per_month?: number | null
          created_at?: string | null
          enforcement_mode?: string | null
          id?: string
          max_documents_per_day?: number | null
          max_images_per_day?: number | null
          max_requests_per_day?: number | null
          max_tokens_per_day?: number | null
          scope?: string
          scope_id?: string | null
          updated_at?: string | null
        }
        Update: {
          budget_pln_per_month?: number | null
          created_at?: string | null
          enforcement_mode?: string | null
          id?: string
          max_documents_per_day?: number | null
          max_images_per_day?: number | null
          max_requests_per_day?: number | null
          max_tokens_per_day?: number | null
          scope?: string
          scope_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          images: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          images?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          images?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_photo_edits: {
        Row: {
          created_at: string | null
          created_by: string | null
          edited_url: string
          id: string
          instruction: string
          listing_id: string
          listing_type: string
          original_url: string
          photo_index: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          edited_url: string
          id?: string
          instruction: string
          listing_id: string
          listing_type: string
          original_url: string
          photo_index?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          edited_url?: string
          id?: string
          instruction?: string
          listing_id?: string
          listing_type?: string
          original_url?: string
          photo_index?: number
        }
        Relationships: []
      }
      ai_pricing: {
        Row: {
          created_at: string | null
          credits_per_use: number | null
          description: string | null
          description_en: string | null
          feature_key: string
          id: string
          is_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credits_per_use?: number | null
          description?: string | null
          description_en?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credits_per_use?: number | null
          description?: string | null
          description_en?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_pro_exemptions: {
        Row: {
          created_at: string | null
          created_by_user_id: string | null
          email: string
          id: string
          note: string | null
          scope: Json | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_user_id?: string | null
          email: string
          id?: string
          note?: string | null
          scope?: Json | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string | null
          email?: string
          id?: string
          note?: string | null
          scope?: Json | null
          valid_until?: string | null
        }
        Relationships: []
      }
      ai_pro_pricing_config: {
        Row: {
          billing_mode: string | null
          created_at: string | null
          currency: string | null
          id: string
          price_pln_monthly: number | null
          show_paywall: boolean | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          billing_mode?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          price_pln_monthly?: number | null
          show_paywall?: boolean | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          billing_mode?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          price_pln_monthly?: number | null
          show_paywall?: boolean | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_pro_subscriptions: {
        Row: {
          activated_at: string | null
          created_at: string | null
          disabled_at: string | null
          entity_id: string | null
          id: string
          price_snapshot: Json | null
          status: string
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string | null
          disabled_at?: string | null
          entity_id?: string | null
          id?: string
          price_snapshot?: Json | null
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string | null
          disabled_at?: string | null
          entity_id?: string | null
          id?: string
          price_snapshot?: Json | null
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_pro_subscriptions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          admin_note: string | null
          api_key_encrypted: string | null
          created_at: string | null
          daily_limit: number | null
          default_model: string | null
          display_name: string
          id: string
          is_enabled: boolean | null
          provider_key: string
          timeout_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          admin_note?: string | null
          api_key_encrypted?: string | null
          created_at?: string | null
          daily_limit?: number | null
          default_model?: string | null
          display_name: string
          id?: string
          is_enabled?: boolean | null
          provider_key: string
          timeout_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_note?: string | null
          api_key_encrypted?: string | null
          created_at?: string | null
          daily_limit?: number | null
          default_model?: string | null
          display_name?: string
          id?: string
          is_enabled?: boolean | null
          provider_key?: string
          timeout_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_quality_metrics: {
        Row: {
          avg_response_time_ms: number | null
          conversion_rate: number | null
          correction_rate: number | null
          created_at: string | null
          entity_id: string | null
          feature: string
          id: string
          period_end: string
          period_start: string
          successful_requests: number | null
          thumbs_down: number | null
          thumbs_up: number | null
          total_requests: number | null
        }
        Insert: {
          avg_response_time_ms?: number | null
          conversion_rate?: number | null
          correction_rate?: number | null
          created_at?: string | null
          entity_id?: string | null
          feature: string
          id?: string
          period_end: string
          period_start: string
          successful_requests?: number | null
          thumbs_down?: number | null
          thumbs_up?: number | null
          total_requests?: number | null
        }
        Update: {
          avg_response_time_ms?: number | null
          conversion_rate?: number | null
          correction_rate?: number | null
          created_at?: string | null
          entity_id?: string | null
          feature?: string
          id?: string
          period_end?: string
          period_start?: string
          successful_requests?: number | null
          thumbs_down?: number | null
          thumbs_up?: number | null
          total_requests?: number | null
        }
        Relationships: []
      }
      ai_query_costs: {
        Row: {
          cost_credits: number
          created_at: string | null
          description: string | null
          id: string
          query_type: string
        }
        Insert: {
          cost_credits?: number
          created_at?: string | null
          description?: string | null
          id?: string
          query_type: string
        }
        Update: {
          cost_credits?: number
          created_at?: string | null
          description?: string | null
          id?: string
          query_type?: string
        }
        Relationships: []
      }
      ai_requests_log: {
        Row: {
          actor_user_id: string | null
          cache_hit: boolean | null
          cost_estimate: number | null
          created_at: string | null
          error_message: string | null
          feature: string
          id: string
          input_snapshot: Json | null
          mode: string | null
          model: string | null
          output_snapshot: Json | null
          provider: string | null
          response_time_ms: number | null
          status: string | null
          task_type: string | null
          tenant_id: string | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          actor_user_id?: string | null
          cache_hit?: boolean | null
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          feature: string
          id?: string
          input_snapshot?: Json | null
          mode?: string | null
          model?: string | null
          output_snapshot?: Json | null
          provider?: string | null
          response_time_ms?: number | null
          status?: string | null
          task_type?: string | null
          tenant_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          actor_user_id?: string | null
          cache_hit?: boolean | null
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          feature?: string
          id?: string
          input_snapshot?: Json | null
          mode?: string | null
          model?: string | null
          output_snapshot?: Json | null
          provider?: string | null
          response_time_ms?: number | null
          status?: string | null
          task_type?: string | null
          tenant_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      ai_response_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          expires_at: string
          feature: string
          id: string
          mode: string | null
          query_hash: string
          response_data: Json
          tenant_id: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          expires_at: string
          feature: string
          id?: string
          mode?: string | null
          query_hash: string
          response_data: Json
          tenant_id?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          expires_at?: string
          feature?: string
          id?: string
          mode?: string | null
          query_hash?: string
          response_data?: Json
          tenant_id?: string | null
        }
        Relationships: []
      }
      ai_routing_modes: {
        Row: {
          cache_ttl_minutes: number | null
          complexity_threshold: number | null
          created_at: string | null
          fallback_model: string | null
          fallback_provider: string | null
          icon_name: string | null
          id: string
          is_enabled: boolean | null
          max_tokens: number | null
          mode_description: string | null
          mode_key: string
          mode_name: string
          primary_model: string
          primary_provider: string
          sort_order: number | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          upgraded_model: string | null
          upgraded_provider: string | null
        }
        Insert: {
          cache_ttl_minutes?: number | null
          complexity_threshold?: number | null
          created_at?: string | null
          fallback_model?: string | null
          fallback_provider?: string | null
          icon_name?: string | null
          id?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          mode_description?: string | null
          mode_key: string
          mode_name: string
          primary_model?: string
          primary_provider?: string
          sort_order?: number | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          upgraded_model?: string | null
          upgraded_provider?: string | null
        }
        Update: {
          cache_ttl_minutes?: number | null
          complexity_threshold?: number | null
          created_at?: string | null
          fallback_model?: string | null
          fallback_provider?: string | null
          icon_name?: string | null
          id?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          mode_description?: string | null
          mode_key?: string
          mode_name?: string
          primary_model?: string
          primary_provider?: string
          sort_order?: number | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          upgraded_model?: string | null
          upgraded_provider?: string | null
        }
        Relationships: []
      }
      ai_routing_rules: {
        Row: {
          allow_fallback: boolean | null
          created_at: string | null
          id: string
          primary_provider_key: string | null
          secondary_provider_key: string | null
          task_type: string
          tertiary_provider_key: string | null
          updated_at: string | null
        }
        Insert: {
          allow_fallback?: boolean | null
          created_at?: string | null
          id?: string
          primary_provider_key?: string | null
          secondary_provider_key?: string | null
          task_type: string
          tertiary_provider_key?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_fallback?: boolean | null
          created_at?: string | null
          id?: string
          primary_provider_key?: string | null
          secondary_provider_key?: string | null
          task_type?: string
          tertiary_provider_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_routing_rules_primary_provider_key_fkey"
            columns: ["primary_provider_key"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["provider_key"]
          },
          {
            foreignKeyName: "ai_routing_rules_secondary_provider_key_fkey"
            columns: ["secondary_provider_key"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["provider_key"]
          },
          {
            foreignKeyName: "ai_routing_rules_tertiary_provider_key_fkey"
            columns: ["tertiary_provider_key"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      ai_settings: {
        Row: {
          ai_enabled: boolean | null
          ai_model: string | null
          ai_photo_enabled: boolean | null
          ai_provider: string | null
          ai_search_enabled: boolean | null
          ai_seo_enabled: boolean | null
          created_at: string | null
          custom_api_key_encrypted: string | null
          elevenlabs_api_key_encrypted: string | null
          gemini_api_key_encrypted: string | null
          google_tts_api_key_encrypted: string | null
          guest_daily_limit: number | null
          id: string
          openai_api_key_encrypted: string | null
          stt_provider: string | null
          system_prompt: string | null
          tts_enabled: boolean | null
          tts_provider: string | null
          tts_voice_name: string | null
          updated_at: string | null
          user_monthly_limit: number | null
        }
        Insert: {
          ai_enabled?: boolean | null
          ai_model?: string | null
          ai_photo_enabled?: boolean | null
          ai_provider?: string | null
          ai_search_enabled?: boolean | null
          ai_seo_enabled?: boolean | null
          created_at?: string | null
          custom_api_key_encrypted?: string | null
          elevenlabs_api_key_encrypted?: string | null
          gemini_api_key_encrypted?: string | null
          google_tts_api_key_encrypted?: string | null
          guest_daily_limit?: number | null
          id?: string
          openai_api_key_encrypted?: string | null
          stt_provider?: string | null
          system_prompt?: string | null
          tts_enabled?: boolean | null
          tts_provider?: string | null
          tts_voice_name?: string | null
          updated_at?: string | null
          user_monthly_limit?: number | null
        }
        Update: {
          ai_enabled?: boolean | null
          ai_model?: string | null
          ai_photo_enabled?: boolean | null
          ai_provider?: string | null
          ai_search_enabled?: boolean | null
          ai_seo_enabled?: boolean | null
          created_at?: string | null
          custom_api_key_encrypted?: string | null
          elevenlabs_api_key_encrypted?: string | null
          gemini_api_key_encrypted?: string | null
          google_tts_api_key_encrypted?: string | null
          guest_daily_limit?: number | null
          id?: string
          openai_api_key_encrypted?: string | null
          stt_provider?: string | null
          system_prompt?: string | null
          tts_enabled?: boolean | null
          tts_provider?: string | null
          tts_voice_name?: string | null
          updated_at?: string | null
          user_monthly_limit?: number | null
        }
        Relationships: []
      }
      ai_tenant_context: {
        Row: {
          business_description: string | null
          created_at: string | null
          entity_id: string
          id: string
          industry: string | null
          language: string | null
          preferences: Json | null
          pricing_notes: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          business_description?: string | null
          created_at?: string | null
          entity_id: string
          id?: string
          industry?: string | null
          language?: string | null
          preferences?: Json | null
          pricing_notes?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          business_description?: string | null
          created_at?: string | null
          entity_id?: string
          id?: string
          industry?: string | null
          language?: string | null
          preferences?: Json | null
          pricing_notes?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      ai_user_context: {
        Row: {
          created_at: string | null
          id: string
          preferred_language: string | null
          response_style: string | null
          shortcuts: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          preferred_language?: string | null
          response_style?: string | null
          shortcuts?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          preferred_language?: string | null
          response_style?: string | null
          shortcuts?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_user_credits: {
        Row: {
          created_at: string | null
          credits_balance: number | null
          id: string
          monthly_free_used: number | null
          monthly_reset_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_balance?: number | null
          id?: string
          monthly_free_used?: number | null
          monthly_reset_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_balance?: number | null
          id?: string
          monthly_free_used?: number | null
          monthly_reset_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      anonymous_service_prices: {
        Row: {
          city: string | null
          created_at: string
          created_month: string
          engine_capacity: number | null
          id: string
          industry: string | null
          price_gross: number
          price_net: number
          service_name_normalized: string
          vehicle_brand: string | null
          vehicle_model: string | null
          voivodeship: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_month: string
          engine_capacity?: number | null
          id?: string
          industry?: string | null
          price_gross: number
          price_net: number
          service_name_normalized: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          voivodeship?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_month?: string
          engine_capacity?: number | null
          id?: string
          industry?: string | null
          price_gross?: number
          price_net?: number
          service_name_normalized?: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          voivodeship?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_type: string | null
          actor_user_id: string | null
          created_at: string | null
          entity_id: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_type?: string | null
          actor_user_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_type?: string | null
          actor_user_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_invoice_number_sequences: {
        Row: {
          created_at: string | null
          fleet_id: string | null
          id: string
          last_number: number | null
          month: number
          year: number
        }
        Insert: {
          created_at?: string | null
          fleet_id?: string | null
          id?: string
          last_number?: number | null
          month: number
          year: number
        }
        Update: {
          created_at?: string | null
          fleet_id?: string | null
          id?: string
          last_number?: number | null
          month?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_invoice_number_sequences_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_invoicing_consents: {
        Row: {
          accepted_at: string | null
          consent_self_billing: boolean
          consent_terms: boolean
          created_at: string | null
          driver_id: string | null
          id: string
          ip_address: string | null
          revoked_at: string | null
          status: string | null
          terms_version: string
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          consent_self_billing?: boolean
          consent_terms?: boolean
          created_at?: string | null
          driver_id?: string | null
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          status?: string | null
          terms_version?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          consent_self_billing?: boolean
          consent_terms?: boolean
          created_at?: string | null
          driver_id?: string | null
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          status?: string | null
          terms_version?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_invoicing_consents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      autofactoring_agreements: {
        Row: {
          accepted_at: string | null
          agreement_version: string | null
          driver_id: string | null
          id: string
          ip_address: string | null
          is_active: boolean | null
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          agreement_version?: string | null
          driver_id?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          agreement_version?: string | null
          driver_id?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autofactoring_agreements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_appointments: {
        Row: {
          booking_number: string | null
          calendar_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string | null
          completed_at: string | null
          confirmed_at: string | null
          consent_email: boolean | null
          consent_marketing: boolean | null
          consent_sms: boolean | null
          consent_snapshot: Json | null
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          customer_snapshot: Json | null
          end_at: string
          event_id: string | null
          id: string
          internal_notes: string | null
          metadata: Json | null
          notes: string | null
          payment_status: string | null
          price_gross: number | null
          price_net: number | null
          provider_id: string | null
          reminder_sent_24h: boolean | null
          reminder_sent_2h: boolean | null
          resource_id: string | null
          service_id: string | null
          source: string | null
          start_at: string
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          booking_number?: string | null
          calendar_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          consent_email?: boolean | null
          consent_marketing?: boolean | null
          consent_sms?: boolean | null
          consent_snapshot?: Json | null
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_snapshot?: Json | null
          end_at: string
          event_id?: string | null
          id?: string
          internal_notes?: string | null
          metadata?: Json | null
          notes?: string | null
          payment_status?: string | null
          price_gross?: number | null
          price_net?: number | null
          provider_id?: string | null
          reminder_sent_24h?: boolean | null
          reminder_sent_2h?: boolean | null
          resource_id?: string | null
          service_id?: string | null
          source?: string | null
          start_at: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          booking_number?: string | null
          calendar_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          consent_email?: boolean | null
          consent_marketing?: boolean | null
          consent_sms?: boolean | null
          consent_snapshot?: Json | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_snapshot?: Json | null
          end_at?: string
          event_id?: string | null
          id?: string
          internal_notes?: string | null
          metadata?: Json | null
          notes?: string | null
          payment_status?: string | null
          price_gross?: number | null
          price_net?: number | null
          provider_id?: string | null
          reminder_sent_24h?: boolean | null
          reminder_sent_2h?: boolean | null
          resource_id?: string | null
          service_id?: string | null
          source?: string | null
          start_at?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_appointments_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendar_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "booking_services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_availability_config: {
        Row: {
          allow_same_day_booking: boolean | null
          auto_confirm: boolean | null
          buffer_between_bookings_minutes: number | null
          company_id: string | null
          created_at: string | null
          id: string
          max_booking_advance_days: number | null
          max_bookings_per_day: number | null
          min_booking_notice_hours: number | null
          provider_id: string | null
          resource_id: string | null
          slot_duration_minutes: number | null
          slot_increment_minutes: number | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          allow_same_day_booking?: boolean | null
          auto_confirm?: boolean | null
          buffer_between_bookings_minutes?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          max_booking_advance_days?: number | null
          max_bookings_per_day?: number | null
          min_booking_notice_hours?: number | null
          provider_id?: string | null
          resource_id?: string | null
          slot_duration_minutes?: number | null
          slot_increment_minutes?: number | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_same_day_booking?: boolean | null
          auto_confirm?: boolean | null
          buffer_between_bookings_minutes?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          max_booking_advance_days?: number | null
          max_bookings_per_day?: number | null
          min_booking_notice_hours?: number | null
          provider_id?: string | null
          resource_id?: string | null
          slot_duration_minutes?: number | null
          slot_increment_minutes?: number | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_availability_config_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_availability_config_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_availability_rules: {
        Row: {
          company_id: string | null
          created_at: string | null
          day_of_week: number | null
          end_time: string | null
          id: string
          is_available: boolean | null
          name: string | null
          provider_id: string | null
          recurrence_rule: string | null
          resource_id: string | null
          rule_type: string
          specific_date: string | null
          start_time: string | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          name?: string | null
          provider_id?: string | null
          recurrence_rule?: string | null
          resource_id?: string | null
          rule_type: string
          specific_date?: string | null
          start_time?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          name?: string | null
          provider_id?: string | null
          recurrence_rule?: string | null
          resource_id?: string | null
          rule_type?: string
          specific_date?: string | null
          start_time?: string | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_availability_rules_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_availability_rules_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notification_jobs: {
        Row: {
          appointment_id: string | null
          body: string | null
          channel: string
          company_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          max_retries: number | null
          notification_type: string
          provider_id: string | null
          provider_response: Json | null
          recipient_email: string | null
          recipient_phone: string | null
          recipient_type: string
          recipient_user_id: string | null
          retry_count: number | null
          scheduled_at: string
          sent_at: string | null
          status: string | null
          subject: string | null
          template_data: Json | null
          template_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          body?: string | null
          channel: string
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          notification_type: string
          provider_id?: string | null
          provider_response?: Json | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_type: string
          recipient_user_id?: string | null
          retry_count?: number | null
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_data?: Json | null
          template_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          body?: string | null
          channel?: string
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number | null
          notification_type?: string
          provider_id?: string | null
          provider_response?: Json | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          recipient_user_id?: string | null
          retry_count?: number | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          template_data?: Json | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_notification_jobs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "booking_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_public_links: {
        Row: {
          allowed_resources: string[] | null
          allowed_services: string[] | null
          booking_count: number | null
          captcha_enabled: boolean | null
          company_id: string | null
          created_at: string | null
          custom_css: string | null
          custom_message: string | null
          id: string
          is_enabled: boolean | null
          logo_url: string | null
          max_bookings_per_day: number | null
          max_bookings_per_ip_per_day: number | null
          name: string | null
          provider_id: string | null
          require_login: boolean | null
          slug: string
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
          view_count: number | null
        }
        Insert: {
          allowed_resources?: string[] | null
          allowed_services?: string[] | null
          booking_count?: number | null
          captcha_enabled?: boolean | null
          company_id?: string | null
          created_at?: string | null
          custom_css?: string | null
          custom_message?: string | null
          id?: string
          is_enabled?: boolean | null
          logo_url?: string | null
          max_bookings_per_day?: number | null
          max_bookings_per_ip_per_day?: number | null
          name?: string | null
          provider_id?: string | null
          require_login?: boolean | null
          slug: string
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          view_count?: number | null
        }
        Update: {
          allowed_resources?: string[] | null
          allowed_services?: string[] | null
          booking_count?: number | null
          captcha_enabled?: boolean | null
          company_id?: string | null
          created_at?: string | null
          custom_css?: string | null
          custom_message?: string | null
          id?: string
          is_enabled?: boolean | null
          logo_url?: string | null
          max_bookings_per_day?: number | null
          max_bookings_per_ip_per_day?: number | null
          name?: string | null
          provider_id?: string | null
          require_login?: boolean | null
          slug?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_public_links_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_resource_services: {
        Row: {
          created_at: string | null
          custom_duration_minutes: number | null
          custom_price_net: number | null
          id: string
          is_active: boolean | null
          resource_id: string
          service_id: string
        }
        Insert: {
          created_at?: string | null
          custom_duration_minutes?: number | null
          custom_price_net?: number | null
          id?: string
          is_active?: boolean | null
          resource_id: string
          service_id: string
        }
        Update: {
          created_at?: string | null
          custom_duration_minutes?: number | null
          custom_price_net?: number | null
          id?: string
          is_active?: boolean | null
          resource_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_resource_services_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_resource_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "booking_services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_resources: {
        Row: {
          avatar_url: string | null
          color: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          phone: string | null
          provider_id: string | null
          sort_order: number | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          phone?: string | null
          provider_id?: string | null
          sort_order?: number | null
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          phone?: string | null
          provider_id?: string | null
          sort_order?: number | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_resources_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_services: {
        Row: {
          buffer_after_minutes: number | null
          buffer_before_minutes: number | null
          color: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          max_capacity: number | null
          name: string
          price_gross: number | null
          price_net: number | null
          provider_id: string | null
          requires_confirmation: boolean | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          max_capacity?: number | null
          name: string
          price_gross?: number | null
          price_net?: number | null
          provider_id?: string | null
          requires_confirmation?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          buffer_after_minutes?: number | null
          buffer_before_minutes?: number | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          max_capacity?: number | null
          name?: string
          price_gross?: number | null
          price_net?: number | null
          provider_id?: string | null
          requires_confirmation?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_admin_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      calendar_calendars: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_public: boolean | null
          name: string
          owner_id: string
          owner_type: string
          settings: Json | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          name?: string
          owner_id: string
          owner_type: string
          settings?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          name?: string
          owner_id?: string
          owner_type?: string
          settings?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          booking_id: string | null
          calendar_id: string
          color: string | null
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          end_at: string
          id: string
          location: string | null
          location_url: string | null
          metadata: Json | null
          recurrence_end_date: string | null
          recurrence_exception_dates: string[] | null
          recurrence_rule: string | null
          reminder_minutes: number[] | null
          start_at: string
          status: string | null
          title: string
          type: string
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          all_day?: boolean | null
          booking_id?: string | null
          calendar_id: string
          color?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          end_at: string
          id?: string
          location?: string | null
          location_url?: string | null
          metadata?: Json | null
          recurrence_end_date?: string | null
          recurrence_exception_dates?: string[] | null
          recurrence_rule?: string | null
          reminder_minutes?: number[] | null
          start_at: string
          status?: string | null
          title: string
          type: string
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          all_day?: boolean | null
          booking_id?: string | null
          calendar_id?: string
          color?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          end_at?: string
          id?: string
          location?: string | null
          location_url?: string | null
          metadata?: Json | null
          recurrence_end_date?: string | null
          recurrence_exception_dates?: string[] | null
          recurrence_rule?: string | null
          reminder_minutes?: number[] | null
          start_at?: string
          status?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendar_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_user_settings: {
        Row: {
          created_at: string | null
          default_event_duration_minutes: number | null
          default_view: string | null
          id: string
          notification_email: boolean | null
          notification_in_app: boolean | null
          notification_push: boolean | null
          notification_sms: boolean | null
          reminder_defaults: number[] | null
          show_declined: boolean | null
          show_weekends: boolean | null
          time_format: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
          week_starts_on: number | null
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          created_at?: string | null
          default_event_duration_minutes?: number | null
          default_view?: string | null
          id?: string
          notification_email?: boolean | null
          notification_in_app?: boolean | null
          notification_push?: boolean | null
          notification_sms?: boolean | null
          reminder_defaults?: number[] | null
          show_declined?: boolean | null
          show_weekends?: boolean | null
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
          week_starts_on?: number | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          created_at?: string | null
          default_event_duration_minutes?: number | null
          default_view?: string | null
          id?: string
          notification_email?: boolean | null
          notification_in_app?: boolean | null
          notification_push?: boolean | null
          notification_sms?: boolean | null
          reminder_defaults?: number[] | null
          show_declined?: boolean | null
          show_weekends?: boolean | null
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
          week_starts_on?: number | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: []
      }
      car_brands: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      car_models: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_models_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "car_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_reviews: {
        Row: {
          booking_id: string | null
          client_user_id: string
          comment: string | null
          created_at: string | null
          id: string
          is_anonymous: boolean | null
          rating: number
          reviewer_provider_id: string
        }
        Insert: {
          booking_id?: string | null
          client_user_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          rating: number
          reviewer_provider_id: string
        }
        Update: {
          booking_id?: string | null
          client_user_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          rating?: number
          reviewer_provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_reviewer_provider_id_fkey"
            columns: ["reviewer_provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          source: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          source: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          source?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      company_ai_settings: {
        Row: {
          allow_provider_switch: boolean | null
          created_at: string | null
          default_text_provider: string | null
          default_voice_provider: string | null
          entity_id: string | null
          id: string
          speech_speed: number | null
          updated_at: string | null
          user_id: string | null
          voice_name: string | null
          voice_replies_enabled: boolean | null
        }
        Insert: {
          allow_provider_switch?: boolean | null
          created_at?: string | null
          default_text_provider?: string | null
          default_voice_provider?: string | null
          entity_id?: string | null
          id?: string
          speech_speed?: number | null
          updated_at?: string | null
          user_id?: string | null
          voice_name?: string | null
          voice_replies_enabled?: boolean | null
        }
        Update: {
          allow_provider_switch?: boolean | null
          created_at?: string | null
          default_text_provider?: string | null
          default_voice_provider?: string | null
          entity_id?: string | null
          id?: string
          speech_speed?: number | null
          updated_at?: string | null
          user_id?: string | null
          voice_name?: string | null
          voice_replies_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ai_settings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signature_logs: {
        Row: {
          action_type: string
          actor_email: string | null
          actor_type: string
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          rental_id: string
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          actor_type: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          rental_id: string
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          actor_type?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          rental_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signature_logs_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "vehicle_rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_verification_logs: {
        Row: {
          id: string
          is_valid: boolean | null
          nip: string | null
          recipient_id: string | null
          result: Json | null
          verification_type: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          id?: string
          is_valid?: boolean | null
          nip?: string | null
          recipient_id?: string | null
          result?: Json | null
          verification_type: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          id?: string
          is_valid?: boolean | null
          nip?: string | null
          recipient_id?: string | null
          result?: Json | null
          verification_type?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_verification_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "invoice_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_agent_mappings: {
        Row: {
          agent_id: string | null
          auto_created: boolean | null
          created_at: string | null
          crm_agent_email: string | null
          crm_agent_id: string
          crm_agent_name: string | null
          crm_agent_phone: string | null
          id: string
          integration_id: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          auto_created?: boolean | null
          created_at?: string | null
          crm_agent_email?: string | null
          crm_agent_id: string
          crm_agent_name?: string | null
          crm_agent_phone?: string | null
          id?: string
          integration_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          auto_created?: boolean | null
          created_at?: string | null
          crm_agent_email?: string | null
          crm_agent_id?: string
          crm_agent_name?: string | null
          crm_agent_phone?: string | null
          id?: string
          integration_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_agent_mappings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_agent_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "agency_crm_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_import_logs: {
        Row: {
          added_count: number | null
          completed_at: string | null
          created_at: string | null
          deactivated_count: number | null
          details: Json | null
          error_count: number | null
          error_details: Json | null
          id: string
          integration_id: string | null
          log_type: string
          message: string
          started_at: string | null
          status: string | null
          total_in_feed: number | null
          updated_count: number | null
        }
        Insert: {
          added_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          deactivated_count?: number | null
          details?: Json | null
          error_count?: number | null
          error_details?: Json | null
          id?: string
          integration_id?: string | null
          log_type: string
          message: string
          started_at?: string | null
          status?: string | null
          total_in_feed?: number | null
          updated_count?: number | null
        }
        Update: {
          added_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          deactivated_count?: number | null
          details?: Json | null
          error_count?: number | null
          error_details?: Json | null
          id?: string
          integration_id?: string | null
          log_type?: string
          message?: string
          started_at?: string | null
          status?: string | null
          total_in_feed?: number | null
          updated_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_import_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "agency_crm_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_integration_providers: {
        Row: {
          created_at: string | null
          default_config: Json | null
          id: string
          is_enabled: boolean | null
          provider_code: string
          provider_name: string
          supported_import_modes: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_config?: Json | null
          id?: string
          is_enabled?: boolean | null
          provider_code: string
          provider_name: string
          supported_import_modes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_config?: Json | null
          id?: string
          is_enabled?: boolean | null
          provider_code?: string
          provider_name?: string
          supported_import_modes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      csv_imports: {
        Row: {
          city_id: string
          filename: string
          id: string
          imported_at: string
          platform: string
          records_count: number | null
        }
        Insert: {
          city_id: string
          filename: string
          id?: string
          imported_at?: string
          platform: string
          records_count?: number | null
        }
        Update: {
          city_id?: string
          filename?: string
          id?: string
          imported_at?: string
          platform?: string
          records_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "csv_imports_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      document_inbox: {
        Row: {
          ai_extraction: Json | null
          ai_tax_advice: string | null
          booked_entry_id: string | null
          created_at: string | null
          detected_amounts: Json | null
          detected_supplier: Json | null
          entity_id: string
          file_name: string | null
          file_type: string | null
          file_url: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          source: string | null
          status: string | null
          tax_category_id: string | null
          updated_at: string | null
          uploaded_by_user_id: string | null
        }
        Insert: {
          ai_extraction?: Json | null
          ai_tax_advice?: string | null
          booked_entry_id?: string | null
          created_at?: string | null
          detected_amounts?: Json | null
          detected_supplier?: Json | null
          entity_id: string
          file_name?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source?: string | null
          status?: string | null
          tax_category_id?: string | null
          updated_at?: string | null
          uploaded_by_user_id?: string | null
        }
        Update: {
          ai_extraction?: Json | null
          ai_tax_advice?: string | null
          booked_entry_id?: string | null
          created_at?: string | null
          detected_amounts?: Json | null
          detected_supplier?: Json | null
          entity_id?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source?: string | null
          status?: string | null
          tax_category_id?: string | null
          updated_at?: string | null
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_inbox_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_inbox_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          required: boolean | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          required?: boolean | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          required?: boolean | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          driver_id: string | null
          file_name: string | null
          file_url: string | null
          id: string
          notes: string | null
          type: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          type: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          type?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_accumulated_earnings: {
        Row: {
          created_at: string | null
          driver_id: string
          gross_earnings: number
          id: string
          is_paid: boolean | null
          net_earnings: number
          paid_at: string | null
          period_from: string
          period_to: string
        }
        Insert: {
          created_at?: string | null
          driver_id: string
          gross_earnings?: number
          id?: string
          is_paid?: boolean | null
          net_earnings?: number
          paid_at?: string | null
          period_from: string
          period_to: string
        }
        Update: {
          created_at?: string | null
          driver_id?: string
          gross_earnings?: number
          id?: string
          is_paid?: boolean | null
          net_earnings?: number
          paid_at?: string | null
          period_from?: string
          period_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_accumulated_earnings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_additional_fees: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          description: string
          driver_id: string
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          description: string
          driver_id: string
          end_date?: string | null
          frequency: string
          id?: string
          is_active?: boolean | null
          start_date?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          description?: string
          driver_id?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_additional_fees_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_app_users: {
        Row: {
          city_id: string | null
          created_at: string | null
          driver_id: string | null
          payout_requested_at: string | null
          phone: string | null
          plan_type: string | null
          rodo_accepted_at: string | null
          settlement_frequency: string | null
          settlement_plan_id: string | null
          terms_accepted_at: string | null
          user_id: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          payout_requested_at?: string | null
          phone?: string | null
          plan_type?: string | null
          rodo_accepted_at?: string | null
          settlement_frequency?: string | null
          settlement_plan_id?: string | null
          terms_accepted_at?: string | null
          user_id: string
        }
        Update: {
          city_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          payout_requested_at?: string | null
          phone?: string | null
          plan_type?: string | null
          rodo_accepted_at?: string | null
          settlement_frequency?: string | null
          settlement_plan_id?: string | null
          terms_accepted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_app_users_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_users_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_users_settlement_plan_id_fkey"
            columns: ["settlement_plan_id"]
            isOneToOne: false
            referencedRelation: "settlement_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_auto_invoicing_settings: {
        Row: {
          auto_invoice_series: string | null
          billing_day_of_month: number | null
          created_at: string | null
          custom_interval_days: number | null
          driver_id: string | null
          driver_user_id: string
          enabled: boolean | null
          fleet_id: string | null
          frequency: string | null
          id: string
          include_vat_annotation: boolean | null
          invoice_numbering_mode: string | null
          last_run_at: string | null
          next_run_at: string | null
          updated_at: string | null
        }
        Insert: {
          auto_invoice_series?: string | null
          billing_day_of_month?: number | null
          created_at?: string | null
          custom_interval_days?: number | null
          driver_id?: string | null
          driver_user_id: string
          enabled?: boolean | null
          fleet_id?: string | null
          frequency?: string | null
          id?: string
          include_vat_annotation?: boolean | null
          invoice_numbering_mode?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_invoice_series?: string | null
          billing_day_of_month?: number | null
          created_at?: string | null
          custom_interval_days?: number | null
          driver_id?: string | null
          driver_user_id?: string
          enabled?: boolean | null
          fleet_id?: string | null
          frequency?: string | null
          id?: string
          include_vat_annotation?: boolean | null
          invoice_numbering_mode?: string | null
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      driver_b2b_profiles: {
        Row: {
          address_city: string | null
          address_postal_code: string | null
          address_street: string | null
          bank_account: string | null
          bank_name: string | null
          company_name: string
          created_at: string | null
          driver_id: string | null
          driver_user_id: string
          email: string | null
          id: string
          nip: string
          payment_preference: string | null
          phone: string | null
          regon: string | null
          updated_at: string | null
          vat_payer: boolean | null
          vat_verification_response: Json | null
          vat_verification_status: string | null
          vat_verified_at: string | null
        }
        Insert: {
          address_city?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          bank_name?: string | null
          company_name: string
          created_at?: string | null
          driver_id?: string | null
          driver_user_id: string
          email?: string | null
          id?: string
          nip: string
          payment_preference?: string | null
          phone?: string | null
          regon?: string | null
          updated_at?: string | null
          vat_payer?: boolean | null
          vat_verification_response?: Json | null
          vat_verification_status?: string | null
          vat_verified_at?: string | null
        }
        Update: {
          address_city?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          bank_name?: string | null
          company_name?: string
          created_at?: string | null
          driver_id?: string | null
          driver_user_id?: string
          email?: string | null
          id?: string
          nip?: string
          payment_preference?: string | null
          phone?: string | null
          regon?: string | null
          updated_at?: string | null
          vat_payer?: boolean | null
          vat_verification_response?: Json | null
          vat_verification_status?: string | null
          vat_verified_at?: string | null
        }
        Relationships: []
      }
      driver_communications: {
        Row: {
          ai_generated: boolean | null
          content: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          driver_id: string
          error_message: string | null
          escalated_to: string | null
          id: string
          metadata: Json | null
          sent_at: string | null
          status: string
          subject: string | null
          type: string
        }
        Insert: {
          ai_generated?: boolean | null
          content: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          driver_id: string
          error_message?: string | null
          escalated_to?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          type: string
        }
        Update: {
          ai_generated?: boolean | null
          content?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          driver_id?: string
          error_message?: string | null
          escalated_to?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_communications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_debt_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          debt_category: string
          description: string | null
          driver_id: string
          id: string
          metadata: Json | null
          period_from: string
          period_to: string
          settlement_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          debt_category?: string
          description?: string | null
          driver_id: string
          id?: string
          metadata?: Json | null
          period_from: string
          period_to: string
          settlement_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          debt_category?: string
          description?: string | null
          driver_id?: string
          id?: string
          metadata?: Json | null
          period_from?: string
          period_to?: string
          settlement_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_debt_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_debt_transactions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_debts: {
        Row: {
          created_at: string
          current_balance: number
          driver_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_balance?: number
          driver_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_balance?: number
          driver_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_debts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_document_requests: {
        Row: {
          contract_date: string | null
          contract_number: string | null
          created_at: string
          driver_id: string
          file_url: string | null
          filled_data: Json | null
          fleet_id: string | null
          id: string
          signature_ip: string | null
          signature_url: string | null
          signature_user_agent: string | null
          signed_at: string | null
          status: string
          template_code: string
          template_name: string
          updated_at: string
        }
        Insert: {
          contract_date?: string | null
          contract_number?: string | null
          created_at?: string
          driver_id: string
          file_url?: string | null
          filled_data?: Json | null
          fleet_id?: string | null
          id?: string
          signature_ip?: string | null
          signature_url?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          status?: string
          template_code: string
          template_name: string
          updated_at?: string
        }
        Update: {
          contract_date?: string | null
          contract_number?: string | null
          created_at?: string
          driver_id?: string
          file_url?: string | null
          filled_data?: Json | null
          fleet_id?: string | null
          id?: string
          signature_ip?: string | null
          signature_url?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          status?: string
          template_code?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_document_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_document_requests_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_document_statuses: {
        Row: {
          created_at: string
          date_uploaded: string | null
          document_type: string
          driver_id: string
          id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_uploaded?: string | null
          document_type: string
          driver_id: string
          id?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_uploaded?: string | null
          document_type?: string
          driver_id?: string
          id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_document_statuses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          created_at: string
          document_type_id: string
          driver_id: string
          expires_at: string | null
          file_name: string | null
          file_url: string | null
          id: string
          notes: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type_id: string
          driver_id: string
          expires_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type_id?: string
          driver_id?: string
          expires_at?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_fleet_partnerships: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          invoice_frequency: string | null
          is_active: boolean
          is_b2b: boolean
          managing_fleet_id: string
          partner_fleet_id: string
          settled_by: string
          transfer_title_template: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          invoice_frequency?: string | null
          is_active?: boolean
          is_b2b?: boolean
          managing_fleet_id: string
          partner_fleet_id: string
          settled_by?: string
          transfer_title_template?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          invoice_frequency?: string | null
          is_active?: boolean
          is_b2b?: boolean
          managing_fleet_id?: string
          partner_fleet_id?: string
          settled_by?: string
          transfer_title_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_fleet_partnerships_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_fleet_partnerships_managing_fleet_id_fkey"
            columns: ["managing_fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_fleet_partnerships_partner_fleet_id_fkey"
            columns: ["partner_fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_fleet_relations: {
        Row: {
          created_at: string | null
          driver_id: string
          fleet_id: string
          id: string
          is_active: boolean | null
          relation_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          driver_id: string
          fleet_id: string
          id?: string
          is_active?: boolean | null
          relation_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string
          fleet_id?: string
          id?: string
          is_active?: boolean | null
          relation_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_fleet_relations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_fleet_relations_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_invoices: {
        Row: {
          created_at: string
          driver_id: string
          file_name: string | null
          file_url: string | null
          id: string
          invoice_amount: number
          paid_amount: number
          period_month: number
          period_year: number
          remaining_amount: number | null
          sent_at: string | null
          settlement_id: string | null
          status: string
          updated_at: string
          uploaded_at: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          invoice_amount?: number
          paid_amount?: number
          period_month: number
          period_year: number
          remaining_amount?: number | null
          sent_at?: string | null
          settlement_id?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          invoice_amount?: number
          paid_amount?: number
          period_month?: number
          period_year?: number
          remaining_amount?: number | null
          sent_at?: string | null
          settlement_id?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_invoices_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_invoices_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          id: string
          is_active: boolean | null
          lat: number
          lng: number
          speed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          is_active?: boolean | null
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          is_active?: boolean | null
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      driver_platform_ids: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          platform: string
          platform_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          platform: string
          platform_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          platform?: string
          platform_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_platform_ids_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_settlements: {
        Row: {
          bezgotowka: number
          created_at: string
          driver_id: string
          gotowka: number
          id: string
          job_id: string
          platform: string
          przychod_laczny: number
          updated_at: string
          week_end: string
          week_start: string
          wyplata: number
        }
        Insert: {
          bezgotowka?: number
          created_at?: string
          driver_id: string
          gotowka?: number
          id?: string
          job_id: string
          platform: string
          przychod_laczny?: number
          updated_at?: string
          week_end: string
          week_start: string
          wyplata?: number
        }
        Update: {
          bezgotowka?: number
          created_at?: string
          driver_id?: string
          gotowka?: number
          id?: string
          job_id?: string
          platform?: string
          przychod_laczny?: number
          updated_at?: string
          week_end?: string
          week_start?: string
          wyplata?: number
        }
        Relationships: []
      }
      driver_vehicle_assignments: {
        Row: {
          assigned_at: string | null
          created_at: string
          driver_id: string
          fleet_id: string | null
          id: string
          status: string | null
          unassigned_at: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          created_at?: string
          driver_id: string
          fleet_id?: string | null
          id?: string
          status?: string | null
          unassigned_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          created_at?: string
          driver_id?: string
          fleet_id?: string | null
          id?: string
          status?: string | null
          unassigned_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_street: string | null
          b2b_address: string | null
          b2b_apartment_number: string | null
          b2b_building_number: string | null
          b2b_city: string | null
          b2b_company_name: string | null
          b2b_enabled: boolean | null
          b2b_nip: string | null
          b2b_postal_code: string | null
          b2b_street: string | null
          b2b_vat_payer: boolean | null
          bank_account: string | null
          billing_method: string | null
          city_id: string
          consent_fleet_reviews: boolean | null
          consent_fleet_reviews_date: string | null
          correspondence_city: string | null
          correspondence_country: string | null
          correspondence_postal_code: string | null
          correspondence_street: string | null
          created_at: string
          custom_weekly_fee: number | null
          email: string | null
          exclude_from_settlements: boolean | null
          first_name: string | null
          fleet_id: string | null
          fuel_card_number: string | null
          fuel_card_pin: string | null
          getrido_id: string | null
          iban: string | null
          id: string
          is_foreigner: boolean | null
          last_name: string | null
          license_expiry_date: string | null
          license_is_unlimited: boolean | null
          license_issue_date: string | null
          license_number: string | null
          payment_method: string | null
          pesel: string | null
          phone: string | null
          preferred_language: string | null
          registered_via_code: string | null
          registration_date: string | null
          rodo_consent_data_sharing: boolean | null
          rodo_consent_data_storage: boolean | null
          rodo_consent_date: string | null
          taxi_id_number: string | null
          updated_at: string
          user_role: Database["public"]["Enums"]["user_role_type"] | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          b2b_address?: string | null
          b2b_apartment_number?: string | null
          b2b_building_number?: string | null
          b2b_city?: string | null
          b2b_company_name?: string | null
          b2b_enabled?: boolean | null
          b2b_nip?: string | null
          b2b_postal_code?: string | null
          b2b_street?: string | null
          b2b_vat_payer?: boolean | null
          bank_account?: string | null
          billing_method?: string | null
          city_id: string
          consent_fleet_reviews?: boolean | null
          consent_fleet_reviews_date?: string | null
          correspondence_city?: string | null
          correspondence_country?: string | null
          correspondence_postal_code?: string | null
          correspondence_street?: string | null
          created_at?: string
          custom_weekly_fee?: number | null
          email?: string | null
          exclude_from_settlements?: boolean | null
          first_name?: string | null
          fleet_id?: string | null
          fuel_card_number?: string | null
          fuel_card_pin?: string | null
          getrido_id?: string | null
          iban?: string | null
          id?: string
          is_foreigner?: boolean | null
          last_name?: string | null
          license_expiry_date?: string | null
          license_is_unlimited?: boolean | null
          license_issue_date?: string | null
          license_number?: string | null
          payment_method?: string | null
          pesel?: string | null
          phone?: string | null
          preferred_language?: string | null
          registered_via_code?: string | null
          registration_date?: string | null
          rodo_consent_data_sharing?: boolean | null
          rodo_consent_data_storage?: boolean | null
          rodo_consent_date?: string | null
          taxi_id_number?: string | null
          updated_at?: string
          user_role?: Database["public"]["Enums"]["user_role_type"] | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          b2b_address?: string | null
          b2b_apartment_number?: string | null
          b2b_building_number?: string | null
          b2b_city?: string | null
          b2b_company_name?: string | null
          b2b_enabled?: boolean | null
          b2b_nip?: string | null
          b2b_postal_code?: string | null
          b2b_street?: string | null
          b2b_vat_payer?: boolean | null
          bank_account?: string | null
          billing_method?: string | null
          city_id?: string
          consent_fleet_reviews?: boolean | null
          consent_fleet_reviews_date?: string | null
          correspondence_city?: string | null
          correspondence_country?: string | null
          correspondence_postal_code?: string | null
          correspondence_street?: string | null
          created_at?: string
          custom_weekly_fee?: number | null
          email?: string | null
          exclude_from_settlements?: boolean | null
          first_name?: string | null
          fleet_id?: string | null
          fuel_card_number?: string | null
          fuel_card_pin?: string | null
          getrido_id?: string | null
          iban?: string | null
          id?: string
          is_foreigner?: boolean | null
          last_name?: string | null
          license_expiry_date?: string | null
          license_is_unlimited?: boolean | null
          license_issue_date?: string | null
          license_number?: string | null
          payment_method?: string | null
          pesel?: string | null
          phone?: string | null
          preferred_language?: string | null
          registered_via_code?: string | null
          registration_date?: string | null
          rodo_consent_data_sharing?: boolean | null
          rodo_consent_data_storage?: boolean | null
          rodo_consent_date?: string | null
          taxi_id_number?: string | null
          updated_at?: string
          user_role?: Database["public"]["Enums"]["user_role_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          auto_reply_enabled: boolean | null
          created_at: string | null
          display_name: string | null
          email: string
          encrypted_password: string | null
          id: string
          imap_host: string | null
          imap_port: number | null
          is_connected: boolean | null
          last_sync_at: string | null
          provider: string
          smtp_host: string | null
          smtp_port: number | null
          sync_interval_minutes: number | null
          total_count: number | null
          unread_count: number | null
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          auto_reply_enabled?: boolean | null
          created_at?: string | null
          display_name?: string | null
          email: string
          encrypted_password?: string | null
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          is_connected?: boolean | null
          last_sync_at?: string | null
          provider?: string
          smtp_host?: string | null
          smtp_port?: number | null
          sync_interval_minutes?: number | null
          total_count?: number | null
          unread_count?: number | null
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          auto_reply_enabled?: boolean | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          encrypted_password?: string | null
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          is_connected?: boolean | null
          last_sync_at?: string | null
          provider?: string
          smtp_host?: string | null
          smtp_port?: number | null
          sync_interval_minutes?: number | null
          total_count?: number | null
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          account_id: string | null
          ai_generated: boolean | null
          body: string | null
          cc_addresses: string[] | null
          created_at: string | null
          id: string
          reply_to_email_id: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          to_addresses: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_generated?: boolean | null
          body?: string | null
          cc_addresses?: string[] | null
          created_at?: string | null
          id?: string
          reply_to_email_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_generated?: boolean | null
          body?: string | null
          cc_addresses?: string[] | null
          created_at?: string | null
          id?: string
          reply_to_email_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_reply_to_email_id_fkey"
            columns: ["reply_to_email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string | null
          id: string
          password_reset_subject: string | null
          password_reset_subject_en: string | null
          password_reset_subject_kz: string | null
          password_reset_subject_ru: string | null
          password_reset_subject_ua: string | null
          password_reset_template: string | null
          password_reset_template_en: string | null
          password_reset_template_kz: string | null
          password_reset_template_ru: string | null
          password_reset_template_ua: string | null
          registration_subject: string | null
          registration_subject_en: string | null
          registration_subject_kz: string | null
          registration_subject_ru: string | null
          registration_subject_ua: string | null
          registration_template: string | null
          registration_template_en: string | null
          registration_template_kz: string | null
          registration_template_ru: string | null
          registration_template_ua: string | null
          sender_email: string | null
          sender_name: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_provider: string | null
          smtp_secure: boolean | null
          smtp_user: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_reset_subject?: string | null
          password_reset_subject_en?: string | null
          password_reset_subject_kz?: string | null
          password_reset_subject_ru?: string | null
          password_reset_subject_ua?: string | null
          password_reset_template?: string | null
          password_reset_template_en?: string | null
          password_reset_template_kz?: string | null
          password_reset_template_ru?: string | null
          password_reset_template_ua?: string | null
          registration_subject?: string | null
          registration_subject_en?: string | null
          registration_subject_kz?: string | null
          registration_subject_ru?: string | null
          registration_subject_ua?: string | null
          registration_template?: string | null
          registration_template_en?: string | null
          registration_template_kz?: string | null
          registration_template_ru?: string | null
          registration_template_ua?: string | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_provider?: string | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          password_reset_subject?: string | null
          password_reset_subject_en?: string | null
          password_reset_subject_kz?: string | null
          password_reset_subject_ru?: string | null
          password_reset_subject_ua?: string | null
          password_reset_template?: string | null
          password_reset_template_en?: string | null
          password_reset_template_kz?: string | null
          password_reset_template_ru?: string | null
          password_reset_template_ua?: string | null
          registration_subject?: string | null
          registration_subject_en?: string | null
          registration_subject_kz?: string | null
          registration_subject_ru?: string | null
          registration_subject_ua?: string | null
          registration_template?: string | null
          registration_template_en?: string | null
          registration_template_kz?: string | null
          registration_template_ru?: string | null
          registration_template_ua?: string | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_provider?: string | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      emails: {
        Row: {
          account_id: string
          ai_action_items: Json | null
          ai_analyzed_at: string | null
          ai_category: string | null
          ai_priority: string | null
          ai_suggested_replies: Json | null
          ai_summary: string | null
          body_html: string | null
          body_text: string | null
          cc_addresses: string[] | null
          created_at: string | null
          folder: string | null
          from_address: string | null
          from_name: string | null
          has_attachments: boolean | null
          id: string
          is_important: boolean | null
          is_read: boolean | null
          is_spam: boolean | null
          message_id: string | null
          received_at: string | null
          subject: string | null
          to_addresses: string[] | null
          user_id: string
        }
        Insert: {
          account_id: string
          ai_action_items?: Json | null
          ai_analyzed_at?: string | null
          ai_category?: string | null
          ai_priority?: string | null
          ai_suggested_replies?: Json | null
          ai_summary?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: string[] | null
          created_at?: string | null
          folder?: string | null
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          is_important?: boolean | null
          is_read?: boolean | null
          is_spam?: boolean | null
          message_id?: string | null
          received_at?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          user_id: string
        }
        Update: {
          account_id?: string
          ai_action_items?: Json | null
          ai_analyzed_at?: string | null
          ai_category?: string | null
          ai_priority?: string | null
          ai_suggested_replies?: Json | null
          ai_summary?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: string[] | null
          created_at?: string | null
          folder?: string | null
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          is_important?: boolean | null
          is_read?: boolean | null
          is_spam?: boolean | null
          message_id?: string | null
          received_at?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_street: string | null
          bank_account: string | null
          bank_name: string | null
          created_at: string | null
          default_currency: string | null
          email: string | null
          email_for_invoices: string | null
          id: string
          is_active: boolean | null
          krs: string | null
          logo_url: string | null
          name: string
          nip: string | null
          owner_user_id: string | null
          phone: string | null
          regon: string | null
          short_name: string | null
          type: string
          updated_at: string | null
          vat_payer: boolean | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string | null
          default_currency?: string | null
          email?: string | null
          email_for_invoices?: string | null
          id?: string
          is_active?: boolean | null
          krs?: string | null
          logo_url?: string | null
          name: string
          nip?: string | null
          owner_user_id?: string | null
          phone?: string | null
          regon?: string | null
          short_name?: string | null
          type: string
          updated_at?: string | null
          vat_payer?: boolean | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string | null
          default_currency?: string | null
          email?: string | null
          email_for_invoices?: string | null
          id?: string
          is_active?: boolean | null
          krs?: string | null
          logo_url?: string | null
          name?: string
          nip?: string | null
          owner_user_id?: string | null
          phone?: string | null
          regon?: string | null
          short_name?: string | null
          type?: string
          updated_at?: string | null
          vat_payer?: boolean | null
        }
        Relationships: []
      }
      external_integrations: {
        Row: {
          api_key_encrypted: string | null
          api_url: string | null
          config: Json | null
          created_at: string | null
          environment: string | null
          id: string
          is_enabled: boolean | null
          last_test_at: string | null
          last_test_message: string | null
          last_test_status: string | null
          service_name: string
          updated_at: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          api_url?: string | null
          config?: Json | null
          created_at?: string | null
          environment?: string | null
          id?: string
          is_enabled?: boolean | null
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          service_name: string
          updated_at?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          api_url?: string | null
          config?: Json | null
          created_at?: string | null
          environment?: string | null
          id?: string
          is_enabled?: boolean | null
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          service_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feature_toggles: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          feature_key: string
          feature_name: string
          id: string
          is_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fleet_city_payment_settings: {
        Row: {
          cash_address_number: string | null
          cash_address_postal_code: string | null
          cash_address_street: string | null
          cash_enabled: boolean | null
          cash_pickup_day: string | null
          cash_pickup_location: string | null
          city_id: string
          created_at: string | null
          fleet_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          cash_address_number?: string | null
          cash_address_postal_code?: string | null
          cash_address_street?: string | null
          cash_enabled?: boolean | null
          cash_pickup_day?: string | null
          cash_pickup_location?: string | null
          city_id: string
          created_at?: string | null
          fleet_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          cash_address_number?: string | null
          cash_address_postal_code?: string | null
          cash_address_street?: string | null
          cash_enabled?: boolean | null
          cash_pickup_day?: string | null
          cash_pickup_location?: string | null
          city_id?: string
          created_at?: string | null
          fleet_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_city_payment_settings_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_city_payment_settings_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_city_settings: {
        Row: {
          additional_percent_rate: number
          base_fee: number
          city_name: string
          created_at: string
          fleet_id: string
          id: string
          invoice_email: string | null
          is_active: boolean
          platform: string
          secondary_vat_rate: number
          settlement_mode: string
          uber_calculation_mode: string | null
          updated_at: string
          vat_rate: number
        }
        Insert: {
          additional_percent_rate?: number
          base_fee?: number
          city_name: string
          created_at?: string
          fleet_id: string
          id?: string
          invoice_email?: string | null
          is_active?: boolean
          platform?: string
          secondary_vat_rate?: number
          settlement_mode?: string
          uber_calculation_mode?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          additional_percent_rate?: number
          base_fee?: number
          city_name?: string
          created_at?: string
          fleet_id?: string
          id?: string
          invoice_email?: string | null
          is_active?: boolean
          platform?: string
          secondary_vat_rate?: number
          settlement_mode?: string
          uber_calculation_mode?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fleet_city_settings_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_delegated_roles: {
        Row: {
          assigned_to_driver_id: string
          assigned_to_user_id: string | null
          created_at: string | null
          created_by: string
          fleet_id: string
          id: string
          permissions: Json
          role_name: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_driver_id: string
          assigned_to_user_id?: string | null
          created_at?: string | null
          created_by: string
          fleet_id: string
          id?: string
          permissions?: Json
          role_name: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_driver_id?: string
          assigned_to_user_id?: string | null
          created_at?: string | null
          created_by?: string
          fleet_id?: string
          id?: string
          permissions?: Json
          role_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_delegated_roles_assigned_to_driver_id_fkey"
            columns: ["assigned_to_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_delegated_roles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_invitations: {
        Row: {
          created_at: string | null
          driver_id: string
          fleet_id: string
          id: string
          invited_by: string | null
          responded_at: string | null
          status: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          driver_id: string
          fleet_id: string
          id?: string
          invited_by?: string | null
          responded_at?: string | null
          status?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string
          fleet_id?: string
          id?: string
          invited_by?: string | null
          responded_at?: string | null
          status?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_invitations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_invitations_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_invitations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_payment_notifications: {
        Row: {
          created_at: string | null
          fleet_id: string | null
          id: string
          notification_type: string | null
          reminder_id: string | null
          responded_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          fleet_id?: string | null
          id?: string
          notification_type?: string | null
          reminder_id?: string | null
          responded_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          fleet_id?: string | null
          id?: string
          notification_type?: string | null
          reminder_id?: string | null
          responded_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_payment_notifications_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_payment_notifications_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "rental_payment_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_settlement_fees: {
        Row: {
          amount: number
          created_at: string
          fleet_id: string
          frequency: string
          id: string
          is_active: boolean
          name: string
          type: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          vat_rate: number
        }
        Insert: {
          amount?: number
          created_at?: string
          fleet_id: string
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number
        }
        Update: {
          amount?: number
          created_at?: string
          fleet_id?: string
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fleet_settlement_fees_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_signatures: {
        Row: {
          auto_sign_enabled: boolean | null
          created_at: string | null
          fleet_id: string | null
          id: string
          is_active: boolean | null
          signature_url: string
          stamp_url: string | null
          updated_at: string | null
        }
        Insert: {
          auto_sign_enabled?: boolean | null
          created_at?: string | null
          fleet_id?: string | null
          id?: string
          is_active?: boolean | null
          signature_url: string
          stamp_url?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_sign_enabled?: boolean | null
          created_at?: string | null
          fleet_id?: string | null
          id?: string
          is_active?: boolean | null
          signature_url?: string
          stamp_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_signatures_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: true
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_sms_templates: {
        Row: {
          created_at: string
          fleet_id: string | null
          id: string
          is_active: boolean
          template_content: string
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fleet_id?: string | null
          id?: string
          is_active?: boolean
          template_content?: string
          template_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fleet_id?: string | null
          id?: string
          is_active?: boolean
          template_content?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_sms_templates_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleets: {
        Row: {
          additional_percent_rate: number
          address: string | null
          b2b_enabled: boolean | null
          b2b_invoice_frequency: string | null
          base_fee: number | null
          cash_address_number: string | null
          cash_address_postal_code: string | null
          cash_address_street: string | null
          cash_enabled: boolean | null
          cash_pickup_address: string | null
          cash_pickup_day: string | null
          cash_pickup_location: string | null
          city: string | null
          contact_name: string | null
          contact_phone_for_drivers: string | null
          created_at: string | null
          driver_plan_selection_enabled: boolean | null
          email: string | null
          house_number: string | null
          id: string
          invoice_email: string | null
          krs: string | null
          logo_url: string | null
          name: string
          nip: string | null
          owner_name: string | null
          owner_phone: string | null
          phone: string | null
          postal_code: string | null
          registration_code: string | null
          secondary_vat_rate: number
          sender_bank_account: string | null
          settlement_frequency_enabled: boolean | null
          settlement_mode: string
          street: string | null
          transfer_enabled: boolean | null
          transfer_title_template: string | null
          uber_additional_percent_rate: number | null
          uber_base_fee: number | null
          uber_calculation_mode: string | null
          uber_secondary_vat_rate: number | null
          uber_settlement_mode: string | null
          uber_vat_rate: number | null
          vat_rate: number | null
        }
        Insert: {
          additional_percent_rate?: number
          address?: string | null
          b2b_enabled?: boolean | null
          b2b_invoice_frequency?: string | null
          base_fee?: number | null
          cash_address_number?: string | null
          cash_address_postal_code?: string | null
          cash_address_street?: string | null
          cash_enabled?: boolean | null
          cash_pickup_address?: string | null
          cash_pickup_day?: string | null
          cash_pickup_location?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone_for_drivers?: string | null
          created_at?: string | null
          driver_plan_selection_enabled?: boolean | null
          email?: string | null
          house_number?: string | null
          id?: string
          invoice_email?: string | null
          krs?: string | null
          logo_url?: string | null
          name: string
          nip?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_code?: string | null
          secondary_vat_rate?: number
          sender_bank_account?: string | null
          settlement_frequency_enabled?: boolean | null
          settlement_mode?: string
          street?: string | null
          transfer_enabled?: boolean | null
          transfer_title_template?: string | null
          uber_additional_percent_rate?: number | null
          uber_base_fee?: number | null
          uber_calculation_mode?: string | null
          uber_secondary_vat_rate?: number | null
          uber_settlement_mode?: string | null
          uber_vat_rate?: number | null
          vat_rate?: number | null
        }
        Update: {
          additional_percent_rate?: number
          address?: string | null
          b2b_enabled?: boolean | null
          b2b_invoice_frequency?: string | null
          base_fee?: number | null
          cash_address_number?: string | null
          cash_address_postal_code?: string | null
          cash_address_street?: string | null
          cash_enabled?: boolean | null
          cash_pickup_address?: string | null
          cash_pickup_day?: string | null
          cash_pickup_location?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone_for_drivers?: string | null
          created_at?: string | null
          driver_plan_selection_enabled?: boolean | null
          email?: string | null
          house_number?: string | null
          id?: string
          invoice_email?: string | null
          krs?: string | null
          logo_url?: string | null
          name?: string
          nip?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_code?: string | null
          secondary_vat_rate?: number
          sender_bank_account?: string | null
          settlement_frequency_enabled?: boolean | null
          settlement_mode?: string
          street?: string | null
          transfer_enabled?: boolean | null
          transfer_title_template?: string | null
          uber_additional_percent_rate?: number | null
          uber_base_fee?: number | null
          uber_calculation_mode?: string | null
          uber_secondary_vat_rate?: number | null
          uber_settlement_mode?: string | null
          uber_vat_rate?: number | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      fuel_cards: {
        Row: {
          card_number: string
          card_number_normalized: string | null
          city_id: string
          created_at: string
          driver_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          card_number: string
          card_number_normalized?: string | null
          city_id: string
          created_at?: string
          driver_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          card_number?: string
          card_number_normalized?: string | null
          city_id?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_cards_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_cards_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          amount: number
          created_at: string | null
          date: string
          driver_id: string | null
          id: string
          liters: number | null
          notes: string | null
          station: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          date: string
          driver_id?: string | null
          id?: string
          liters?: number | null
          notes?: string | null
          station?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          date?: string
          driver_id?: string | null
          id?: string
          liters?: number | null
          notes?: string | null
          station?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_transactions: {
        Row: {
          brand: string | null
          card_number: string
          created_at: string | null
          driver_name: string | null
          fuel_type: string | null
          id: string
          import_batch_id: string | null
          import_date: string | null
          liters: number | null
          period_from: string
          period_to: string
          price_per_liter: number | null
          total_amount: number
          transaction_date: string
          transaction_time: string
          vehicle_number: string | null
        }
        Insert: {
          brand?: string | null
          card_number: string
          created_at?: string | null
          driver_name?: string | null
          fuel_type?: string | null
          id?: string
          import_batch_id?: string | null
          import_date?: string | null
          liters?: number | null
          period_from: string
          period_to: string
          price_per_liter?: number | null
          total_amount: number
          transaction_date: string
          transaction_time: string
          vehicle_number?: string | null
        }
        Update: {
          brand?: string | null
          card_number?: string
          created_at?: string | null
          driver_name?: string | null
          fuel_type?: string | null
          id?: string
          import_batch_id?: string | null
          import_date?: string | null
          liters?: number | null
          period_from?: string
          period_to?: string
          price_per_liter?: number | null
          total_amount?: number
          transaction_date?: string
          transaction_time?: string
          vehicle_number?: string | null
        }
        Relationships: []
      }
      gtfs_data_sources: {
        Row: {
          api_endpoint: string | null
          api_key_secret_name: string | null
          config: Json | null
          country: string | null
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          last_sync_at: string | null
          name: string
          region: string | null
          source_type: string
          source_url: string | null
          supports_realtime: boolean | null
          sync_interval_hours: number | null
          updated_at: string | null
        }
        Insert: {
          api_endpoint?: string | null
          api_key_secret_name?: string | null
          config?: Json | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          name: string
          region?: string | null
          source_type: string
          source_url?: string | null
          supports_realtime?: boolean | null
          sync_interval_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          api_endpoint?: string | null
          api_key_secret_name?: string | null
          config?: Json | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          name?: string
          region?: string | null
          source_type?: string
          source_url?: string | null
          supports_realtime?: boolean | null
          sync_interval_hours?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      import_errors: {
        Row: {
          code: string
          created_at: string
          id: number
          job_id: string
          message: string
          raw: Json | null
          row_no: number | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: number
          job_id: string
          message: string
          raw?: Json | null
          row_no?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: number
          job_id?: string
          message?: string
          raw?: Json | null
          row_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          created_at: string
          created_by: string | null
          error_rows: number
          filename: string
          id: string
          import_job_id: string | null
          is_first_import: boolean
          matched_drivers_count: number
          metadata: Json | null
          new_drivers_count: number
          period_from: string
          period_to: string
          successful_rows: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_rows?: number
          filename: string
          id?: string
          import_job_id?: string | null
          is_first_import?: boolean
          matched_drivers_count?: number
          metadata?: Json | null
          new_drivers_count?: number
          period_from: string
          period_to: string
          successful_rows?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_rows?: number
          filename?: string
          id?: string
          import_job_id?: string | null
          is_first_import?: boolean
          matched_drivers_count?: number
          metadata?: Json | null
          new_drivers_count?: number
          period_from?: string
          period_to?: string
          successful_rows?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_history_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          city_id: string | null
          created_at: string
          created_by: string | null
          filename: string
          id: string
          platform: string
          status: string
          week_end: string
          week_start: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          filename: string
          id?: string
          platform: string
          status?: string
          week_end: string
          week_start: string
        }
        Update: {
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: string
          platform?: string
          status?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_agents: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          email: string
          id: string
          is_active: boolean | null
          license_number: string | null
          nip: string | null
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          company_name: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean | null
          license_number?: string | null
          nip?: string | null
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean | null
          license_number?: string | null
          nip?: string | null
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      insurance_notifications: {
        Row: {
          agent_id: string | null
          created_at: string
          current_premium: number | null
          expiry_date: string
          fleet_id: string | null
          fleet_name: string | null
          id: string
          notification_type: string
          policy_id: string | null
          policy_type: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          vehicle_brand: string | null
          vehicle_id: string
          vehicle_model: string | null
          vehicle_plate: string | null
          vehicle_vin: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          current_premium?: number | null
          expiry_date: string
          fleet_id?: string | null
          fleet_name?: string | null
          id?: string
          notification_type: string
          policy_id?: string | null
          policy_type?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          vehicle_brand?: string | null
          vehicle_id: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_vin?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          current_premium?: number | null
          expiry_date?: string
          fleet_id?: string | null
          fleet_name?: string | null
          id?: string
          notification_type?: string
          policy_id?: string | null
          policy_type?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          vehicle_brand?: string | null
          vehicle_id?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
          vehicle_vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_notifications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "insurance_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_notifications_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_notifications_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "vehicle_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_offers: {
        Row: {
          agent_id: string
          created_at: string
          current_premium: number | null
          fleet_id: string | null
          fleet_response: string | null
          id: string
          offer_details: string | null
          offer_premium: number
          policy_type: string
          responded_at: string | null
          status: string
          valid_until: string
          vehicle_id: string
          viewed_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          current_premium?: number | null
          fleet_id?: string | null
          fleet_response?: string | null
          id?: string
          offer_details?: string | null
          offer_premium: number
          policy_type: string
          responded_at?: string | null
          status?: string
          valid_until: string
          vehicle_id: string
          viewed_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          current_premium?: number | null
          fleet_id?: string | null
          fleet_response?: string | null
          id?: string
          offer_details?: string | null
          offer_premium?: number
          policy_type?: string
          responded_at?: string | null
          status?: string
          valid_until?: string
          vehicle_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_offers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "insurance_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_offers_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_offers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          purchase_document_id: string | null
          purchase_item_id: string | null
          qty_in: number
          qty_remaining: number
          received_at: string | null
          unit_cost_net: number | null
          vat_rate: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          purchase_document_id?: string | null
          purchase_item_id?: string | null
          qty_in: number
          qty_remaining: number
          received_at?: string | null
          unit_cost_net?: number | null
          vat_rate?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          purchase_document_id?: string | null
          purchase_item_id?: string | null
          qty_in?: number
          qty_remaining?: number
          received_at?: string | null
          unit_cost_net?: number | null
          vat_rate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_purchase_document_id_fkey"
            columns: ["purchase_document_id"]
            isOneToOne: false
            referencedRelation: "purchase_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_document_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string | null
          entity_id: string | null
          id: string
          name: string
          parent_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          id?: string
          name: string
          parent_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          created_at: string | null
          created_by: string | null
          direction: string
          id: string
          note: string | null
          product_id: string
          qty: number
          source_id: string | null
          source_type: string | null
          unit_cost_net: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          direction: string
          id?: string
          note?: string | null
          product_id: string
          qty: number
          source_id?: string | null
          source_type?: string | null
          unit_cost_net?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string
          id?: string
          note?: string | null
          product_id?: string
          qty?: number
          source_id?: string | null
          source_type?: string | null
          unit_cost_net?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_product_aliases: {
        Row: {
          confidence: number | null
          created_at: string | null
          entity_id: string | null
          id: string
          normalized_label: string | null
          product_id: string
          source_label: string
          supplier_name: string | null
          supplier_nip: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          normalized_label?: string | null
          product_id: string
          source_label: string
          supplier_name?: string | null
          supplier_nip?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          normalized_label?: string | null
          product_id?: string
          source_label?: string
          supplier_name?: string | null
          supplier_nip?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_aliases_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          attributes: Json | null
          barcode: string | null
          category: string | null
          created_at: string | null
          currency: string | null
          default_purchase_price_gross: number | null
          default_purchase_price_net: number | null
          default_sale_price_gross: number | null
          default_sale_price_net: number | null
          entity_id: string | null
          id: string
          is_active: boolean | null
          name_sales: string
          notes: string | null
          sku: string | null
          unit: string | null
          updated_at: string | null
          user_id: string | null
          vat_rate: string | null
        }
        Insert: {
          attributes?: Json | null
          barcode?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          default_purchase_price_gross?: number | null
          default_purchase_price_net?: number | null
          default_sale_price_gross?: number | null
          default_sale_price_net?: number | null
          entity_id?: string | null
          id?: string
          is_active?: boolean | null
          name_sales: string
          notes?: string | null
          sku?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_rate?: string | null
        }
        Update: {
          attributes?: Json | null
          barcode?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          default_purchase_price_gross?: number | null
          default_purchase_price_net?: number | null
          default_sale_price_gross?: number | null
          default_sale_price_net?: number | null
          entity_id?: string | null
          id?: string
          is_active?: boolean | null
          name_sales?: string
          notes?: string | null
          sku?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_rate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string | null
          description: string | null
          gross_amount: number
          id: string
          invoice_id: string
          name: string
          net_amount: number
          pkwiu: string | null
          position: number | null
          quantity: number | null
          unit: string | null
          unit_net_price: number
          vat_amount: number
          vat_rate: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gross_amount: number
          id?: string
          invoice_id: string
          name: string
          net_amount: number
          pkwiu?: string | null
          position?: number | null
          quantity?: number | null
          unit?: string | null
          unit_net_price: number
          vat_amount: number
          vat_rate?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gross_amount?: number
          id?: string
          invoice_id?: string
          name?: string
          net_amount?: number
          pkwiu?: string | null
          position?: number | null
          quantity?: number | null
          unit?: string | null
          unit_net_price?: number
          vat_amount?: number
          vat_rate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_recipients: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_street: string | null
          bank_account: string | null
          created_at: string | null
          email: string | null
          entity_id: string
          gus_data: Json | null
          id: string
          last_verified_at: string | null
          name: string
          nip: string | null
          notes: string | null
          phone: string | null
          updated_at: string | null
          verification_status: string | null
          whitelist_data: Json | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          created_at?: string | null
          email?: string | null
          entity_id: string
          gus_data?: Json | null
          id?: string
          last_verified_at?: string | null
          name: string
          nip?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          verification_status?: string | null
          whitelist_data?: Json | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          created_at?: string | null
          email?: string | null
          entity_id?: string
          gus_data?: Json | null
          id?: string
          last_verified_at?: string | null
          name?: string
          nip?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          verification_status?: string | null
          whitelist_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_recipients_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_recurring_rules: {
        Row: {
          created_at: string | null
          created_by_user_id: string | null
          custom_days: number | null
          enabled: boolean | null
          end_date: string | null
          entity_id: string
          frequency: string | null
          id: string
          last_run_at: string | null
          next_run_at: string | null
          notes: string | null
          payment_days: number | null
          recipient_id: string | null
          start_date: string
          template_items: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_user_id?: string | null
          custom_days?: number | null
          enabled?: boolean | null
          end_date?: string | null
          entity_id: string
          frequency?: string | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          notes?: string | null
          payment_days?: number | null
          recipient_id?: string | null
          start_date: string
          template_items: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string | null
          custom_days?: number | null
          enabled?: boolean | null
          end_date?: string | null
          entity_id?: string
          frequency?: string | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          notes?: string | null
          payment_days?: number | null
          recipient_id?: string | null
          start_date?: string
          template_items?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_recurring_rules_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_recurring_rules_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "invoice_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          created_at: string | null
          entity_id: string
          id: string
          invoice_type: string | null
          is_default: boolean | null
          name: string
          pattern: string
          prefix: string
          reset_rule: string | null
          sequence_current: number | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          id?: string
          invoice_type?: string | null
          is_default?: boolean | null
          name: string
          pattern?: string
          prefix?: string
          reset_rule?: string | null
          sequence_current?: number | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          id?: string
          invoice_type?: string | null
          is_default?: boolean | null
          name?: string
          pattern?: string
          prefix?: string
          reset_rule?: string | null
          sequence_current?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_snapshot: Json | null
          correction_of_invoice_id: string | null
          created_at: string | null
          created_by: string | null
          created_by_user_id: string | null
          currency: string | null
          driver_id: string | null
          due_date: string | null
          entity_id: string
          exchange_rate: number | null
          fleet_id: string | null
          gross_amount: number | null
          id: string
          internal_notes: string | null
          invoice_number: string
          issue_date: string
          ksef_reference: string | null
          ksef_status: string | null
          net_amount: number | null
          notes: string | null
          paid_amount: number | null
          payment_days: number | null
          payment_method: string | null
          pdf_url: string | null
          recipient_id: string | null
          sale_date: string | null
          series_id: string | null
          settlement_id: string | null
          status: string
          type: string
          updated_at: string | null
          vat_amount: number | null
        }
        Insert: {
          buyer_snapshot?: Json | null
          correction_of_invoice_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          driver_id?: string | null
          due_date?: string | null
          entity_id: string
          exchange_rate?: number | null
          fleet_id?: string | null
          gross_amount?: number | null
          id?: string
          internal_notes?: string | null
          invoice_number: string
          issue_date?: string
          ksef_reference?: string | null
          ksef_status?: string | null
          net_amount?: number | null
          notes?: string | null
          paid_amount?: number | null
          payment_days?: number | null
          payment_method?: string | null
          pdf_url?: string | null
          recipient_id?: string | null
          sale_date?: string | null
          series_id?: string | null
          settlement_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          vat_amount?: number | null
        }
        Update: {
          buyer_snapshot?: Json | null
          correction_of_invoice_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          driver_id?: string | null
          due_date?: string | null
          entity_id?: string
          exchange_rate?: number | null
          fleet_id?: string | null
          gross_amount?: number | null
          id?: string
          internal_notes?: string | null
          invoice_number?: string
          issue_date?: string
          ksef_reference?: string | null
          ksef_status?: string | null
          net_amount?: number | null
          notes?: string | null
          paid_amount?: number | null
          payment_days?: number | null
          payment_method?: string | null
          pdf_url?: string | null
          recipient_id?: string | null
          sale_date?: string | null
          series_id?: string | null
          settlement_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_correction_of_invoice_id_fkey"
            columns: ["correction_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "invoice_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      ksef_settings: {
        Row: {
          auto_send: boolean
          created_at: string
          entity_id: string | null
          environment: string
          id: string
          is_enabled: boolean
          nip: string | null
          token_encrypted: string | null
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          created_at?: string
          entity_id?: string | null
          environment?: string
          id?: string
          is_enabled?: boolean
          nip?: string | null
          token_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          created_at?: string
          entity_id?: string | null
          environment?: string
          id?: string
          is_enabled?: boolean
          nip?: string | null
          token_encrypted?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ksef_settings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      ksef_transmissions: {
        Row: {
          created_at: string
          direction: string
          entity_id: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          ksef_reference_number: string | null
          response_at: string | null
          sent_at: string | null
          status: string
          upo_reference: string | null
          xml_content: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          entity_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          ksef_reference_number?: string | null
          response_at?: string | null
          sent_at?: string | null
          status?: string
          upo_reference?: string | null
          xml_content?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          entity_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          ksef_reference_number?: string | null
          response_at?: string | null
          sent_at?: string | null
          status?: string
          upo_reference?: string | null
          xml_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ksef_transmissions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ksef_transmissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_consents: {
        Row: {
          accepted: boolean
          accepted_at: string | null
          consent_type: string
          created_at: string | null
          document_snapshot_url: string | null
          entity_id: string | null
          id: string
          ip_address: string | null
          source: string | null
          user_agent: string | null
          user_id: string
          version: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted?: boolean
          accepted_at?: string | null
          consent_type: string
          created_at?: string | null
          document_snapshot_url?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          source?: string | null
          user_agent?: string | null
          user_id: string
          version?: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted?: boolean
          accepted_at?: string | null
          consent_type?: string
          created_at?: string | null
          document_snapshot_url?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          source?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_consents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_promotions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          listing_id: string
          listing_type: string
          payment_status: string | null
          placement: string
          price_paid: number
          starts_at: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          listing_id: string
          listing_type: string
          payment_status?: string | null
          placement: string
          price_paid: number
          starts_at?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          listing_id?: string
          listing_type?: string
          payment_status?: string | null
          placement?: string
          price_paid?: number
          starts_at?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      location_integrations: {
        Row: {
          api_key_secret_name: string | null
          config: Json | null
          created_at: string
          id: string
          integration_type: string
          is_enabled: boolean | null
          provider: string | null
          updated_at: string
          visible_in_listings: boolean | null
          visible_in_map: boolean | null
          visible_in_search: boolean | null
        }
        Insert: {
          api_key_secret_name?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          integration_type: string
          is_enabled?: boolean | null
          provider?: string | null
          updated_at?: string
          visible_in_listings?: boolean | null
          visible_in_map?: boolean | null
          visible_in_search?: boolean | null
        }
        Update: {
          api_key_secret_name?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          integration_type?: string
          is_enabled?: boolean | null
          provider?: string | null
          updated_at?: string
          visible_in_listings?: boolean | null
          visible_in_map?: boolean | null
          visible_in_search?: boolean | null
        }
        Relationships: []
      }
      loyalty_programs: {
        Row: {
          config: Json
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          program_type: string
        }
        Insert: {
          config: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          program_type: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          program_type?: string
        }
        Relationships: []
      }
      manual_driver_matches: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          match_key: string
          match_value: string
          platform: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          match_key: string
          match_value: string
          platform?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          match_key?: string
          match_value?: string
          platform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_driver_matches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      map_navigation_settings: {
        Row: {
          show_lane_guidance: boolean | null
          show_roundabout_exit: boolean | null
          show_speed_limit: boolean | null
          speed_warning_red_over: number | null
          speed_warning_yellow_over: number | null
          updated_at: string | null
          user_id: string
          voice_enabled: boolean | null
          voice_language: string | null
          voice_rate: number | null
          voice_style: string | null
          voice_volume: number | null
        }
        Insert: {
          show_lane_guidance?: boolean | null
          show_roundabout_exit?: boolean | null
          show_speed_limit?: boolean | null
          speed_warning_red_over?: number | null
          speed_warning_yellow_over?: number | null
          updated_at?: string | null
          user_id: string
          voice_enabled?: boolean | null
          voice_language?: string | null
          voice_rate?: number | null
          voice_style?: string | null
          voice_volume?: number | null
        }
        Update: {
          show_lane_guidance?: boolean | null
          show_roundabout_exit?: boolean | null
          show_speed_limit?: boolean | null
          speed_warning_red_over?: number | null
          speed_warning_yellow_over?: number | null
          updated_at?: string | null
          user_id?: string
          voice_enabled?: boolean | null
          voice_language?: string | null
          voice_rate?: number | null
          voice_style?: string | null
          voice_volume?: number | null
        }
        Relationships: []
      }
      map_poi_favorites: {
        Row: {
          created_at: string | null
          id: string
          lat: number
          lng: number
          name: string
          poi_id: string
          poi_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          poi_id: string
          poi_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          poi_id?: string
          poi_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      map_poi_partners: {
        Row: {
          address: string | null
          category: string
          city: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_partner: boolean | null
          lat: number
          lng: number
          logo_url: string | null
          name: string
          opening_hours: string | null
          payment_supported: boolean | null
          phone: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category: string
          city?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_partner?: boolean | null
          lat: number
          lng: number
          logo_url?: string | null
          name: string
          opening_hours?: string | null
          payment_supported?: boolean | null
          phone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          city?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_partner?: boolean | null
          lat?: number
          lng?: number
          logo_url?: string | null
          name?: string
          opening_hours?: string | null
          payment_supported?: boolean | null
          phone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      map_report_votes: {
        Row: {
          created_at: string | null
          id: string
          report_id: string | null
          user_id: string | null
          vote: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          report_id?: string | null
          user_id?: string | null
          vote: number
        }
        Update: {
          created_at?: string | null
          id?: string
          report_id?: string | null
          user_id?: string | null
          vote?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "map_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      map_reports: {
        Row: {
          created_at: string | null
          description: string | null
          direction_deg: number | null
          expires_at: string
          id: string
          lat: number
          lng: number
          status: string | null
          type: string
          user_id: string | null
          votes_down: number | null
          votes_up: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          direction_deg?: number | null
          expires_at: string
          id?: string
          lat: number
          lng: number
          status?: string | null
          type: string
          user_id?: string | null
          votes_down?: number | null
          votes_up?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          direction_deg?: number | null
          expires_at?: string
          id?: string
          lat?: number
          lng?: number
          status?: string | null
          type?: string
          user_id?: string | null
          votes_down?: number | null
          votes_up?: number | null
        }
        Relationships: []
      }
      map_static_hazards: {
        Row: {
          created_at: string | null
          description: string | null
          direction_deg: number | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          lat: number
          lng: number
          speed_limit: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          direction_deg?: number | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          lat: number
          lng: number
          speed_limit?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          direction_deg?: number | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          lat?: number
          lng?: number
          speed_limit?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      map_user_reputation: {
        Row: {
          reports_approved: number
          reports_rejected: number
          score: number
          updated_at: string
          user_id: string
          votes_received: number
        }
        Insert: {
          reports_approved?: number
          reports_rejected?: number
          score?: number
          updated_at?: string
          user_id: string
          votes_received?: number
        }
        Update: {
          reports_approved?: number
          reports_rejected?: number
          score?: number
          updated_at?: string
          user_id?: string
          votes_received?: number
        }
        Relationships: []
      }
      map_voice_catalog: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          language: string
          name: string
          provider: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          language: string
          name: string
          provider?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          language?: string
          name?: string
          provider?: string | null
        }
        Relationships: []
      }
      maps_config: {
        Row: {
          config_key: string
          config_value: string
          data_sources: Json | null
          id: string
          style_overrides_dark: Json | null
          style_overrides_light: Json | null
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value: string
          data_sources?: Json | null
          id?: string
          style_overrides_dark?: Json | null
          style_overrides_light?: Json | null
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          data_sources?: Json | null
          id?: string
          style_overrides_dark?: Json | null
          style_overrides_light?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_ad_slots: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          name: string
          slot_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          name: string
          slot_key: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          name?: string
          slot_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_attribute_definitions: {
        Row: {
          attribute_key: string
          created_at: string | null
          id: string
          input_type: string | null
          is_filterable: boolean | null
          is_required: boolean | null
          item_type_id: string
          label: string
          label_en: string | null
          options: Json | null
          placeholder: string | null
          sort_order: number | null
          unit: string | null
        }
        Insert: {
          attribute_key: string
          created_at?: string | null
          id?: string
          input_type?: string | null
          is_filterable?: boolean | null
          is_required?: boolean | null
          item_type_id: string
          label: string
          label_en?: string | null
          options?: Json | null
          placeholder?: string | null
          sort_order?: number | null
          unit?: string | null
        }
        Update: {
          attribute_key?: string
          created_at?: string | null
          id?: string
          input_type?: string | null
          is_filterable?: boolean | null
          is_required?: boolean | null
          item_type_id?: string
          label?: string
          label_en?: string | null
          options?: Json | null
          placeholder?: string | null
          sort_order?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_attribute_definitions_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "marketplace_item_types"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_conversations: {
        Row: {
          buyer_profile_id: string | null
          buyer_unread_count: number | null
          created_at: string | null
          id: string
          last_message_at: string | null
          listing_id: string | null
          seller_profile_id: string | null
          seller_unread_count: number | null
        }
        Insert: {
          buyer_profile_id?: string | null
          buyer_unread_count?: number | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          seller_profile_id?: string | null
          seller_unread_count?: number | null
        }
        Update: {
          buyer_profile_id?: string | null
          buyer_unread_count?: number | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          seller_profile_id?: string | null
          seller_unread_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_conversations_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_conversations_seller_profile_id_fkey"
            columns: ["seller_profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_favorites: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_item_types: {
        Row: {
          category_id: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_item_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listing_attributes: {
        Row: {
          attribute_key: string
          attribute_value: string | null
          created_at: string | null
          id: string
          listing_id: string
        }
        Insert: {
          attribute_key: string
          attribute_value?: string | null
          created_at?: string | null
          id?: string
          listing_id: string
        }
        Update: {
          attribute_key?: string
          attribute_value?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listing_attributes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          category_id: string
          city_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          driver_id: string | null
          duration_days: number | null
          expires_at: string | null
          favorites_count: number | null
          fleet_id: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_unlimited: boolean | null
          item_type_id: string
          location_text: string | null
          photos: string[] | null
          price: number
          price_negotiable: boolean | null
          price_type: string | null
          status: string | null
          title: string
          transaction_type_id: string
          updated_at: string | null
          vehicle_id: string | null
          views_count: number | null
        }
        Insert: {
          category_id: string
          city_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          driver_id?: string | null
          duration_days?: number | null
          expires_at?: string | null
          favorites_count?: number | null
          fleet_id?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_unlimited?: boolean | null
          item_type_id: string
          location_text?: string | null
          photos?: string[] | null
          price?: number
          price_negotiable?: boolean | null
          price_type?: string | null
          status?: string | null
          title: string
          transaction_type_id: string
          updated_at?: string | null
          vehicle_id?: string | null
          views_count?: number | null
        }
        Update: {
          category_id?: string
          city_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          driver_id?: string | null
          duration_days?: number | null
          expires_at?: string | null
          favorites_count?: number | null
          fleet_id?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_unlimited?: boolean | null
          item_type_id?: string
          location_text?: string | null
          photos?: string[] | null
          price?: number
          price_negotiable?: boolean | null
          price_type?: string | null
          status?: string | null
          title?: string
          transaction_type_id?: string
          updated_at?: string | null
          vehicle_id?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "marketplace_item_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "marketplace_transaction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_profile_id: string | null
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_profile_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "marketplace_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "marketplace_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_saved_searches: {
        Row: {
          category_id: string | null
          created_at: string | null
          filters: Json | null
          id: string
          item_type_id: string | null
          name: string
          notify_new_listings: boolean | null
          transaction_type_ids: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          filters?: Json | null
          id?: string
          item_type_id?: string | null
          name: string
          notify_new_listings?: boolean | null
          transaction_type_ids?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          filters?: Json | null
          id?: string
          item_type_id?: string | null
          name?: string
          notify_new_listings?: boolean | null
          transaction_type_ids?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_saved_searches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_saved_searches_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "marketplace_item_types"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_transaction_types: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_user_profiles: {
        Row: {
          account_mode: string
          avg_rating: number | null
          city_id: string | null
          company_address: string | null
          company_city: string | null
          company_contact_person: string | null
          company_contact_phone: string | null
          company_name: string | null
          company_nip: string | null
          company_postal_code: string | null
          company_regon: string | null
          company_website: string | null
          created_at: string | null
          default_category: string | null
          email: string
          employee_permissions: Json | null
          first_name: string
          id: string
          last_name: string | null
          listings_count: number | null
          parent_company_id: string | null
          phone: string | null
          preferred_listing_type: string | null
          public_email: string | null
          public_phone: string | null
          reviews_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_mode?: string
          avg_rating?: number | null
          city_id?: string | null
          company_address?: string | null
          company_city?: string | null
          company_contact_person?: string | null
          company_contact_phone?: string | null
          company_name?: string | null
          company_nip?: string | null
          company_postal_code?: string | null
          company_regon?: string | null
          company_website?: string | null
          created_at?: string | null
          default_category?: string | null
          email: string
          employee_permissions?: Json | null
          first_name: string
          id?: string
          last_name?: string | null
          listings_count?: number | null
          parent_company_id?: string | null
          phone?: string | null
          preferred_listing_type?: string | null
          public_email?: string | null
          public_phone?: string | null
          reviews_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_mode?: string
          avg_rating?: number | null
          city_id?: string | null
          company_address?: string | null
          company_city?: string | null
          company_contact_person?: string | null
          company_contact_phone?: string | null
          company_name?: string | null
          company_nip?: string | null
          company_postal_code?: string | null
          company_regon?: string | null
          company_website?: string | null
          created_at?: string | null
          default_category?: string | null
          email?: string
          employee_permissions?: Json | null
          first_name?: string
          id?: string
          last_name?: string | null
          listings_count?: number | null
          parent_company_id?: string | null
          phone?: string | null
          preferred_listing_type?: string | null
          public_email?: string | null
          public_phone?: string | null
          reviews_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_user_profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_user_profiles_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "marketplace_user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_decisions: {
        Row: {
          created_at: string
          decision: string
          id: string
          impact: string | null
          meeting_id: string
          rationale: string | null
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          impact?: string | null
          meeting_id: string
          rationale?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          impact?: string | null
          meeting_id?: string
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_tasks: {
        Row: {
          assignee: string | null
          created_at: string
          deadline: string | null
          id: string
          is_completed: boolean | null
          meeting_id: string
          priority: string | null
          source_quote: string | null
          task: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          is_completed?: boolean | null
          meeting_id: string
          priority?: string | null
          source_quote?: string | null
          task: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          is_completed?: boolean | null
          meeting_id?: string
          priority?: string | null
          source_quote?: string | null
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          audio_url: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          key_points: Json | null
          next_meeting_suggestion: Json | null
          participants: string[] | null
          questions_unresolved: Json | null
          sentiment: string | null
          source_type: string
          status: string
          summary: string | null
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          key_points?: Json | null
          next_meeting_suggestion?: Json | null
          participants?: string[] | null
          questions_unresolved?: Json | null
          sentiment?: string | null
          source_type?: string
          status?: string
          summary?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          key_points?: Json | null
          next_meeting_suggestion?: Json | null
          participants?: string[] | null
          questions_unresolved?: Json | null
          sentiment?: string | null
          source_type?: string
          status?: string
          summary?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          driver_id: string | null
          from_role: string
          id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          driver_id?: string | null
          from_role: string
          id?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          driver_id?: string | null
          from_role?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      module_visibility: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          module_key: string
          module_name: string
          updated_at: string | null
          visible_to_roles: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          module_key: string
          module_name: string
          updated_at?: string | null
          visible_to_roles?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          module_key?: string
          module_name?: string
          updated_at?: string | null
          visible_to_roles?: string[] | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string | null
          document_expiry_notifications: boolean | null
          id: string
          push_enabled: boolean | null
          push_subscription: Json | null
          settlement_notifications: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          document_expiry_notifications?: boolean | null
          id?: string
          push_enabled?: boolean | null
          push_subscription?: Json | null
          settlement_notifications?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          document_expiry_notifications?: boolean | null
          id?: string
          push_enabled?: boolean | null
          push_subscription?: Json | null
          settlement_notifications?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      paid_service_subscriptions: {
        Row: {
          amount_paid: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          service_id: string | null
          started_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          service_id?: string | null
          started_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          service_id?: string | null
          started_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_service_subscriptions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "paid_services"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_services: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          price_pln: number
          pricing_type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_pln?: number
          pricing_type?: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_pln?: number
          pricing_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      parking_sessions: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          end_at: string
          id: string
          payment_status: string | null
          provider: string | null
          provider_ref: string | null
          start_at: string
          status: string | null
          updated_at: string | null
          user_id: string
          vehicle_plate: string
          zone_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          end_at: string
          id?: string
          payment_status?: string | null
          provider?: string | null
          provider_ref?: string | null
          start_at?: string
          status?: string | null
          updated_at?: string | null
          user_id: string
          vehicle_plate: string
          zone_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          end_at?: string
          id?: string
          payment_status?: string | null
          provider?: string | null
          provider_ref?: string | null
          start_at?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
          vehicle_plate?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parking_sessions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "parking_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_zones: {
        Row: {
          city: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          polygon: Json
          rules: Json | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          city: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          polygon: Json
          rules?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          polygon?: Json
          rules?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_gateway_config: {
        Row: {
          api_key_secret_name: string | null
          config_json: Json | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          is_test_mode: boolean | null
          merchant_id: string | null
          name: string
          provider: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key_secret_name?: string | null
          config_json?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          is_test_mode?: boolean | null
          merchant_id?: string | null
          name: string
          provider: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key_secret_name?: string | null
          config_json?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          is_test_mode?: boolean | null
          merchant_id?: string | null
          name?: string
          provider?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      pending_service_reviews: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string
          is_blocking: boolean | null
          last_reminder_at: string | null
          provider_id: string | null
          reminder_count: number | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          is_blocking?: boolean | null
          last_reminder_at?: string | null
          provider_id?: string | null
          reminder_count?: number | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          is_blocking?: boolean | null
          last_reminder_at?: string | null
          provider_id?: string | null
          reminder_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_service_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_service_reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_import_config: {
        Row: {
          columns: Json
          created_at: string
          platform: string
          updated_at: string
        }
        Insert: {
          columns: Json
          created_at?: string
          platform: string
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          link_url: string
          name: string
          portal_context: string
          service_category_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          link_url: string
          name: string
          portal_context: string
          service_category_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          link_url?: string
          name?: string
          portal_context?: string
          service_category_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_categories_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_integrations: {
        Row: {
          config_json: Json | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          key: string
          last_test_date: string | null
          last_test_status: string | null
          name: string
          provider: string | null
          updated_at: string | null
        }
        Insert: {
          config_json?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          key: string
          last_test_date?: string | null
          last_test_status?: string | null
          name: string
          provider?: string | null
          updated_at?: string | null
        }
        Update: {
          config_json?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          key?: string
          last_test_date?: string | null
          last_test_status?: string | null
          name?: string
          provider?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      price_change_notifications: {
        Row: {
          accepted_at: string | null
          changed_by: string | null
          created_at: string | null
          driver_id: string
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          is_accepted: boolean | null
          is_read: boolean | null
          new_price: number
          old_price: number
          vehicle_id: string
        }
        Insert: {
          accepted_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          driver_id: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_accepted?: boolean | null
          is_read?: boolean | null
          new_price: number
          old_price: number
          vehicle_id: string
        }
        Update: {
          accepted_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          driver_id?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_accepted?: boolean | null
          is_read?: boolean | null
          new_price?: number
          old_price?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_change_notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_config: {
        Row: {
          created_at: string | null
          entity_id: string | null
          free_invoices_limit: number | null
          id: string
          plan: string | null
          pro_features_enabled: boolean | null
          show_branding_footer: boolean | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          free_invoices_limit?: number | null
          id?: string
          plan?: string | null
          pro_features_enabled?: boolean | null
          show_branding_footer?: boolean | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          free_invoices_limit?: number | null
          id?: string
          plan?: string | null
          pro_features_enabled?: boolean | null
          show_branding_footer?: boolean | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_config_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mappings: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          supplier_name: string
          supplier_symbol: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          supplier_name: string
          supplier_symbol?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          supplier_name?: string
          supplier_symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          gtu_code: string | null
          id: string
          low_stock_alert: number | null
          name: string
          purchase_price: number | null
          sale_price: number | null
          sku: string | null
          stock_quantity: number | null
          unit: string | null
          updated_at: string | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string | null
          gtu_code?: string | null
          id?: string
          low_stock_alert?: number | null
          name: string
          purchase_price?: number | null
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          unit?: string | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string | null
          gtu_code?: string | null
          id?: string
          low_stock_alert?: number | null
          name?: string
          purchase_price?: number | null
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          unit?: string | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      promotion_pricing: {
        Row: {
          created_at: string | null
          duration_days: number
          id: string
          is_active: boolean | null
          listing_type: string
          placement: string
          price_pln: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean | null
          listing_type: string
          placement: string
          price_pln: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean | null
          listing_type?: string
          placement?: string
          price_pln?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      provider_reminder_confirmations: {
        Row: {
          booking_id: string | null
          confirmed_at: string | null
          created_at: string | null
          id: string
          provider_id: string | null
          reminder_sent_at: string | null
          reminder_type: string | null
          resend_count: number | null
        }
        Insert: {
          booking_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          provider_id?: string | null
          reminder_sent_at?: string | null
          reminder_type?: string | null
          resend_count?: number | null
        }
        Update: {
          booking_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          provider_id?: string | null
          reminder_sent_at?: string | null
          reminder_type?: string | null
          resend_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_reminder_confirmations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_reminder_confirmations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_services: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          photos: string[] | null
          price_from: number | null
          price_to: number | null
          provider_id: string
          short_description: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          photos?: string[] | null
          price_from?: number | null
          price_to?: number | null
          provider_id: string
          short_description?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          photos?: string[] | null
          price_from?: number | null
          price_to?: number | null
          provider_id?: string
          short_description?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_document_items: {
        Row: {
          created_at: string | null
          gross_total: number | null
          id: string
          is_processed: boolean | null
          mapped_product_id: string | null
          net_total: number | null
          purchase_document_id: string
          qty: number | null
          raw_name_from_invoice: string | null
          remember_mapping: boolean | null
          unit: string | null
          unit_net: number | null
          vat_rate: string | null
          vat_total: number | null
        }
        Insert: {
          created_at?: string | null
          gross_total?: number | null
          id?: string
          is_processed?: boolean | null
          mapped_product_id?: string | null
          net_total?: number | null
          purchase_document_id: string
          qty?: number | null
          raw_name_from_invoice?: string | null
          remember_mapping?: boolean | null
          unit?: string | null
          unit_net?: number | null
          vat_rate?: string | null
          vat_total?: number | null
        }
        Update: {
          created_at?: string | null
          gross_total?: number | null
          id?: string
          is_processed?: boolean | null
          mapped_product_id?: string | null
          net_total?: number | null
          purchase_document_id?: string
          qty?: number | null
          raw_name_from_invoice?: string | null
          remember_mapping?: boolean | null
          unit?: string | null
          unit_net?: number | null
          vat_rate?: string | null
          vat_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_document_items_mapped_product_id_fkey"
            columns: ["mapped_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_document_items_purchase_document_id_fkey"
            columns: ["purchase_document_id"]
            isOneToOne: false
            referencedRelation: "purchase_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_version: number | null
          created_at: string | null
          document_date: string | null
          document_number: string | null
          entity_id: string | null
          file_name: string | null
          file_url: string | null
          gross_total: number | null
          id: string
          net_total: number | null
          notes: string | null
          ocr_processed_at: string | null
          ocr_raw_json: Json | null
          status: string | null
          supplier_name: string | null
          supplier_nip: string | null
          supplier_snapshot: Json | null
          updated_at: string | null
          user_id: string
          vat_total: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_version?: number | null
          created_at?: string | null
          document_date?: string | null
          document_number?: string | null
          entity_id?: string | null
          file_name?: string | null
          file_url?: string | null
          gross_total?: number | null
          id?: string
          net_total?: number | null
          notes?: string | null
          ocr_processed_at?: string | null
          ocr_raw_json?: Json | null
          status?: string | null
          supplier_name?: string | null
          supplier_nip?: string | null
          supplier_snapshot?: Json | null
          updated_at?: string | null
          user_id: string
          vat_total?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_version?: number | null
          created_at?: string | null
          document_date?: string | null
          document_number?: string | null
          entity_id?: string | null
          file_name?: string | null
          file_url?: string | null
          gross_total?: number | null
          id?: string
          net_total?: number | null
          notes?: string | null
          ocr_processed_at?: string | null
          ocr_raw_json?: Json | null
          status?: string | null
          supplier_name?: string | null
          supplier_nip?: string | null
          supplier_snapshot?: Json | null
          updated_at?: string | null
          user_id?: string
          vat_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_documents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_items: {
        Row: {
          created_at: string | null
          gtu_code: string | null
          id: string
          name: string
          product_id: string | null
          purchase_invoice_id: string | null
          quantity: number | null
          supplier_symbol: string | null
          total_gross: number | null
          total_net: number | null
          unit: string | null
          unit_price_net: number | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string | null
          gtu_code?: string | null
          id?: string
          name: string
          product_id?: string | null
          purchase_invoice_id?: string | null
          quantity?: number | null
          supplier_symbol?: string | null
          total_gross?: number | null
          total_net?: number | null
          unit?: string | null
          unit_price_net?: number | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string | null
          gtu_code?: string | null
          id?: string
          name?: string
          product_id?: string | null
          purchase_invoice_id?: string | null
          quantity?: number | null
          supplier_symbol?: string | null
          total_gross?: number | null
          total_net?: number | null
          unit?: string | null
          unit_price_net?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          created_at: string | null
          document_number: string
          id: string
          ocr_raw: Json | null
          payment_method: string | null
          pdf_url: string | null
          purchase_date: string | null
          status: string | null
          supplier_name: string | null
          supplier_nip: string | null
          total_gross: number | null
          total_net: number | null
          total_vat: number | null
        }
        Insert: {
          created_at?: string | null
          document_number: string
          id?: string
          ocr_raw?: Json | null
          payment_method?: string | null
          pdf_url?: string | null
          purchase_date?: string | null
          status?: string | null
          supplier_name?: string | null
          supplier_nip?: string | null
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
        }
        Update: {
          created_at?: string | null
          document_number?: string
          id?: string
          ocr_raw?: Json | null
          payment_method?: string | null
          pdf_url?: string | null
          purchase_date?: string | null
          status?: string | null
          supplier_name?: string | null
          supplier_nip?: string | null
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
        }
        Relationships: []
      }
      real_estate_agents: {
        Row: {
          active_listings_count: number | null
          company_address: string
          company_apartment_number: string | null
          company_building_number: string | null
          company_city: string
          company_name: string
          company_nip: string
          company_postal_code: string | null
          company_regon: string | null
          company_short_name: string | null
          company_street: string | null
          created_at: string | null
          guardian_email: string | null
          guardian_first_name: string | null
          guardian_last_name: string | null
          guardian_phone: string | null
          id: string
          max_employees: number | null
          owner_email: string
          owner_first_name: string
          owner_last_name: string
          owner_phone: string
          parent_agent_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active_listings_count?: number | null
          company_address: string
          company_apartment_number?: string | null
          company_building_number?: string | null
          company_city: string
          company_name: string
          company_nip: string
          company_postal_code?: string | null
          company_regon?: string | null
          company_short_name?: string | null
          company_street?: string | null
          created_at?: string | null
          guardian_email?: string | null
          guardian_first_name?: string | null
          guardian_last_name?: string | null
          guardian_phone?: string | null
          id?: string
          max_employees?: number | null
          owner_email: string
          owner_first_name: string
          owner_last_name: string
          owner_phone: string
          parent_agent_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active_listings_count?: number | null
          company_address?: string
          company_apartment_number?: string | null
          company_building_number?: string | null
          company_city?: string
          company_name?: string
          company_nip?: string
          company_postal_code?: string | null
          company_regon?: string | null
          company_short_name?: string | null
          company_street?: string | null
          created_at?: string | null
          guardian_email?: string | null
          guardian_first_name?: string | null
          guardian_last_name?: string | null
          guardian_phone?: string | null
          id?: string
          max_employees?: number | null
          owner_email?: string
          owner_first_name?: string
          owner_last_name?: string
          owner_phone?: string
          parent_agent_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_agents_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_listing_interactions: {
        Row: {
          created_at: string | null
          id: string
          interaction_type: string
          listing_id: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_type: string
          listing_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          listing_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_listing_interactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "real_estate_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_listings: {
        Row: {
          address: string | null
          agency_id: string | null
          agent_id: string
          area: number | null
          build_year: number | null
          city: string
          comparison_count: number | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          contact_reveals_count: number | null
          created_at: string | null
          crm_last_sync_at: string | null
          crm_raw_data: Json | null
          crm_source: string | null
          description: string | null
          district: string | null
          external_id: string | null
          favorites_count: number | null
          floor: number | null
          has_balcony: boolean | null
          has_elevator: boolean | null
          has_garden: boolean | null
          has_parking: boolean | null
          id: string
          latitude: number | null
          listing_number: string | null
          location: string
          longitude: number | null
          photo_alts: string[] | null
          photos: string[] | null
          price: number
          price_per_sqm: number | null
          price_type: string | null
          property_type: string
          property_unique_id: string | null
          rating: number | null
          rooms: number | null
          seo_description: string | null
          seo_h1: string | null
          seo_schema_json: Json | null
          seo_title: string | null
          status: string | null
          title: string
          total_floors: number | null
          transaction_type: string
          updated_at: string | null
          video_url: string | null
          views: number | null
          virtual_tour_url: string | null
        }
        Insert: {
          address?: string | null
          agency_id?: string | null
          agent_id: string
          area?: number | null
          build_year?: number | null
          city: string
          comparison_count?: number | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contact_reveals_count?: number | null
          created_at?: string | null
          crm_last_sync_at?: string | null
          crm_raw_data?: Json | null
          crm_source?: string | null
          description?: string | null
          district?: string | null
          external_id?: string | null
          favorites_count?: number | null
          floor?: number | null
          has_balcony?: boolean | null
          has_elevator?: boolean | null
          has_garden?: boolean | null
          has_parking?: boolean | null
          id?: string
          latitude?: number | null
          listing_number?: string | null
          location: string
          longitude?: number | null
          photo_alts?: string[] | null
          photos?: string[] | null
          price: number
          price_per_sqm?: number | null
          price_type?: string | null
          property_type: string
          property_unique_id?: string | null
          rating?: number | null
          rooms?: number | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_schema_json?: Json | null
          seo_title?: string | null
          status?: string | null
          title: string
          total_floors?: number | null
          transaction_type: string
          updated_at?: string | null
          video_url?: string | null
          views?: number | null
          virtual_tour_url?: string | null
        }
        Update: {
          address?: string | null
          agency_id?: string | null
          agent_id?: string
          area?: number | null
          build_year?: number | null
          city?: string
          comparison_count?: number | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contact_reveals_count?: number | null
          created_at?: string | null
          crm_last_sync_at?: string | null
          crm_raw_data?: Json | null
          crm_source?: string | null
          description?: string | null
          district?: string | null
          external_id?: string | null
          favorites_count?: number | null
          floor?: number | null
          has_balcony?: boolean | null
          has_elevator?: boolean | null
          has_garden?: boolean | null
          has_parking?: boolean | null
          id?: string
          latitude?: number | null
          listing_number?: string | null
          location?: string
          longitude?: number | null
          photo_alts?: string[] | null
          photos?: string[] | null
          price?: number
          price_per_sqm?: number | null
          price_type?: string | null
          property_type?: string
          property_unique_id?: string | null
          rating?: number | null
          rooms?: number | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_schema_json?: Json | null
          seo_title?: string | null
          status?: string | null
          title?: string
          total_floors?: number | null
          transaction_type?: string
          updated_at?: string | null
          video_url?: string | null
          views?: number | null
          virtual_tour_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_listings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_estate_listings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          description: string | null
          details: Json | null
          id: string
          is_reviewed: boolean | null
          referral_code_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          description?: string | null
          details?: Json | null
          id?: string
          is_reviewed?: boolean | null
          referral_code_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          description?: string | null
          details?: Json | null
          id?: string
          is_reviewed?: boolean | null
          referral_code_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_alerts_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          total_earnings: number | null
          user_id: string
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          total_earnings?: number | null
          user_id: string
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          total_earnings?: number | null
          user_id?: string
          uses_count?: number | null
        }
        Relationships: []
      }
      referral_settings: {
        Row: {
          coins_per_referral: number | null
          id: string
          is_enabled: boolean | null
          max_referrals_per_day: number | null
          min_days_before_payout: number | null
          suspicious_same_ip_threshold: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          coins_per_referral?: number | null
          id?: string
          is_enabled?: boolean | null
          max_referrals_per_day?: number | null
          min_days_before_payout?: number | null
          suspicious_same_ip_threshold?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          coins_per_referral?: number | null
          id?: string
          is_enabled?: boolean | null
          max_referrals_per_day?: number | null
          min_days_before_payout?: number | null
          suspicious_same_ip_threshold?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      referral_uses: {
        Row: {
          coins_awarded: number | null
          created_at: string | null
          id: string
          ip_address: string | null
          referral_code_id: string
          referred_user_id: string | null
          referrer_user_id: string
          status: string | null
          user_agent: string | null
        }
        Insert: {
          coins_awarded?: number | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          referral_code_id: string
          referred_user_id?: string | null
          referrer_user_id: string
          status?: string | null
          user_agent?: string | null
        }
        Update: {
          coins_awarded?: number | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          referral_code_id?: string
          referred_user_id?: string | null
          referrer_user_id?: string
          status?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_uses_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_payment_reminders: {
        Row: {
          amount_due: number
          created_at: string
          driver_id: string | null
          due_date: string
          fleet_id: string | null
          fleet_notified: boolean | null
          id: string
          last_reminder_at: string | null
          last_reminder_type: string | null
          notes: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          reminder_count: number
          status: string
          upcoming_reminder_sent: boolean | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount_due?: number
          created_at?: string
          driver_id?: string | null
          due_date: string
          fleet_id?: string | null
          fleet_notified?: boolean | null
          id?: string
          last_reminder_at?: string | null
          last_reminder_type?: string | null
          notes?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          reminder_count?: number
          status?: string
          upcoming_reminder_sent?: boolean | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount_due?: number
          created_at?: string
          driver_id?: string | null
          due_date?: string
          fleet_id?: string | null
          fleet_notified?: boolean | null
          id?: string
          last_reminder_at?: string | null
          last_reminder_type?: string | null
          notes?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          reminder_count?: number
          status?: string
          upcoming_reminder_sent?: boolean | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_payment_reminders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_payment_reminders_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_payment_reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          car_condition_rating: number | null
          comment: string | null
          created_at: string | null
          driver_rating: number | null
          id: string
          is_fleet_only: boolean | null
          problem_help_rating: number | null
          rental_id: string
          reviewee_id: string
          reviewer_id: string
          reviewer_type: string
          service_quality_rating: number | null
          status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          car_condition_rating?: number | null
          comment?: string | null
          created_at?: string | null
          driver_rating?: number | null
          id?: string
          is_fleet_only?: boolean | null
          problem_help_rating?: number | null
          rental_id: string
          reviewee_id: string
          reviewer_id: string
          reviewer_type: string
          service_quality_rating?: number | null
          status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          car_condition_rating?: number | null
          comment?: string | null
          created_at?: string | null
          driver_rating?: number | null
          id?: string
          is_fleet_only?: boolean | null
          problem_help_rating?: number | null
          rental_id?: string
          reviewee_id?: string
          reviewer_id?: string
          reviewer_type?: string
          service_quality_rating?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_reviews_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "vehicle_rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rides_raw: {
        Row: {
          adjustments: number | null
          cash_collected: number | null
          city: string | null
          commission_amount: number | null
          completed_at: string | null
          created_at: string
          driver_id: string | null
          driver_platform_id: string | null
          extra: Json | null
          gross_amount: number | null
          id: number
          job_id: string
          platform: string
          started_at: string | null
          trip_uuid: string
        }
        Insert: {
          adjustments?: number | null
          cash_collected?: number | null
          city?: string | null
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          driver_id?: string | null
          driver_platform_id?: string | null
          extra?: Json | null
          gross_amount?: number | null
          id?: number
          job_id: string
          platform: string
          started_at?: string | null
          trip_uuid: string
        }
        Update: {
          adjustments?: number | null
          cash_collected?: number | null
          city?: string | null
          commission_amount?: number | null
          completed_at?: string | null
          created_at?: string
          driver_id?: string | null
          driver_platform_id?: string | null
          extra?: Json | null
          gross_amount?: number | null
          id?: number
          job_id?: string
          platform?: string
          started_at?: string | null
          trip_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "rides_raw_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_raw_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      rido_dedup_settings: {
        Row: {
          allow_match_by_platform_ids: boolean | null
          created_at: string
          id: string
          ignore_empty_email_phone: boolean | null
          phone_country_default: string | null
          prefer_match_by_email: boolean | null
          prefer_match_by_phone: boolean | null
          updated_at: string
        }
        Insert: {
          allow_match_by_platform_ids?: boolean | null
          created_at?: string
          id?: string
          ignore_empty_email_phone?: boolean | null
          phone_country_default?: string | null
          prefer_match_by_email?: boolean | null
          prefer_match_by_phone?: boolean | null
          updated_at?: string
        }
        Update: {
          allow_match_by_platform_ids?: boolean | null
          created_at?: string
          id?: string
          ignore_empty_email_phone?: boolean | null
          phone_country_default?: string | null
          prefer_match_by_email?: boolean | null
          prefer_match_by_phone?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      rido_price_settings: {
        Row: {
          ai_suggestions_enabled: boolean
          created_at: string
          default_parts_margin: number
          id: string
          industry: string
          provider_id: string
          share_anonymous_data: boolean
          updated_at: string
        }
        Insert: {
          ai_suggestions_enabled?: boolean
          created_at?: string
          default_parts_margin?: number
          id?: string
          industry?: string
          provider_id: string
          share_anonymous_data?: boolean
          updated_at?: string
        }
        Update: {
          ai_suggestions_enabled?: boolean
          created_at?: string
          default_parts_margin?: number
          id?: string
          industry?: string
          provider_id?: string
          share_anonymous_data?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rido_price_settings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      rido_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      rido_settlements: {
        Row: {
          created_at: string
          id: string
          period_from: string
          period_to: string
          sheet_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          period_from: string
          period_to: string
          sheet_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          period_from?: string
          period_to?: string
          sheet_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rido_visibility_settings: {
        Row: {
          created_at: string
          id: string
          show_bolt_cash: boolean | null
          show_bolt_gross: boolean | null
          show_bolt_net: boolean | null
          show_commission: boolean | null
          show_freenow_cash: boolean | null
          show_freenow_gross: boolean | null
          show_freenow_net: boolean | null
          show_fuel: boolean | null
          show_tax: boolean | null
          show_uber_card: boolean | null
          show_uber_cash: boolean | null
          show_vat_from_fuel: boolean | null
          show_vat_refund_half: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          show_bolt_cash?: boolean | null
          show_bolt_gross?: boolean | null
          show_bolt_net?: boolean | null
          show_commission?: boolean | null
          show_freenow_cash?: boolean | null
          show_freenow_gross?: boolean | null
          show_freenow_net?: boolean | null
          show_fuel?: boolean | null
          show_tax?: boolean | null
          show_uber_card?: boolean | null
          show_uber_cash?: boolean | null
          show_vat_from_fuel?: boolean | null
          show_vat_refund_half?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          show_bolt_cash?: boolean | null
          show_bolt_gross?: boolean | null
          show_bolt_net?: boolean | null
          show_commission?: boolean | null
          show_freenow_cash?: boolean | null
          show_freenow_gross?: boolean | null
          show_freenow_net?: boolean | null
          show_fuel?: boolean | null
          show_tax?: boolean | null
          show_uber_card?: boolean | null
          show_uber_cash?: boolean | null
          show_vat_from_fuel?: boolean | null
          show_vat_refund_half?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_call_logs: {
        Row: {
          call_date: string | null
          call_status: string
          callback_date: string | null
          contact_id: string | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          lead_id: string
          notes: string | null
          outcome: string | null
          user_id: string
        }
        Insert: {
          call_date?: string | null
          call_status: string
          callback_date?: string | null
          contact_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          outcome?: string | null
          user_id: string
        }
        Update: {
          call_date?: string | null
          call_status?: string
          callback_date?: string | null
          contact_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "sales_lead_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_daily_stats: {
        Row: {
          calls_answered: number | null
          calls_made: number | null
          created_at: string | null
          emails_sent: number | null
          id: string
          leads_added: number | null
          registrations: number | null
          stat_date: string
          user_id: string
        }
        Insert: {
          calls_answered?: number | null
          calls_made?: number | null
          created_at?: string | null
          emails_sent?: number | null
          id?: string
          leads_added?: number | null
          registrations?: number | null
          stat_date?: string
          user_id: string
        }
        Update: {
          calls_answered?: number | null
          calls_made?: number | null
          created_at?: string | null
          emails_sent?: number | null
          id?: string
          leads_added?: number | null
          registrations?: number | null
          stat_date?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_invitations: {
        Row: {
          clicked_at: string | null
          contact_id: string | null
          id: string
          lead_id: string
          opened_at: string | null
          registered_at: string | null
          reminder_sent_at: string | null
          sent_at: string | null
          sent_by: string
          sent_to_email: string
          template_type: string | null
        }
        Insert: {
          clicked_at?: string | null
          contact_id?: string | null
          id?: string
          lead_id: string
          opened_at?: string | null
          registered_at?: string | null
          reminder_sent_at?: string | null
          sent_at?: string | null
          sent_by: string
          sent_to_email: string
          template_type?: string | null
        }
        Update: {
          clicked_at?: string | null
          contact_id?: string | null
          id?: string
          lead_id?: string
          opened_at?: string | null
          registered_at?: string | null
          reminder_sent_at?: string | null
          sent_at?: string | null
          sent_by?: string
          sent_to_email?: string
          template_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invitations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "sales_lead_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invitations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lead_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      sales_lead_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean | null
          lead_id: string
          notes: string | null
          phone: string | null
          position: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean | null
          lead_id: string
          notes?: string | null
          phone?: string | null
          position?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean | null
          lead_id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          address: string | null
          ai_call_status: string | null
          ai_consent: boolean | null
          ai_last_call_at: string | null
          ai_preferred_time: string | null
          assigned_to: string | null
          category_id: string | null
          city: string | null
          company_name: string
          created_at: string | null
          created_by: string
          email: string | null
          id: string
          nip: string | null
          notes: string | null
          phone: string
          registered_at: string | null
          registered_user_id: string | null
          source: string | null
          status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          ai_call_status?: string | null
          ai_consent?: boolean | null
          ai_last_call_at?: string | null
          ai_preferred_time?: string | null
          assigned_to?: string | null
          category_id?: string | null
          city?: string | null
          company_name: string
          created_at?: string | null
          created_by: string
          email?: string | null
          id?: string
          nip?: string | null
          notes?: string | null
          phone: string
          registered_at?: string | null
          registered_user_id?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          ai_call_status?: string | null
          ai_consent?: boolean | null
          ai_last_call_at?: string | null
          ai_preferred_time?: string | null
          assigned_to?: string | null
          category_id?: string | null
          city?: string | null
          company_name?: string
          created_at?: string | null
          created_by?: string
          email?: string | null
          id?: string
          nip?: string | null
          notes?: string | null
          phone?: string
          registered_at?: string | null
          registered_user_id?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sales_lead_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_user_settings: {
        Row: {
          created_at: string | null
          daily_call_target: number | null
          is_active: boolean | null
          phone_extension: string | null
          updated_at: string | null
          user_id: string
          work_email: string | null
        }
        Insert: {
          created_at?: string | null
          daily_call_target?: number | null
          is_active?: boolean | null
          phone_extension?: string | null
          updated_at?: string | null
          user_id: string
          work_email?: string | null
        }
        Update: {
          created_at?: string | null
          daily_call_target?: number | null
          is_active?: boolean | null
          phone_extension?: string | null
          updated_at?: string | null
          user_id?: string
          work_email?: string | null
        }
        Relationships: []
      }
      service_booking_status_history: {
        Row: {
          booking_id: string | null
          changed_by: string | null
          created_at: string | null
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          booking_id?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          booking_id?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bookings: {
        Row: {
          booking_number: string
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string
          customer_user_id: string | null
          duration_minutes: number
          employee_id: string | null
          estimated_price: number | null
          final_price: number | null
          id: string
          loyalty_points_earned: number | null
          provider_id: string | null
          provider_notes: string | null
          resource_id: string | null
          scheduled_date: string
          scheduled_time: string
          service_id: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          booking_number: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_phone: string
          customer_user_id?: string | null
          duration_minutes: number
          employee_id?: string | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          loyalty_points_earned?: number | null
          provider_id?: string | null
          provider_notes?: string | null
          resource_id?: string | null
          scheduled_date: string
          scheduled_time: string
          service_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_number?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string
          customer_user_id?: string | null
          duration_minutes?: number
          employee_id?: string | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          loyalty_points_earned?: number | null
          provider_id?: string | null
          provider_notes?: string | null
          resource_id?: string | null
          scheduled_date?: string
          scheduled_time?: string
          service_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "service_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "service_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calendar_blocks: {
        Row: {
          block_type: string | null
          created_at: string | null
          employee_id: string | null
          end_datetime: string
          id: string
          provider_id: string | null
          reason: string | null
          resource_id: string | null
          start_datetime: string
        }
        Insert: {
          block_type?: string | null
          created_at?: string | null
          employee_id?: string | null
          end_datetime: string
          id?: string
          provider_id?: string | null
          reason?: string | null
          resource_id?: string | null
          start_datetime: string
        }
        Update: {
          block_type?: string | null
          created_at?: string | null
          employee_id?: string | null
          end_datetime?: string
          id?: string
          provider_id?: string | null
          reason?: string | null
          resource_id?: string | null
          start_datetime?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_calendar_blocks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "service_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calendar_blocks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calendar_blocks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "service_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      service_commission_settings: {
        Row: {
          commission_percent: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_amount: number | null
          min_amount: number | null
          updated_at: string | null
        }
        Insert: {
          commission_percent?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_amount?: number | null
          min_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          commission_percent?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_amount?: number | null
          min_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_confirmations: {
        Row: {
          booking_id: string | null
          client_code: string
          client_code_verified_at: string | null
          client_confirmation_method: string | null
          client_confirmed_at: string | null
          commission_amount: number | null
          commission_status: string | null
          created_at: string | null
          final_price: number
          id: string
          provider_submitted_at: string | null
          service_description: string | null
        }
        Insert: {
          booking_id?: string | null
          client_code: string
          client_code_verified_at?: string | null
          client_confirmation_method?: string | null
          client_confirmed_at?: string | null
          commission_amount?: number | null
          commission_status?: string | null
          created_at?: string | null
          final_price: number
          id?: string
          provider_submitted_at?: string | null
          service_description?: string | null
        }
        Update: {
          booking_id?: string | null
          client_code?: string
          client_code_verified_at?: string | null
          client_confirmation_method?: string | null
          client_confirmed_at?: string | null
          commission_amount?: number | null
          commission_status?: string | null
          created_at?: string | null
          final_price?: number
          id?: string
          provider_submitted_at?: string | null
          service_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_confirmations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_customer_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          note: string
          provider_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          note: string
          provider_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          note?: string
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_customer_notes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_customers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          last_visit_at: string | null
          loyalty_points: number | null
          loyalty_visits: number | null
          name: string
          notes: string | null
          phone: string | null
          provider_id: string | null
          tags: string[] | null
          total_spent: number | null
          total_visits: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_visit_at?: string | null
          loyalty_points?: number | null
          loyalty_visits?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          provider_id?: string | null
          tags?: string[] | null
          total_spent?: number | null
          total_visits?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_visit_at?: string | null
          loyalty_points?: number | null
          loyalty_visits?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          provider_id?: string | null
          tags?: string[] | null
          total_spent?: number | null
          total_visits?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_customers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_employees: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean | null
          last_name: string
          phone: string | null
          provider_id: string | null
          role: string | null
          specializations: string[] | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean | null
          last_name: string
          phone?: string | null
          provider_id?: string | null
          role?: string | null
          specializations?: string[] | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean | null
          last_name?: string
          phone?: string | null
          provider_id?: string | null
          role?: string | null
          specializations?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_employees_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_messages: {
        Row: {
          booking_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          read_at: string | null
          recipient_user_id: string
          sender_user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          read_at?: string | null
          recipient_user_id: string
          sender_user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          read_at?: string | null
          recipient_user_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_notifications: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string | null
          error_message: string | null
          id: string
          message: string
          notification_type: string
          recipient_email: string | null
          recipient_phone: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          notification_type: string
          recipient_email?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          notification_type?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_price_history: {
        Row: {
          created_at: string
          id: string
          last_price_gross: number
          last_price_net: number
          last_used_at: string
          provider_id: string
          service_name: string
          service_name_normalized: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_price_gross?: number
          last_price_net?: number
          last_used_at?: string
          provider_id: string
          service_name: string
          service_name_normalized: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_price_gross?: number
          last_price_net?: number
          last_used_at?: string
          provider_id?: string
          service_name?: string
          service_name_normalized?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_price_history_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_provider_nav_preferences: {
        Row: {
          created_at: string
          id: string
          more_tabs: string[]
          primary_tabs: string[]
          provider_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          more_tabs?: string[]
          primary_tabs?: string[]
          provider_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          more_tabs?: string[]
          primary_tabs?: string[]
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_provider_nav_preferences_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_provider_requests: {
        Row: {
          created_at: string
          description: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string
          processed_at: string | null
          processed_by: string | null
          service_type: string
          status: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone: string
          processed_at?: string | null
          processed_by?: string | null
          service_type: string
          status?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string
          processed_at?: string | null
          processed_by?: string | null
          service_type?: string
          status?: string | null
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          auto_confirm: boolean | null
          booking_advance_days: number | null
          cancellation_hours: number | null
          category_id: string | null
          company_address: string | null
          company_city: string | null
          company_email: string | null
          company_name: string
          company_nip: string | null
          company_phone: string | null
          company_postal_code: string | null
          company_regon: string | null
          company_website: string | null
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          loyalty_config: Json | null
          loyalty_enabled: boolean | null
          loyalty_type: string | null
          owner_email: string | null
          owner_first_name: string | null
          owner_last_name: string | null
          owner_phone: string | null
          rating_avg: number | null
          rating_count: number | null
          status: string | null
          total_bookings: number | null
          updated_at: string | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          auto_confirm?: boolean | null
          booking_advance_days?: number | null
          cancellation_hours?: number | null
          category_id?: string | null
          company_address?: string | null
          company_city?: string | null
          company_email?: string | null
          company_name: string
          company_nip?: string | null
          company_phone?: string | null
          company_postal_code?: string | null
          company_regon?: string | null
          company_website?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          loyalty_config?: Json | null
          loyalty_enabled?: boolean | null
          loyalty_type?: string | null
          owner_email?: string | null
          owner_first_name?: string | null
          owner_last_name?: string | null
          owner_phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          status?: string | null
          total_bookings?: number | null
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          auto_confirm?: boolean | null
          booking_advance_days?: number | null
          cancellation_hours?: number | null
          category_id?: string | null
          company_address?: string | null
          company_city?: string | null
          company_email?: string | null
          company_name?: string
          company_nip?: string | null
          company_phone?: string | null
          company_postal_code?: string | null
          company_regon?: string | null
          company_website?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          loyalty_config?: Json | null
          loyalty_enabled?: boolean | null
          loyalty_type?: string | null
          owner_email?: string | null
          owner_first_name?: string | null
          owner_last_name?: string | null
          owner_phone?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          status?: string | null
          total_bookings?: number | null
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_providers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          capacity: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          provider_id: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          provider_id?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reviews: {
        Row: {
          booking_id: string | null
          comment: string | null
          created_at: string | null
          customer_user_id: string | null
          id: string
          is_visible: boolean | null
          provider_id: string | null
          provider_response: string | null
          provider_response_at: string | null
          rating: number
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string | null
          customer_user_id?: string | null
          id?: string
          is_visible?: boolean | null
          provider_id?: string | null
          provider_response?: string | null
          provider_response_at?: string | null
          rating: number
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string | null
          customer_user_id?: string | null
          id?: string
          is_visible?: boolean | null
          provider_id?: string | null
          provider_response?: string | null
          provider_response_at?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_subcategories: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by_user_id: string | null
          id: string
          is_approved: boolean | null
          name: string
          parent_category_id: string | null
          slug: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          is_approved?: boolean | null
          name: string
          parent_category_id?: string | null
          slug: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          is_approved?: boolean | null
          name?: string
          parent_category_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_subcategories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      service_working_hours: {
        Row: {
          day_of_week: number
          employee_id: string | null
          end_time: string
          id: string
          is_working: boolean | null
          provider_id: string | null
          start_time: string
        }
        Insert: {
          day_of_week: number
          employee_id?: string | null
          end_time: string
          id?: string
          is_working?: boolean | null
          provider_id?: string | null
          start_time: string
        }
        Update: {
          day_of_week?: number
          employee_id?: string | null
          end_time?: string
          id?: string
          is_working?: boolean | null
          provider_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_working_hours_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "service_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_working_hours_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          name: string
          price: number | null
          price_from: number | null
          price_type: string | null
          provider_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          name: string
          price?: number | null
          price_from?: number | null
          price_type?: string | null
          provider_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          name?: string
          price?: number | null
          price_from?: number | null
          price_type?: string | null
          provider_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_import_diagnostics: {
        Row: {
          created_at: string | null
          created_driver_id: string | null
          csv_row_number: number | null
          error_message: string | null
          fleet_id: string | null
          id: string
          import_timestamp: string | null
          match_result: string | null
          match_score: number | null
          matched_driver_id: string | null
          platform: string
          raw_driver_name: string | null
          raw_email: string | null
          raw_phone: string | null
          raw_platform_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_driver_id?: string | null
          csv_row_number?: number | null
          error_message?: string | null
          fleet_id?: string | null
          id?: string
          import_timestamp?: string | null
          match_result?: string | null
          match_score?: number | null
          matched_driver_id?: string | null
          platform: string
          raw_driver_name?: string | null
          raw_email?: string | null
          raw_phone?: string | null
          raw_platform_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_driver_id?: string | null
          csv_row_number?: number | null
          error_message?: string | null
          fleet_id?: string | null
          id?: string
          import_timestamp?: string | null
          match_result?: string | null
          match_score?: number | null
          matched_driver_id?: string | null
          platform?: string
          raw_driver_name?: string | null
          raw_email?: string | null
          raw_phone?: string | null
          raw_platform_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_import_diagnostics_created_driver_id_fkey"
            columns: ["created_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_import_diagnostics_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_import_diagnostics_matched_driver_id_fkey"
            columns: ["matched_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_periods: {
        Row: {
          city_id: string
          created_at: string
          google_sheet_url: string
          id: string
          status: string
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          city_id: string
          created_at?: string
          google_sheet_url?: string
          id?: string
          status?: string
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          city_id?: string
          created_at?: string
          google_sheet_url?: string
          id?: string
          status?: string
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      settlement_plan_changes: {
        Row: {
          changed_at: string
          changed_by: string
          changed_by_role: Database["public"]["Enums"]["app_role"]
          driver_id: string
          id: string
          new_plan_id: string
          notes: string | null
          old_plan_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          changed_by_role: Database["public"]["Enums"]["app_role"]
          driver_id: string
          id?: string
          new_plan_id: string
          notes?: string | null
          old_plan_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          changed_by_role?: Database["public"]["Enums"]["app_role"]
          driver_id?: string
          id?: string
          new_plan_id?: string
          notes?: string | null
          old_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_plan_changes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_plan_changes_new_plan_id_fkey"
            columns: ["new_plan_id"]
            isOneToOne: false
            referencedRelation: "settlement_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_plan_changes_old_plan_id_fkey"
            columns: ["old_plan_id"]
            isOneToOne: false
            referencedRelation: "settlement_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_plans: {
        Row: {
          base_fee: number
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_visible: boolean | null
          name: string
          service_fee: number | null
          tax_percentage: number | null
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          base_fee?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_visible?: boolean | null
          name: string
          service_fee?: number | null
          tax_percentage?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          base_fee?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_visible?: boolean | null
          name?: string
          service_fee?: number | null
          tax_percentage?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      settlement_visibility_settings: {
        Row: {
          created_at: string | null
          id: string
          payout_formula: string | null
          show_bolt_cash: boolean | null
          show_bolt_commission: boolean | null
          show_bolt_gross: boolean | null
          show_bolt_net: boolean | null
          show_freenow_cash: boolean | null
          show_freenow_commission: boolean | null
          show_freenow_gross: boolean | null
          show_freenow_net: boolean | null
          show_fuel: boolean | null
          show_fuel_vat: boolean | null
          show_fuel_vat_refund: boolean | null
          show_tax: boolean | null
          show_total_cash: boolean | null
          show_total_commission: boolean | null
          show_uber: boolean | null
          show_uber_cash: boolean | null
          show_uber_cashless: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payout_formula?: string | null
          show_bolt_cash?: boolean | null
          show_bolt_commission?: boolean | null
          show_bolt_gross?: boolean | null
          show_bolt_net?: boolean | null
          show_freenow_cash?: boolean | null
          show_freenow_commission?: boolean | null
          show_freenow_gross?: boolean | null
          show_freenow_net?: boolean | null
          show_fuel?: boolean | null
          show_fuel_vat?: boolean | null
          show_fuel_vat_refund?: boolean | null
          show_tax?: boolean | null
          show_total_cash?: boolean | null
          show_total_commission?: boolean | null
          show_uber?: boolean | null
          show_uber_cash?: boolean | null
          show_uber_cashless?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payout_formula?: string | null
          show_bolt_cash?: boolean | null
          show_bolt_commission?: boolean | null
          show_bolt_gross?: boolean | null
          show_bolt_net?: boolean | null
          show_freenow_cash?: boolean | null
          show_freenow_commission?: boolean | null
          show_freenow_gross?: boolean | null
          show_freenow_net?: boolean | null
          show_fuel?: boolean | null
          show_fuel_vat?: boolean | null
          show_fuel_vat_refund?: boolean | null
          show_tax?: boolean | null
          show_total_cash?: boolean | null
          show_total_commission?: boolean | null
          show_uber?: boolean | null
          show_uber_cash?: boolean | null
          show_uber_cashless?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      settlements: {
        Row: {
          actual_payout: number | null
          amounts: Json | null
          city_id: string
          commission_amount: number | null
          created_at: string
          debt_after: number | null
          debt_before: number | null
          debt_payment: number | null
          driver_id: string
          id: string
          is_paid: boolean | null
          net_amount: number | null
          paid_at: string | null
          period_from: string | null
          period_to: string | null
          platform: string
          raw: Json | null
          raw_row_id: string | null
          rental_fee: number | null
          source: string | null
          total_earnings: number | null
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          actual_payout?: number | null
          amounts?: Json | null
          city_id: string
          commission_amount?: number | null
          created_at?: string
          debt_after?: number | null
          debt_before?: number | null
          debt_payment?: number | null
          driver_id: string
          id?: string
          is_paid?: boolean | null
          net_amount?: number | null
          paid_at?: string | null
          period_from?: string | null
          period_to?: string | null
          platform: string
          raw?: Json | null
          raw_row_id?: string | null
          rental_fee?: number | null
          source?: string | null
          total_earnings?: number | null
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          actual_payout?: number | null
          amounts?: Json | null
          city_id?: string
          commission_amount?: number | null
          created_at?: string
          debt_after?: number | null
          debt_before?: number | null
          debt_payment?: number | null
          driver_id?: string
          id?: string
          is_paid?: boolean | null
          net_amount?: number | null
          paid_at?: string | null
          period_from?: string | null
          period_to?: string | null
          platform?: string
          raw?: Json | null
          raw_row_id?: string | null
          rental_fee?: number | null
          source?: string | null
          total_earnings?: number | null
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements_weekly: {
        Row: {
          adjustments_sum: number | null
          cash_sum: number | null
          commission_sum: number | null
          created_at: string
          driver_id: string
          gross_sum: number | null
          id: number
          job_id: string
          net_result: number | null
          platform: string
          trips_count: number | null
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          adjustments_sum?: number | null
          cash_sum?: number | null
          commission_sum?: number | null
          created_at?: string
          driver_id: string
          gross_sum?: number | null
          id?: number
          job_id: string
          net_result?: number | null
          platform: string
          trips_count?: number | null
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          adjustments_sum?: number | null
          cash_sum?: number | null
          commission_sum?: number | null
          created_at?: string
          driver_id?: string
          gross_sum?: number | null
          id?: number
          job_id?: string
          net_result?: number | null
          platform?: string
          trips_count?: number | null
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_weekly_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_weekly_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_settings: {
        Row: {
          api_key_secret_name: string | null
          api_url: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          provider: string
          sender_name: string | null
          updated_at: string | null
        }
        Insert: {
          api_key_secret_name?: string | null
          api_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider: string
          sender_name?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key_secret_name?: string | null
          api_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          sender_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string | null
          id: string
          invoice_id: string | null
          invoice_number: string | null
          movement_type: string
          notes: string | null
          product_id: string | null
          quantity: number
          supplier: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          movement_type: string
          notes?: string | null
          product_id?: string | null
          quantity: number
          supplier?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string | null
          movement_type?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          supplier?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktaking_items: {
        Row: {
          applied: boolean | null
          applied_at: string | null
          counted_qty: number | null
          created_at: string | null
          diff_qty: number | null
          id: string
          notes: string | null
          product_id: string
          stocktaking_id: string
          system_qty: number | null
        }
        Insert: {
          applied?: boolean | null
          applied_at?: string | null
          counted_qty?: number | null
          created_at?: string | null
          diff_qty?: number | null
          id?: string
          notes?: string | null
          product_id: string
          stocktaking_id: string
          system_qty?: number | null
        }
        Update: {
          applied?: boolean | null
          applied_at?: string | null
          counted_qty?: number | null
          created_at?: string | null
          diff_qty?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          stocktaking_id?: string
          system_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktaking_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktaking_items_stocktaking_id_fkey"
            columns: ["stocktaking_id"]
            isOneToOne: false
            referencedRelation: "stocktakings"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktakings: {
        Row: {
          completed_at: string | null
          created_at: string | null
          entity_id: string | null
          id: string
          name: string | null
          notes: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          entity_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktakings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_mappings: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          supplier_name: string
          supplier_symbol: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          supplier_name: string
          supplier_symbol?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          supplier_name?: string
          supplier_symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_whitelist: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          ai_repair_prompt: string | null
          created_at: string
          description: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_urls: string[] | null
          status: string
          submitted_by: string
          submitted_by_email: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          ai_repair_prompt?: string | null
          created_at?: string
          description: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_urls?: string[] | null
          status?: string
          submitted_by?: string
          submitted_by_email?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          ai_repair_prompt?: string | null
          created_at?: string
          description?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_urls?: string[] | null
          status?: string
          submitted_by?: string
          submitted_by_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          category: string
          created_at: string
          description: string | null
          driver_id: string | null
          fleet_id: string | null
          id: string
          import_job_id: string | null
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          driver_id?: string | null
          fleet_id?: string | null
          id?: string
          import_job_id?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          driver_id?: string | null
          fleet_id?: string | null
          id?: string
          import_job_id?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_permissions: {
        Row: {
          created_at: string | null
          id: string
          is_visible: boolean | null
          parent_tab_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          tab_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          parent_tab_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          tab_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          parent_tab_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tab_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tax_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kpir_column: number | null
          name: string
          ryczalt_rate: number | null
          vat_deductible_percent: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kpir_column?: number | null
          name: string
          ryczalt_rate?: number | null
          vat_deductible_percent?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kpir_column?: number | null
          name?: string
          ryczalt_rate?: number | null
          vat_deductible_percent?: number | null
        }
        Relationships: []
      }
      ticket_chat_whitelist: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      toll_purchases: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          end_at: string | null
          id: string
          provider: string | null
          segment_id: string | null
          start_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          end_at?: string | null
          id?: string
          provider?: string | null
          segment_id?: string | null
          start_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          end_at?: string | null
          id?: string
          provider?: string | null
          segment_id?: string | null
          start_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toll_purchases_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "toll_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      toll_segments: {
        Row: {
          country: string | null
          created_at: string | null
          geometry: Json
          id: string
          is_active: boolean | null
          name: string
          price_rules: Json | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          geometry: Json
          id?: string
          is_active?: boolean | null
          name: string
          price_rules?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          geometry?: Json
          id?: string
          is_active?: boolean | null
          name?: string
          price_rules?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      transit_location_data: {
        Row: {
          ai_summary: string | null
          avg_frequency_minutes: number | null
          calculated_at: string | null
          data_source_id: string | null
          geohash: string
          has_night_service: boolean | null
          id: string
          latitude: number
          line_count: number | null
          longitude: number
          nearest_stop_distance_m: number | null
          nearest_stop_name: string | null
          stops_within_1000m: number | null
          stops_within_500m: number | null
          transport_rating: string | null
          transport_score: number | null
          transport_types: string[] | null
          valid_until: string | null
        }
        Insert: {
          ai_summary?: string | null
          avg_frequency_minutes?: number | null
          calculated_at?: string | null
          data_source_id?: string | null
          geohash: string
          has_night_service?: boolean | null
          id?: string
          latitude: number
          line_count?: number | null
          longitude: number
          nearest_stop_distance_m?: number | null
          nearest_stop_name?: string | null
          stops_within_1000m?: number | null
          stops_within_500m?: number | null
          transport_rating?: string | null
          transport_score?: number | null
          transport_types?: string[] | null
          valid_until?: string | null
        }
        Update: {
          ai_summary?: string | null
          avg_frequency_minutes?: number | null
          calculated_at?: string | null
          data_source_id?: string | null
          geohash?: string
          has_night_service?: boolean | null
          id?: string
          latitude?: number
          line_count?: number | null
          longitude?: number
          nearest_stop_distance_m?: number | null
          nearest_stop_name?: string | null
          stops_within_1000m?: number | null
          stops_within_500m?: number | null
          transport_rating?: string | null
          transport_score?: number | null
          transport_types?: string[] | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transit_location_data_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "gtfs_data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      translations_cache: {
        Row: {
          access_count: number | null
          created_at: string | null
          entity_id: string
          entity_type: string
          field_name: string
          id: string
          last_accessed: string | null
          source_hash: string
          source_lang: string
          target_lang: string
          translated_by: string | null
          translated_text: string
        }
        Insert: {
          access_count?: number | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          field_name: string
          id?: string
          last_accessed?: string | null
          source_hash: string
          source_lang?: string
          target_lang: string
          translated_by?: string | null
          translated_text: string
        }
        Update: {
          access_count?: number | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          field_name?: string
          id?: string
          last_accessed?: string | null
          source_hash?: string
          source_lang?: string
          target_lang?: string
          translated_by?: string | null
          translated_text?: string
        }
        Relationships: []
      }
      ui_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      universal_listing_numbers: {
        Row: {
          created_at: string
          listing_id: string
          listing_number: string
          marketplace_type: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          listing_number: string
          marketplace_type: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          listing_number?: string
          marketplace_type?: string
        }
        Relationships: []
      }
      unmapped_settlement_drivers: {
        Row: {
          bolt_id: string | null
          created_at: string | null
          driver_id: string | null
          fleet_id: string | null
          freenow_id: string | null
          full_name: string | null
          id: string
          linked_driver_id: string | null
          phone: string | null
          resolved_at: string | null
          settlement_period_id: string | null
          status: string | null
          uber_id: string | null
        }
        Insert: {
          bolt_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          fleet_id?: string | null
          freenow_id?: string | null
          full_name?: string | null
          id?: string
          linked_driver_id?: string | null
          phone?: string | null
          resolved_at?: string | null
          settlement_period_id?: string | null
          status?: string | null
          uber_id?: string | null
        }
        Update: {
          bolt_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          fleet_id?: string | null
          freenow_id?: string | null
          full_name?: string | null
          id?: string
          linked_driver_id?: string | null
          phone?: string | null
          resolved_at?: string | null
          settlement_period_id?: string | null
          status?: string | null
          uber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmapped_settlement_drivers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmapped_settlement_drivers_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmapped_settlement_drivers_linked_driver_id_fkey"
            columns: ["linked_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_events: {
        Row: {
          all_day: boolean | null
          booking_id: string | null
          color: string | null
          created_at: string | null
          description: string | null
          end_datetime: string | null
          event_type: string | null
          id: string
          is_public: boolean | null
          location: string | null
          reminder_before_minutes: number | null
          reminder_sent: boolean | null
          shared_with_users: string[] | null
          start_datetime: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          all_day?: boolean | null
          booking_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string | null
          id?: string
          is_public?: boolean | null
          location?: string | null
          reminder_before_minutes?: number | null
          reminder_sent?: boolean | null
          shared_with_users?: string[] | null
          start_datetime: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          all_day?: boolean | null
          booking_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string | null
          id?: string
          is_public?: boolean | null
          location?: string | null
          reminder_before_minutes?: number | null
          reminder_sent?: boolean | null
          shared_with_users?: string[] | null
          start_datetime?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_contractors: {
        Row: {
          address_apartment_number: string | null
          address_building_number: string | null
          address_city: string | null
          address_postal_code: string | null
          address_street: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          nip: string | null
          notes: string | null
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_apartment_number?: string | null
          address_building_number?: string | null
          address_city?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          nip?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_apartment_number?: string | null
          address_building_number?: string | null
          address_city?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          nip?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string | null
          credits_balance: number | null
          id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          credits_balance?: number | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          credits_balance?: number | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_invoice_companies: {
        Row: {
          address_apartment_number: string | null
          address_building_number: string | null
          address_city: string | null
          address_postal_code: string | null
          address_street: string | null
          bank_account: string | null
          bank_name: string | null
          created_at: string | null
          email: string | null
          id: string
          is_default: boolean | null
          logo_url: string | null
          name: string
          nip: string | null
          phone: string | null
          swift_code: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_apartment_number?: string | null
          address_building_number?: string | null
          address_city?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_default?: boolean | null
          logo_url?: string | null
          name: string
          nip?: string | null
          phone?: string | null
          swift_code?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_apartment_number?: string | null
          address_building_number?: string | null
          address_city?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_default?: boolean | null
          logo_url?: string | null
          name?: string
          nip?: string | null
          phone?: string | null
          swift_code?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_invoice_items: {
        Row: {
          gross_amount: number | null
          id: string
          inventory_product_id: string | null
          invoice_id: string
          name: string
          net_amount: number | null
          quantity: number | null
          sort_order: number | null
          unit: string | null
          unit_net_price: number | null
          vat_amount: number | null
          vat_rate: string | null
        }
        Insert: {
          gross_amount?: number | null
          id?: string
          inventory_product_id?: string | null
          invoice_id: string
          name: string
          net_amount?: number | null
          quantity?: number | null
          sort_order?: number | null
          unit?: string | null
          unit_net_price?: number | null
          vat_amount?: number | null
          vat_rate?: string | null
        }
        Update: {
          gross_amount?: number | null
          id?: string
          inventory_product_id?: string | null
          invoice_id?: string
          name?: string
          net_amount?: number | null
          quantity?: number | null
          sort_order?: number | null
          unit?: string | null
          unit_net_price?: number | null
          vat_amount?: number | null
          vat_rate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invoice_items_inventory_product_id_fkey"
            columns: ["inventory_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "user_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invoices: {
        Row: {
          buyer_address: string | null
          buyer_name: string | null
          buyer_nip: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          gross_total: number | null
          id: string
          invoice_number: string
          invoice_type: string | null
          is_paid: boolean | null
          issue_date: string
          issue_place: string | null
          net_total: number | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_method: string | null
          pdf_url: string | null
          sale_date: string | null
          updated_at: string | null
          user_id: string
          vat_total: number | null
        }
        Insert: {
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          gross_total?: number | null
          id?: string
          invoice_number: string
          invoice_type?: string | null
          is_paid?: boolean | null
          issue_date: string
          issue_place?: string | null
          net_total?: number | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          sale_date?: string | null
          updated_at?: string | null
          user_id: string
          vat_total?: number | null
        }
        Update: {
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          gross_total?: number | null
          id?: string
          invoice_number?: string
          invoice_type?: string | null
          is_paid?: boolean | null
          issue_date?: string
          issue_place?: string | null
          net_total?: number | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          sale_date?: string | null
          updated_at?: string | null
          user_id?: string
          vat_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "user_invoice_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          fleet_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          fleet_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          fleet_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_vehicles: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          nickname: string | null
          plate: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          nickname?: string | null
          plate: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          nickname?: string | null
          plate?: string
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          balance: number | null
          coins_balance: number | null
          created_at: string | null
          id: string
          total_earned: number | null
          total_spent: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          coins_balance?: number | null
          created_at?: string | null
          id?: string
          total_earned?: number | null
          total_spent?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          coins_balance?: number | null
          created_at?: string | null
          id?: string
          total_earned?: number | null
          total_spent?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vehicle_damages: {
        Row: {
          cost: number | null
          created_at: string
          date: string
          description: string
          id: string
          notes: string | null
          status: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          date: string
          description: string
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          notes?: string | null
          status?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_damages_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_inspections: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          odometer: number | null
          result: string | null
          updated_at: string
          valid_to: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          odometer?: number | null
          result?: string | null
          updated_at?: string
          valid_to?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          odometer?: number | null
          result?: string | null
          updated_at?: string
          valid_to?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_integration_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          integration_key: string | null
          registration_number: string | null
          request_type: string | null
          response_snapshot: Json | null
          status: string | null
          user_id: string | null
          vin: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_key?: string | null
          registration_number?: string | null
          request_type?: string | null
          response_snapshot?: Json | null
          status?: string | null
          user_id?: string | null
          vin?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_key?: string | null
          registration_number?: string | null
          request_type?: string | null
          response_snapshot?: Json | null
          status?: string | null
          user_id?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      vehicle_listings: {
        Row: {
          ai_enhanced_photos: string[] | null
          body_type: string | null
          brand: string | null
          city: string | null
          color: string | null
          color_type: string | null
          comparison_count: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_reveals_count: number | null
          country_origin: string | null
          created_at: string | null
          created_by: string | null
          dealer_id: string | null
          description: string | null
          description_long: string | null
          doors_count: number | null
          engine_capacity: number | null
          equipment: Json | null
          exchange_data: Json | null
          expires_at: string | null
          favorites_count: number | null
          first_registration_date: string | null
          fleet_id: string | null
          fleet_package_data: Json | null
          fuel_type: string | null
          has_ai_photos: boolean | null
          id: string
          inspection_expiry: string | null
          inspection_valid: boolean | null
          insurance_expiry: string | null
          insurance_valid: boolean | null
          is_available: boolean | null
          is_damaged: boolean | null
          is_imported: boolean | null
          is_verified: boolean | null
          latitude: number | null
          leasing_transfer_data: Json | null
          listed_at: string | null
          listing_number: string | null
          location: string | null
          long_term_rental_data: Json | null
          longitude: number | null
          model: string | null
          odometer: number | null
          photo_alts: string[] | null
          photos: string[] | null
          power: number | null
          price: number | null
          price_type: string | null
          registration_number: string | null
          rent_to_own_data: Json | null
          seats_count: number | null
          seo_description: string | null
          seo_h1: string | null
          seo_schema_json: Json | null
          seo_title: string | null
          short_term_rental_data: Json | null
          status: string | null
          title: string | null
          transaction_type: string | null
          transmission: string | null
          updated_at: string | null
          vehicle_id: string | null
          views: number | null
          vin: string | null
          vin_reveals_count: number | null
          weekly_price: number
          year: number | null
        }
        Insert: {
          ai_enhanced_photos?: string[] | null
          body_type?: string | null
          brand?: string | null
          city?: string | null
          color?: string | null
          color_type?: string | null
          comparison_count?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_reveals_count?: number | null
          country_origin?: string | null
          created_at?: string | null
          created_by?: string | null
          dealer_id?: string | null
          description?: string | null
          description_long?: string | null
          doors_count?: number | null
          engine_capacity?: number | null
          equipment?: Json | null
          exchange_data?: Json | null
          expires_at?: string | null
          favorites_count?: number | null
          first_registration_date?: string | null
          fleet_id?: string | null
          fleet_package_data?: Json | null
          fuel_type?: string | null
          has_ai_photos?: boolean | null
          id?: string
          inspection_expiry?: string | null
          inspection_valid?: boolean | null
          insurance_expiry?: string | null
          insurance_valid?: boolean | null
          is_available?: boolean | null
          is_damaged?: boolean | null
          is_imported?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          leasing_transfer_data?: Json | null
          listed_at?: string | null
          listing_number?: string | null
          location?: string | null
          long_term_rental_data?: Json | null
          longitude?: number | null
          model?: string | null
          odometer?: number | null
          photo_alts?: string[] | null
          photos?: string[] | null
          power?: number | null
          price?: number | null
          price_type?: string | null
          registration_number?: string | null
          rent_to_own_data?: Json | null
          seats_count?: number | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_schema_json?: Json | null
          seo_title?: string | null
          short_term_rental_data?: Json | null
          status?: string | null
          title?: string | null
          transaction_type?: string | null
          transmission?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          views?: number | null
          vin?: string | null
          vin_reveals_count?: number | null
          weekly_price: number
          year?: number | null
        }
        Update: {
          ai_enhanced_photos?: string[] | null
          body_type?: string | null
          brand?: string | null
          city?: string | null
          color?: string | null
          color_type?: string | null
          comparison_count?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_reveals_count?: number | null
          country_origin?: string | null
          created_at?: string | null
          created_by?: string | null
          dealer_id?: string | null
          description?: string | null
          description_long?: string | null
          doors_count?: number | null
          engine_capacity?: number | null
          equipment?: Json | null
          exchange_data?: Json | null
          expires_at?: string | null
          favorites_count?: number | null
          first_registration_date?: string | null
          fleet_id?: string | null
          fleet_package_data?: Json | null
          fuel_type?: string | null
          has_ai_photos?: boolean | null
          id?: string
          inspection_expiry?: string | null
          inspection_valid?: boolean | null
          insurance_expiry?: string | null
          insurance_valid?: boolean | null
          is_available?: boolean | null
          is_damaged?: boolean | null
          is_imported?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          leasing_transfer_data?: Json | null
          listed_at?: string | null
          listing_number?: string | null
          location?: string | null
          long_term_rental_data?: Json | null
          longitude?: number | null
          model?: string | null
          odometer?: number | null
          photo_alts?: string[] | null
          photos?: string[] | null
          power?: number | null
          price?: number | null
          price_type?: string | null
          registration_number?: string | null
          rent_to_own_data?: Json | null
          seats_count?: number | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_schema_json?: Json | null
          seo_title?: string | null
          short_term_rental_data?: Json | null
          status?: string | null
          title?: string | null
          transaction_type?: string | null
          transmission?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          views?: number | null
          vin?: string | null
          vin_reveals_count?: number | null
          weekly_price?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_listings_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_listings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_lookup_credit_transactions: {
        Row: {
          created_at: string | null
          created_by_admin_id: string | null
          credits: number
          id: string
          note: string | null
          price_net: number | null
          source: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by_admin_id?: string | null
          credits: number
          id?: string
          note?: string | null
          price_net?: number | null
          source?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by_admin_id?: string | null
          credits?: number
          id?: string
          note?: string | null
          price_net?: number | null
          source?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_lookup_credits: {
        Row: {
          created_at: string | null
          id: string
          remaining_credits: number | null
          total_credits_purchased: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          remaining_credits?: number | null
          total_credits_purchased?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          remaining_credits?: number | null
          total_credits_purchased?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vehicle_lookup_usage: {
        Row: {
          created_at: string | null
          credits_used: number | null
          id: string
          registration_number: string | null
          source_type: string
          user_id: string
          vin: string | null
        }
        Insert: {
          created_at?: string | null
          credits_used?: number | null
          id?: string
          registration_number?: string | null
          source_type: string
          user_id: string
          vin?: string | null
        }
        Update: {
          created_at?: string | null
          credits_used?: number | null
          id?: string
          registration_number?: string | null
          source_type?: string
          user_id?: string
          vin?: string | null
        }
        Relationships: []
      }
      vehicle_owner_charges: {
        Row: {
          adjustment: number
          adjustment_note: string | null
          amount: number
          created_at: string
          fleet_id: string
          id: string
          is_settled: boolean
          owner_id: string
          settled_at: string | null
          vehicle_id: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          adjustment?: number
          adjustment_note?: string | null
          amount?: number
          created_at?: string
          fleet_id: string
          id?: string
          is_settled?: boolean
          owner_id: string
          settled_at?: string | null
          vehicle_id?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          adjustment?: number
          adjustment_note?: string | null
          amount?: number
          created_at?: string
          fleet_id?: string
          id?: string
          is_settled?: boolean
          owner_id?: string
          settled_at?: string | null
          vehicle_id?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_owner_charges_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_owner_charges_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "vehicle_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_owner_charges_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_owners: {
        Row: {
          bank_account: string | null
          company_name: string | null
          created_at: string
          email: string | null
          fleet_id: string
          id: string
          name: string
          nip: string | null
          notes: string | null
          payment_method: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          fleet_id: string
          id?: string
          name: string
          nip?: string | null
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          fleet_id?: string
          id?: string
          name?: string
          nip?: string | null
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_owners_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_policies: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          policy_no: string | null
          premium: number | null
          provider: string | null
          type: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          policy_no?: string | null
          premium?: number | null
          provider?: string | null
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          policy_no?: string | null
          premium?: number | null
          provider?: string | null
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_policies_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_registry_cache: {
        Row: {
          body_style: string | null
          color: string | null
          created_at: string | null
          description: string | null
          engine_size: string | null
          fuel_type: string | null
          id: string
          make: string | null
          manufacture_year_from: number | null
          manufacture_year_to: number | null
          model: string | null
          number_of_doors: string | null
          number_of_seats: string | null
          registration_number: string | null
          registration_year: number | null
          source: string | null
          source_payload: Json | null
          transmission: string | null
          updated_at: string | null
          vin: string | null
        }
        Insert: {
          body_style?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          engine_size?: string | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          manufacture_year_from?: number | null
          manufacture_year_to?: number | null
          model?: string | null
          number_of_doors?: string | null
          number_of_seats?: string | null
          registration_number?: string | null
          registration_year?: number | null
          source?: string | null
          source_payload?: Json | null
          transmission?: string | null
          updated_at?: string | null
          vin?: string | null
        }
        Update: {
          body_style?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          engine_size?: string | null
          fuel_type?: string | null
          id?: string
          make?: string | null
          manufacture_year_from?: number | null
          manufacture_year_to?: number | null
          model?: string | null
          number_of_doors?: string | null
          number_of_seats?: string | null
          registration_number?: string | null
          registration_year?: number | null
          source?: string | null
          source_payload?: Json | null
          transmission?: string | null
          updated_at?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      vehicle_rentals: {
        Row: {
          contract_locked_at: string | null
          contract_number: string | null
          created_at: string | null
          created_by: string | null
          driver_id: string
          driver_reviewed: boolean | null
          driver_signature_ip: string | null
          driver_signature_url: string | null
          driver_signature_user_agent: string | null
          driver_signed_at: string | null
          fleet_id: string
          fleet_reviewed: boolean | null
          fleet_signature_ip: string | null
          fleet_signature_url: string | null
          fleet_signature_user_agent: string | null
          fleet_signed_at: string | null
          id: string
          invitation_email: string | null
          invitation_method: string | null
          invitation_phone: string | null
          invitation_sent_at: string | null
          invitation_sms_sent_at: string | null
          is_indefinite: boolean | null
          listing_id: string | null
          portal_access_token: string | null
          protocol_completed_at: string | null
          rental_end: string | null
          rental_start: string | null
          rental_type: string | null
          source: string | null
          status: string | null
          updated_at: string | null
          vehicle_id: string
          weekly_price: number | null
          weekly_rental_fee: number | null
        }
        Insert: {
          contract_locked_at?: string | null
          contract_number?: string | null
          created_at?: string | null
          created_by?: string | null
          driver_id: string
          driver_reviewed?: boolean | null
          driver_signature_ip?: string | null
          driver_signature_url?: string | null
          driver_signature_user_agent?: string | null
          driver_signed_at?: string | null
          fleet_id: string
          fleet_reviewed?: boolean | null
          fleet_signature_ip?: string | null
          fleet_signature_url?: string | null
          fleet_signature_user_agent?: string | null
          fleet_signed_at?: string | null
          id?: string
          invitation_email?: string | null
          invitation_method?: string | null
          invitation_phone?: string | null
          invitation_sent_at?: string | null
          invitation_sms_sent_at?: string | null
          is_indefinite?: boolean | null
          listing_id?: string | null
          portal_access_token?: string | null
          protocol_completed_at?: string | null
          rental_end?: string | null
          rental_start?: string | null
          rental_type?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id: string
          weekly_price?: number | null
          weekly_rental_fee?: number | null
        }
        Update: {
          contract_locked_at?: string | null
          contract_number?: string | null
          created_at?: string | null
          created_by?: string | null
          driver_id?: string
          driver_reviewed?: boolean | null
          driver_signature_ip?: string | null
          driver_signature_url?: string | null
          driver_signature_user_agent?: string | null
          driver_signed_at?: string | null
          fleet_id?: string
          fleet_reviewed?: boolean | null
          fleet_signature_ip?: string | null
          fleet_signature_url?: string | null
          fleet_signature_user_agent?: string | null
          fleet_signed_at?: string | null
          id?: string
          invitation_email?: string | null
          invitation_method?: string | null
          invitation_phone?: string | null
          invitation_sent_at?: string | null
          invitation_sms_sent_at?: string | null
          is_indefinite?: boolean | null
          listing_id?: string | null
          portal_access_token?: string | null
          protocol_completed_at?: string | null
          rental_end?: string | null
          rental_start?: string | null
          rental_type?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id?: string
          weekly_price?: number | null
          weekly_rental_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_rentals_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_rentals_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_rentals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "vehicle_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_rentals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_services: {
        Row: {
          cost: number | null
          created_at: string
          date: string
          description: string | null
          id: string
          notes: string | null
          odometer: number | null
          provider: string | null
          type: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          date: string
          description?: string | null
          id?: string
          notes?: string | null
          odometer?: number | null
          provider?: string | null
          type: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          notes?: string | null
          odometer?: number | null
          provider?: string | null
          type?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_services_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          body_type: string | null
          brand: string
          city_id: string | null
          color: string | null
          contract_termination_date: string | null
          created_at: string
          engine_capacity: number | null
          fleet_id: string | null
          fuel_type: string | null
          id: string
          model: string
          odometer: number | null
          owner_id: string | null
          owner_name: string | null
          owner_rental_fee: number | null
          photos: string[] | null
          plate: string
          power: number | null
          status: string | null
          updated_at: string
          vin: string | null
          weekly_rental_fee: number | null
          year: number | null
        }
        Insert: {
          body_type?: string | null
          brand: string
          city_id?: string | null
          color?: string | null
          contract_termination_date?: string | null
          created_at?: string
          engine_capacity?: number | null
          fleet_id?: string | null
          fuel_type?: string | null
          id?: string
          model: string
          odometer?: number | null
          owner_id?: string | null
          owner_name?: string | null
          owner_rental_fee?: number | null
          photos?: string[] | null
          plate: string
          power?: number | null
          status?: string | null
          updated_at?: string
          vin?: string | null
          weekly_rental_fee?: number | null
          year?: number | null
        }
        Update: {
          body_type?: string | null
          brand?: string
          city_id?: string | null
          color?: string | null
          contract_termination_date?: string | null
          created_at?: string
          engine_capacity?: number | null
          fleet_id?: string | null
          fuel_type?: string | null
          id?: string
          model?: string
          odometer?: number | null
          owner_id?: string | null
          owner_name?: string | null
          owner_rental_fee?: number | null
          photos?: string[] | null
          plate?: string
          power?: number | null
          status?: string | null
          updated_at?: string
          vin?: string | null
          weekly_rental_fee?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "vehicle_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_phrase_cache: {
        Row: {
          audio_url: string | null
          created_at: string | null
          duration_ms: number | null
          id: string
          phrase_hash: string
          phrase_text: string
          provider: string | null
          voice_name: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          phrase_hash: string
          phrase_text: string
          provider?: string | null
          voice_name?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          phrase_hash?: string
          phrase_text?: string
          provider?: string | null
          voice_name?: string | null
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          type: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "user_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      website_corrections: {
        Row: {
          ai_response: string | null
          applied_at: string | null
          created_at: string | null
          element_description: string | null
          element_selector: string | null
          full_description: string | null
          id: string
          page_id: string | null
          project_id: string | null
          short_note: string | null
          status: string | null
        }
        Insert: {
          ai_response?: string | null
          applied_at?: string | null
          created_at?: string | null
          element_description?: string | null
          element_selector?: string | null
          full_description?: string | null
          id?: string
          page_id?: string | null
          project_id?: string | null
          short_note?: string | null
          status?: string | null
        }
        Update: {
          ai_response?: string | null
          applied_at?: string | null
          created_at?: string | null
          element_description?: string | null
          element_selector?: string | null
          full_description?: string | null
          id?: string
          page_id?: string | null
          project_id?: string | null
          short_note?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_corrections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "website_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      website_form_data: {
        Row: {
          about_short: string | null
          ai_answers: Json | null
          ai_questions: Json | null
          city_area: string | null
          company_name: string
          created_at: string | null
          cta_type: string | null
          email: string | null
          generated_logo_url: string | null
          google_maps_link: string | null
          has_logo: boolean | null
          id: string
          language: string | null
          logo_description: string | null
          logo_url: string | null
          phone: string | null
          project_id: string | null
          slogan: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_whatsapp: string | null
          tone_of_voice: string | null
          visual_style: string | null
          why_us_points: Json | null
          working_hours: string | null
        }
        Insert: {
          about_short?: string | null
          ai_answers?: Json | null
          ai_questions?: Json | null
          city_area?: string | null
          company_name: string
          created_at?: string | null
          cta_type?: string | null
          email?: string | null
          generated_logo_url?: string | null
          google_maps_link?: string | null
          has_logo?: boolean | null
          id?: string
          language?: string | null
          logo_description?: string | null
          logo_url?: string | null
          phone?: string | null
          project_id?: string | null
          slogan?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_whatsapp?: string | null
          tone_of_voice?: string | null
          visual_style?: string | null
          why_us_points?: Json | null
          working_hours?: string | null
        }
        Update: {
          about_short?: string | null
          ai_answers?: Json | null
          ai_questions?: Json | null
          city_area?: string | null
          company_name?: string
          created_at?: string | null
          cta_type?: string | null
          email?: string | null
          generated_logo_url?: string | null
          google_maps_link?: string | null
          has_logo?: boolean | null
          id?: string
          language?: string | null
          logo_description?: string | null
          logo_url?: string | null
          phone?: string | null
          project_id?: string | null
          slogan?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_whatsapp?: string | null
          tone_of_voice?: string | null
          visual_style?: string | null
          why_us_points?: Json | null
          working_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_form_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "website_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      website_pricing: {
        Row: {
          base_price: number
          corrections_included: number
          created_at: string | null
          domain_setup_price: number | null
          extra_corrections_price: number | null
          generation_cost: number | null
          id: string
          is_active: boolean | null
          package_type: string
          seo_addon_price: number | null
        }
        Insert: {
          base_price: number
          corrections_included: number
          created_at?: string | null
          domain_setup_price?: number | null
          extra_corrections_price?: number | null
          generation_cost?: number | null
          id?: string
          is_active?: boolean | null
          package_type: string
          seo_addon_price?: number | null
        }
        Update: {
          base_price?: number
          corrections_included?: number
          created_at?: string | null
          domain_setup_price?: number | null
          extra_corrections_price?: number | null
          generation_cost?: number | null
          id?: string
          is_active?: boolean | null
          package_type?: string
          seo_addon_price?: number | null
        }
        Relationships: []
      }
      website_projects: {
        Row: {
          corrections_limit: number
          corrections_used: number | null
          created_at: string | null
          custom_domain: string | null
          domain_setup_addon: boolean | null
          generated_css: string | null
          generated_html: string | null
          generated_pages: Json | null
          id: string
          is_published: boolean | null
          package_type: string
          provider_id: string | null
          published_at: string | null
          seo_addon: boolean | null
          status: string | null
          subdomain: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          corrections_limit?: number
          corrections_used?: number | null
          created_at?: string | null
          custom_domain?: string | null
          domain_setup_addon?: boolean | null
          generated_css?: string | null
          generated_html?: string | null
          generated_pages?: Json | null
          id?: string
          is_published?: boolean | null
          package_type: string
          provider_id?: string | null
          published_at?: string | null
          seo_addon?: boolean | null
          status?: string | null
          subdomain?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          corrections_limit?: number
          corrections_used?: number | null
          created_at?: string | null
          custom_domain?: string | null
          domain_setup_addon?: boolean | null
          generated_css?: string | null
          generated_html?: string | null
          generated_pages?: Json | null
          id?: string
          is_published?: boolean | null
          package_type?: string
          provider_id?: string | null
          published_at?: string | null
          seo_addon?: boolean | null
          status?: string | null
          subdomain?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_projects_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      website_services: {
        Row: {
          description: string | null
          form_data_id: string | null
          id: string
          inclusions: Json | null
          name: string
          price_from: number | null
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          form_data_id?: string | null
          id?: string
          inclusions?: Json | null
          name: string
          price_from?: number | null
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          form_data_id?: string | null
          id?: string
          inclusions?: Json | null
          name?: string
          price_from?: number | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "website_services_form_data_id_fkey"
            columns: ["form_data_id"]
            isOneToOne: false
            referencedRelation: "website_form_data"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_clients: {
        Row: {
          city: string | null
          client_type: string
          company_name: string | null
          country: string | null
          created_at: string | null
          default_vehicle_id: string | null
          description: string | null
          email: string | null
          first_name: string | null
          goods_discount_percent: number | null
          id: string
          last_name: string | null
          marketing_consent: boolean | null
          nip: string | null
          payment_method: string | null
          payment_term: string | null
          phone: string | null
          postal_code: string | null
          product_discount_percent: number | null
          provider_id: string
          service_discount_percent: number | null
          street: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          client_type?: string
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          default_vehicle_id?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          goods_discount_percent?: number | null
          id?: string
          last_name?: string | null
          marketing_consent?: boolean | null
          nip?: string | null
          payment_method?: string | null
          payment_term?: string | null
          phone?: string | null
          postal_code?: string | null
          product_discount_percent?: number | null
          provider_id: string
          service_discount_percent?: number | null
          street?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          client_type?: string
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          default_vehicle_id?: string | null
          description?: string | null
          email?: string | null
          first_name?: string | null
          goods_discount_percent?: number | null
          id?: string
          last_name?: string | null
          marketing_consent?: boolean | null
          nip?: string | null
          payment_method?: string | null
          payment_term?: string | null
          phone?: string | null
          postal_code?: string | null
          product_discount_percent?: number | null
          provider_id?: string
          service_discount_percent?: number | null
          street?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_clients_default_vehicle_fk"
            columns: ["default_vehicle_id"]
            isOneToOne: false
            referencedRelation: "workshop_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_clients_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_employees: {
        Row: {
          created_at: string | null
          email: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          provider_id: string
          salary: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          provider_id: string
          salary?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          provider_id?: string
          salary?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_employees_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_mechanics: {
        Row: {
          created_at: string
          first_name: string
          id: string
          is_active: boolean | null
          last_name: string | null
          phone: string | null
          provider_id: string
          specialization: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          provider_id: string
          specialization?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          phone?: string | null
          provider_id?: string
          specialization?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_mechanics_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_order_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          order_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          order_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_order_items: {
        Row: {
          created_at: string | null
          discount_percent: number | null
          id: string
          item_type: string | null
          mechanic: string | null
          name: string
          order_id: string
          quantity: number | null
          sort_order: number | null
          total_gross: number | null
          total_net: number | null
          unit: string | null
          unit_cost_gross: number | null
          unit_cost_net: number | null
          unit_price_gross: number | null
          unit_price_net: number | null
        }
        Insert: {
          created_at?: string | null
          discount_percent?: number | null
          id?: string
          item_type?: string | null
          mechanic?: string | null
          name: string
          order_id: string
          quantity?: number | null
          sort_order?: number | null
          total_gross?: number | null
          total_net?: number | null
          unit?: string | null
          unit_cost_gross?: number | null
          unit_cost_net?: number | null
          unit_price_gross?: number | null
          unit_price_net?: number | null
        }
        Update: {
          created_at?: string | null
          discount_percent?: number | null
          id?: string
          item_type?: string | null
          mechanic?: string | null
          name?: string
          order_id?: string
          quantity?: number | null
          sort_order?: number | null
          total_gross?: number | null
          total_net?: number | null
          unit?: string | null
          unit_cost_gross?: number | null
          unit_cost_net?: number | null
          unit_price_gross?: number | null
          unit_price_net?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_order_photos: {
        Row: {
          created_at: string | null
          id: string
          label: string | null
          order_id: string
          photo_type: string | null
          photo_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          label?: string | null
          order_id: string
          photo_type?: string | null
          photo_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string | null
          order_id?: string
          photo_type?: string | null
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_order_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_order_signatures: {
        Row: {
          created_at: string
          document_type: string
          fingerprint: string | null
          id: string
          ip_address: string | null
          order_id: string
          signature_data: string | null
          signature_method: string | null
          signed_at: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          order_id: string
          signature_data?: string | null
          signature_method?: string | null
          signed_at?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          order_id?: string
          signature_data?: string | null
          signature_method?: string | null
          signed_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_order_signatures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          new_status: string
          old_status: string | null
          order_id: string
          sms_sent: boolean | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          order_id: string
          sms_sent?: boolean | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          order_id?: string
          sms_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_order_statuses: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          provider_id: string
          sends_sms: boolean | null
          sms_template: string | null
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          provider_id: string
          sends_sms?: boolean | null
          sms_template?: string | null
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          provider_id?: string
          sends_sms?: boolean | null
          sms_template?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_order_statuses_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_orders: {
        Row: {
          acceptance_date: string | null
          client_acceptance_confirmed: boolean | null
          client_code: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          damage_description: string | null
          description: string | null
          fuel_level: string | null
          id: string
          internal_notes: string | null
          last_sms_sent_at: string | null
          mechanic_id: string | null
          mechanic_notes: string | null
          mileage: number | null
          order_number: string
          pickup_date: string | null
          post_completion_notes: string | null
          price_mode: string | null
          provider_id: string
          quote_accepted: boolean | null
          ready_notification_sent: boolean | null
          reception_protocol: boolean | null
          registration_document: boolean | null
          return_parts_to_client: boolean | null
          scheduled_end: string | null
          scheduled_start: string | null
          scheduled_station_id: string | null
          sms_sent_count: number | null
          start_date: string | null
          status_id: string | null
          status_name: string | null
          test_drive_consent: boolean | null
          top_up_fluids: boolean | null
          top_up_lights: boolean | null
          total_gross: number | null
          total_net: number | null
          updated_at: string | null
          vehicle_id: string | null
          worker: string | null
          workstation_id: string | null
        }
        Insert: {
          acceptance_date?: string | null
          client_acceptance_confirmed?: boolean | null
          client_code?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          damage_description?: string | null
          description?: string | null
          fuel_level?: string | null
          id?: string
          internal_notes?: string | null
          last_sms_sent_at?: string | null
          mechanic_id?: string | null
          mechanic_notes?: string | null
          mileage?: number | null
          order_number: string
          pickup_date?: string | null
          post_completion_notes?: string | null
          price_mode?: string | null
          provider_id: string
          quote_accepted?: boolean | null
          ready_notification_sent?: boolean | null
          reception_protocol?: boolean | null
          registration_document?: boolean | null
          return_parts_to_client?: boolean | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          scheduled_station_id?: string | null
          sms_sent_count?: number | null
          start_date?: string | null
          status_id?: string | null
          status_name?: string | null
          test_drive_consent?: boolean | null
          top_up_fluids?: boolean | null
          top_up_lights?: boolean | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string | null
          vehicle_id?: string | null
          worker?: string | null
          workstation_id?: string | null
        }
        Update: {
          acceptance_date?: string | null
          client_acceptance_confirmed?: boolean | null
          client_code?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          damage_description?: string | null
          description?: string | null
          fuel_level?: string | null
          id?: string
          internal_notes?: string | null
          last_sms_sent_at?: string | null
          mechanic_id?: string | null
          mechanic_notes?: string | null
          mileage?: number | null
          order_number?: string
          pickup_date?: string | null
          post_completion_notes?: string | null
          price_mode?: string | null
          provider_id?: string
          quote_accepted?: boolean | null
          ready_notification_sent?: boolean | null
          reception_protocol?: boolean | null
          registration_document?: boolean | null
          return_parts_to_client?: boolean | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          scheduled_station_id?: string | null
          sms_sent_count?: number | null
          start_date?: string | null
          status_id?: string | null
          status_name?: string | null
          test_drive_consent?: boolean | null
          top_up_fluids?: boolean | null
          top_up_lights?: boolean | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string | null
          vehicle_id?: string | null
          worker?: string | null
          workstation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "workshop_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_orders_mechanic_id_fkey"
            columns: ["mechanic_id"]
            isOneToOne: false
            referencedRelation: "workshop_mechanics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_orders_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "workshop_order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "workshop_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_orders_workstation_id_fkey"
            columns: ["workstation_id"]
            isOneToOne: false
            referencedRelation: "workshop_workstations"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_parts_integrations: {
        Row: {
          api_password: string | null
          api_username: string | null
          created_at: string
          default_branch_id: string | null
          environment: string
          id: string
          is_enabled: boolean
          last_connection_at: string | null
          last_connection_status: string | null
          provider_id: string
          sales_margin_percent: number
          supplier_code: string
          updated_at: string
        }
        Insert: {
          api_password?: string | null
          api_username?: string | null
          created_at?: string
          default_branch_id?: string | null
          environment?: string
          id?: string
          is_enabled?: boolean
          last_connection_at?: string | null
          last_connection_status?: string | null
          provider_id: string
          sales_margin_percent?: number
          supplier_code: string
          updated_at?: string
        }
        Update: {
          api_password?: string | null
          api_username?: string | null
          created_at?: string
          default_branch_id?: string | null
          environment?: string
          id?: string
          is_enabled?: boolean
          last_connection_at?: string | null
          last_connection_status?: string | null
          provider_id?: string
          sales_margin_percent?: number
          supplier_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_parts_integrations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_parts_order_items: {
        Row: {
          availability: string | null
          created_at: string
          delivery_time: string | null
          id: string
          manufacturer: string | null
          parts_order_id: string
          product_code: string
          product_name: string
          purchase_price_net: number
          quantity: number
          selling_price_gross: number
          supplier_code: string
        }
        Insert: {
          availability?: string | null
          created_at?: string
          delivery_time?: string | null
          id?: string
          manufacturer?: string | null
          parts_order_id: string
          product_code: string
          product_name: string
          purchase_price_net?: number
          quantity?: number
          selling_price_gross?: number
          supplier_code: string
        }
        Update: {
          availability?: string | null
          created_at?: string
          delivery_time?: string | null
          id?: string
          manufacturer?: string | null
          parts_order_id?: string
          product_code?: string
          product_name?: string
          purchase_price_net?: number
          quantity?: number
          selling_price_gross?: number
          supplier_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_parts_order_items_parts_order_id_fkey"
            columns: ["parts_order_id"]
            isOneToOne: false
            referencedRelation: "workshop_parts_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_parts_orders: {
        Row: {
          created_at: string
          id: string
          invoice_number: string | null
          invoice_url: string | null
          order_id: string | null
          provider_id: string
          status: string
          supplier_code: string
          supplier_order_id: string | null
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          order_id?: string | null
          provider_id: string
          status?: string
          supplier_code: string
          supplier_order_id?: string | null
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          order_id?: string | null
          provider_id?: string
          status?: string
          supplier_code?: string
          supplier_order_id?: string | null
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_parts_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "workshop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_parts_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_tire_storage: {
        Row: {
          client_id: string | null
          condition: string | null
          created_at: string
          dot_code: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          photo_urls: string[] | null
          pickup_at: string | null
          production_year: number | null
          provider_id: string
          quantity: number | null
          season: string | null
          storage_number: string | null
          stored_at: string | null
          tire_brand: string | null
          tire_model: string | null
          tire_size: string | null
          tire_type: string | null
          tread_depth_mm: number | null
          vehicle_id: string | null
        }
        Insert: {
          client_id?: string | null
          condition?: string | null
          created_at?: string
          dot_code?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          photo_urls?: string[] | null
          pickup_at?: string | null
          production_year?: number | null
          provider_id: string
          quantity?: number | null
          season?: string | null
          storage_number?: string | null
          stored_at?: string | null
          tire_brand?: string | null
          tire_model?: string | null
          tire_size?: string | null
          tire_type?: string | null
          tread_depth_mm?: number | null
          vehicle_id?: string | null
        }
        Update: {
          client_id?: string | null
          condition?: string | null
          created_at?: string
          dot_code?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          photo_urls?: string[] | null
          pickup_at?: string | null
          production_year?: number | null
          provider_id?: string
          quantity?: number | null
          season?: string | null
          storage_number?: string | null
          stored_at?: string | null
          tire_brand?: string | null
          tire_model?: string | null
          tire_size?: string | null
          tire_type?: string | null
          tread_depth_mm?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_tire_storage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "workshop_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_tire_storage_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_tire_storage_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "workshop_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_vehicles: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string | null
          description: string | null
          engine_capacity_cm3: number | null
          engine_number: string | null
          engine_power_kw: number | null
          first_registration_date: string | null
          fuel_type: string | null
          id: string
          mileage_unit: string | null
          model: string | null
          owner_client_id: string | null
          plate: string | null
          provider_id: string
          updated_at: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          engine_capacity_cm3?: number | null
          engine_number?: string | null
          engine_power_kw?: number | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string
          mileage_unit?: string | null
          model?: string | null
          owner_client_id?: string | null
          plate?: string | null
          provider_id: string
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          engine_capacity_cm3?: number | null
          engine_number?: string | null
          engine_power_kw?: number | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string
          mileage_unit?: string | null
          model?: string | null
          owner_client_id?: string | null
          plate?: string | null
          provider_id?: string
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_vehicles_owner_client_id_fkey"
            columns: ["owner_client_id"]
            isOneToOne: false
            referencedRelation: "workshop_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_vehicles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_workstations: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          provider_id: string
          sort_order: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          provider_id: string
          sort_order?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          provider_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workshop_workstations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_channels: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          project_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          name: string
          project_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_channels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "workspace_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_email_whitelist: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          project_id: string
          role: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          project_id: string
          role?: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "workspace_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_messages: {
        Row: {
          channel_name: string
          content: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_pinned: boolean | null
          message_type: string | null
          project_id: string
          reply_to_id: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          channel_name?: string
          content?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_pinned?: boolean | null
          message_type?: string | null
          project_id: string
          reply_to_id?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          channel_name?: string
          content?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_pinned?: boolean | null
          message_type?: string | null
          project_id?: string
          reply_to_id?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "workspace_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "workspace_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_project_members: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          project_id: string
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          project_id: string
          role?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          project_id?: string
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "workspace_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_projects: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          owner_user_id: string
          status: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          owner_user_id: string
          status?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_task_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          task_id: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workspace_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_task_history: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workspace_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tasks: {
        Row: {
          assigned_name: string | null
          assigned_user_id: string | null
          color: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          order_index: number | null
          parent_task_id: string | null
          priority: string
          project_id: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_name?: string | null
          assigned_user_id?: string | null
          color?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          order_index?: number | null
          parent_task_id?: string | null
          priority?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_name?: string | null
          assigned_user_id?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          order_index?: number | null
          parent_task_id?: string | null
          priority?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "workspace_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "workspace_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_find_user_by_email: {
        Args: { p_email: string }
        Returns: {
          email: string
          id: string
        }[]
      }
      calculate_driver_payout_with_debt: {
        Args: { p_calculated_payout: number; p_driver_id: string }
        Returns: {
          actual_payout: number
          current_debt: number
          debt_payment: number
          remaining_debt: number
        }[]
      }
      can_change_settlement_plan: {
        Args: { _driver_id: string; _user_id: string }
        Returns: Json
      }
      deduct_vehicle_lookup_credit: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      driver_has_vehicle_access: {
        Args: { p_vehicle_id: string }
        Returns: boolean
      }
      generate_random_listing_number: { Args: never; Returns: string }
      get_driver_city_id: { Args: never; Returns: string }
      get_next_auto_invoice_number: {
        Args: { p_fleet_id: string; p_month: number; p_year: number }
        Returns: string
      }
      get_product_avg_cost: { Args: { p_product_id: string }; Returns: number }
      get_product_stock: { Args: { p_product_id: string }; Returns: number }
      get_user_fleet_id: { Args: { _user_id: string }; Returns: string }
      get_user_marketplace_profile_id: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_user_provider_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_voice_cache_stats: {
        Args: never
        Returns: {
          estimated_savings_pln: number
          total_phrases: number
          total_size_bytes: number
        }[]
      }
      get_workspace_member_project_ids: { Args: never; Returns: string[] }
      get_workspace_owned_project_ids: { Args: never; Returns: string[] }
      has_ai_pro_access: {
        Args: { p_entity_id?: string; p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_driver_debt: {
        Args: { p_amount: number; p_driver_id: string }
        Returns: undefined
      }
      init_workshop_default_statuses: {
        Args: { p_provider_id: string }
        Returns: undefined
      }
      is_accounting_admin_for_entity: {
        Args: { p_entity_id: string }
        Returns: boolean
      }
      is_driver_user: { Args: never; Returns: boolean }
      is_entity_owner: { Args: { p_entity_id: string }; Returns: boolean }
      is_plan_available: { Args: { _plan_id: string }; Returns: boolean }
      is_sales_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_sales_user: { Args: { p_user_id: string }; Returns: boolean }
      is_workspace_project_member: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_workspace_project_owner: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      link_auth_user_to_driver: {
        Args: { p_driver_id: string; p_user_id: string }
        Returns: undefined
      }
      my_fuel_transactions: {
        Args: { p_from: string; p_to: string }
        Returns: {
          brand: string | null
          card_number: string
          created_at: string | null
          driver_name: string | null
          fuel_type: string | null
          id: string
          import_batch_id: string | null
          import_date: string | null
          liters: number | null
          period_from: string
          period_to: string
          price_per_liter: number | null
          total_amount: number
          transaction_date: string
          transaction_time: string
          vehicle_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "fuel_transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "fleet_settlement"
        | "fleet_rental"
        | "driver"
        | "marketplace_user"
        | "real_estate_admin"
        | "real_estate_agent"
        | "accounting_admin"
        | "accountant"
        | "sales_admin"
        | "sales_rep"
        | "service_provider"
      user_role_type: "kierowca" | "partner" | "pracownik" | "admin"
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
      app_role: [
        "admin",
        "fleet_settlement",
        "fleet_rental",
        "driver",
        "marketplace_user",
        "real_estate_admin",
        "real_estate_agent",
        "accounting_admin",
        "accountant",
        "sales_admin",
        "sales_rep",
        "service_provider",
      ],
      user_role_type: ["kierowca", "partner", "pracownik", "admin"],
    },
  },
} as const
