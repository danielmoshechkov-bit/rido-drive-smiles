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
      driver_app_users: {
        Row: {
          city_id: string | null
          created_at: string | null
          driver_id: string | null
          phone: string | null
          plan_type: string | null
          rodo_accepted_at: string | null
          terms_accepted_at: string | null
          user_id: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          phone?: string | null
          plan_type?: string | null
          rodo_accepted_at?: string | null
          terms_accepted_at?: string | null
          user_id: string
        }
        Update: {
          city_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          phone?: string | null
          plan_type?: string | null
          rodo_accepted_at?: string | null
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
        ]
      }
      driver_communications: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          driver_id: string
          error_message: string | null
          id: string
          metadata: Json | null
          sent_at: string | null
          status: string
          subject: string | null
          type: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          driver_id: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          type: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          driver_id?: string
          error_message?: string | null
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
          billing_method: string | null
          city_id: string
          created_at: string
          email: string | null
          first_name: string | null
          fleet_id: string | null
          fuel_card_number: string | null
          id: string
          last_name: string | null
          phone: string | null
          platform_ids: Json | null
          registration_date: string | null
          updated_at: string
          user_role: Database["public"]["Enums"]["user_role_type"] | null
        }
        Insert: {
          billing_method?: string | null
          city_id: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          fleet_id?: string | null
          fuel_card_number?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          platform_ids?: Json | null
          registration_date?: string | null
          updated_at?: string
          user_role?: Database["public"]["Enums"]["user_role_type"] | null
        }
        Update: {
          billing_method?: string | null
          city_id?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          fleet_id?: string | null
          fuel_card_number?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          platform_ids?: Json | null
          registration_date?: string | null
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
      fleets: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          contact_phone_for_drivers: string | null
          created_at: string | null
          email: string | null
          house_number: string | null
          id: string
          name: string
          nip: string | null
          owner_name: string | null
          owner_phone: string | null
          phone: string | null
          postal_code: string | null
          street: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone_for_drivers?: string | null
          created_at?: string | null
          email?: string | null
          house_number?: string | null
          id?: string
          name: string
          nip?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone_for_drivers?: string | null
          created_at?: string | null
          email?: string | null
          house_number?: string | null
          id?: string
          name?: string
          nip?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          postal_code?: string | null
          street?: string | null
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
          amounts: Json | null
          city_id: string
          commission_amount: number | null
          created_at: string
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
          amounts?: Json | null
          city_id: string
          commission_amount?: number | null
          created_at?: string
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
          amounts?: Json | null
          city_id?: string
          commission_amount?: number | null
          created_at?: string
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
            foreignKeyName: "system_alerts_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
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
          brand: string
          city_id: string | null
          color: string | null
          created_at: string
          fleet_id: string | null
          id: string
          model: string
          odometer: number | null
          owner_name: string | null
          plate: string
          status: string | null
          updated_at: string
          vin: string | null
          weekly_rental_fee: number | null
          year: number | null
        }
        Insert: {
          brand: string
          city_id?: string | null
          color?: string | null
          created_at?: string
          fleet_id?: string | null
          id?: string
          model: string
          odometer?: number | null
          owner_name?: string | null
          plate: string
          status?: string | null
          updated_at?: string
          vin?: string | null
          weekly_rental_fee?: number | null
          year?: number | null
        }
        Update: {
          brand?: string
          city_id?: string | null
          color?: string | null
          created_at?: string
          fleet_id?: string | null
          id?: string
          model?: string
          odometer?: number | null
          owner_name?: string | null
          plate?: string
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
      [_ in never]: never
    }
    Enums: {
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
      user_role_type: ["kierowca", "partner", "pracownik", "admin"],
    },
  },
} as const
