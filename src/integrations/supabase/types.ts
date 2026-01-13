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
      ai_credit_history: {
        Row: {
          created_at: string | null
          credits_used: number
          id: string
          query_summary: string | null
          query_type: string
          user_id: string | null
          was_free: boolean | null
        }
        Insert: {
          created_at?: string | null
          credits_used: number
          id?: string
          query_summary?: string | null
          query_type: string
          user_id?: string | null
          was_free?: boolean | null
        }
        Update: {
          created_at?: string | null
          credits_used?: number
          id?: string
          query_summary?: string | null
          query_type?: string
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
      ai_settings: {
        Row: {
          ai_enabled: boolean | null
          ai_model: string | null
          ai_provider: string | null
          created_at: string | null
          custom_api_key_encrypted: string | null
          guest_daily_limit: number | null
          id: string
          system_prompt: string | null
          updated_at: string | null
          user_monthly_limit: number | null
        }
        Insert: {
          ai_enabled?: boolean | null
          ai_model?: string | null
          ai_provider?: string | null
          created_at?: string | null
          custom_api_key_encrypted?: string | null
          guest_daily_limit?: number | null
          id?: string
          system_prompt?: string | null
          updated_at?: string | null
          user_monthly_limit?: number | null
        }
        Update: {
          ai_enabled?: boolean | null
          ai_model?: string | null
          ai_provider?: string | null
          created_at?: string | null
          custom_api_key_encrypted?: string | null
          guest_daily_limit?: number | null
          id?: string
          system_prompt?: string | null
          updated_at?: string | null
          user_monthly_limit?: number | null
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
      crm_import_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          integration_id: string | null
          log_type: string
          message: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          integration_id?: string | null
          log_type: string
          message: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          integration_id?: string | null
          log_type?: string
          message?: string
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
          billing_method: string | null
          city_id: string
          correspondence_city: string | null
          correspondence_country: string | null
          correspondence_postal_code: string | null
          correspondence_street: string | null
          created_at: string
          email: string | null
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
          billing_method?: string | null
          city_id: string
          correspondence_city?: string | null
          correspondence_country?: string | null
          correspondence_postal_code?: string | null
          correspondence_street?: string | null
          created_at?: string
          email?: string | null
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
          billing_method?: string | null
          city_id?: string
          correspondence_city?: string | null
          correspondence_country?: string | null
          correspondence_postal_code?: string | null
          correspondence_street?: string | null
          created_at?: string
          email?: string | null
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
      fleets: {
        Row: {
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
          name: string
          nip: string | null
          owner_name: string | null
          owner_phone: string | null
          phone: string | null
          postal_code: string | null
          registration_code: string | null
          settlement_frequency_enabled: boolean | null
          street: string | null
          transfer_enabled: boolean | null
          vat_rate: number | null
        }
        Insert: {
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
          name: string
          nip?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_code?: string | null
          settlement_frequency_enabled?: boolean | null
          street?: string | null
          transfer_enabled?: boolean | null
          vat_rate?: number | null
        }
        Update: {
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
          name?: string
          nip?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_code?: string | null
          settlement_frequency_enabled?: boolean | null
          street?: string | null
          transfer_enabled?: boolean | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      fuel_cards: {
        Row: {
          card_number: string
          city_id: string
          created_at: string
          driver_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          card_number: string
          city_id: string
          created_at?: string
          driver_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          card_number?: string
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
          phone: string
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
          phone: string
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
          phone?: string
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
          photos: string[] | null
          price: number
          price_per_sqm: number | null
          price_type: string | null
          property_type: string
          property_unique_id: string | null
          rating: number | null
          rooms: number | null
          status: string | null
          title: string
          total_floors: number | null
          transaction_type: string
          updated_at: string | null
          views: number | null
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
          photos?: string[] | null
          price: number
          price_per_sqm?: number | null
          price_type?: string | null
          property_type: string
          property_unique_id?: string | null
          rating?: number | null
          rooms?: number | null
          status?: string | null
          title: string
          total_floors?: number | null
          transaction_type: string
          updated_at?: string | null
          views?: number | null
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
          photos?: string[] | null
          price?: number
          price_per_sqm?: number | null
          price_type?: string | null
          property_type?: string
          property_unique_id?: string | null
          rating?: number | null
          rooms?: number | null
          status?: string | null
          title?: string
          total_floors?: number | null
          transaction_type?: string
          updated_at?: string | null
          views?: number | null
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
      rental_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          car_condition_rating: number | null
          comment: string | null
          created_at: string | null
          driver_rating: number | null
          id: string
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
          net_amount: number | null
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
          net_amount?: number | null
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
          net_amount?: number | null
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
      vehicle_listings: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          created_by: string
          description: string | null
          fleet_id: string | null
          id: string
          is_available: boolean | null
          listed_at: string | null
          listing_number: string | null
          updated_at: string | null
          vehicle_id: string
          weekly_price: number
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          fleet_id?: string | null
          id?: string
          is_available?: boolean | null
          listed_at?: string | null
          listing_number?: string | null
          updated_at?: string | null
          vehicle_id: string
          weekly_price: number
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          fleet_id?: string | null
          id?: string
          is_available?: boolean | null
          listed_at?: string | null
          listing_number?: string | null
          updated_at?: string | null
          vehicle_id?: string
          weekly_price?: number
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
      vehicle_rentals: {
        Row: {
          created_at: string | null
          driver_id: string
          driver_reviewed: boolean | null
          fleet_id: string
          fleet_reviewed: boolean | null
          id: string
          listing_id: string
          rental_end: string | null
          rental_start: string | null
          status: string | null
          updated_at: string | null
          vehicle_id: string
          weekly_price: number
        }
        Insert: {
          created_at?: string | null
          driver_id: string
          driver_reviewed?: boolean | null
          fleet_id: string
          fleet_reviewed?: boolean | null
          id?: string
          listing_id: string
          rental_end?: string | null
          rental_start?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id: string
          weekly_price: number
        }
        Update: {
          created_at?: string | null
          driver_id?: string
          driver_reviewed?: boolean | null
          fleet_id?: string
          fleet_reviewed?: boolean | null
          id?: string
          listing_id?: string
          rental_end?: string | null
          rental_start?: string | null
          status?: string | null
          updated_at?: string | null
          vehicle_id?: string
          weekly_price?: number
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
          created_at: string
          engine_capacity: number | null
          fleet_id: string | null
          fuel_type: string | null
          id: string
          model: string
          odometer: number | null
          owner_name: string | null
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
          created_at?: string
          engine_capacity?: number | null
          fleet_id?: string | null
          fuel_type?: string | null
          id?: string
          model: string
          odometer?: number | null
          owner_name?: string | null
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
          created_at?: string
          engine_capacity?: number | null
          fleet_id?: string | null
          fuel_type?: string | null
          id?: string
          model?: string
          odometer?: number | null
          owner_name?: string | null
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      driver_has_vehicle_access: {
        Args: { p_vehicle_id: string }
        Returns: boolean
      }
      generate_random_listing_number: { Args: never; Returns: string }
      get_driver_city_id: { Args: never; Returns: string }
      get_user_fleet_id: { Args: { _user_id: string }; Returns: string }
      get_user_marketplace_profile_id: {
        Args: { p_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_driver_user: { Args: never; Returns: boolean }
      is_plan_available: { Args: { _plan_id: string }; Returns: boolean }
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
      ],
      user_role_type: ["kierowca", "partner", "pracownik", "admin"],
    },
  },
} as const
