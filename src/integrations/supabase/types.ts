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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      area_members: {
        Row: {
          area_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_members_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          sort_order: number
          tabs: Json
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          sort_order?: number
          tabs?: Json
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          tabs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_username: string | null
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_username?: string | null
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_username?: string | null
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      auth_login_attempts: {
        Row: {
          failed_count: number
          last_attempt: string
          locked_until: string | null
          username_lower: string
        }
        Insert: {
          failed_count?: number
          last_attempt?: string
          locked_until?: string | null
          username_lower: string
        }
        Update: {
          failed_count?: number
          last_attempt?: string
          locked_until?: string | null
          username_lower?: string
        }
        Relationships: []
      }
      checklist_checks: {
        Row: {
          checked_on: string
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          checked_on?: string
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          checked_on?: string
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_checks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_completions: {
        Row: {
          completed_on: string
          created_at: string
          id: string
          user_id: string
          username: string
        }
        Insert: {
          completed_on?: string
          created_at?: string
          id?: string
          user_id: string
          username: string
        }
        Update: {
          completed_on?: string
          created_at?: string
          id?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          content: string
          created_at: string
          id: string
          location: string | null
          parent_id: string | null
          pieces: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          location?: string | null
          parent_id?: string | null
          pieces?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          location?: string | null
          parent_id?: string | null
          pieces?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_routes: {
        Row: {
          hidden_at: string
          hidden_by: string | null
          path: string
        }
        Insert: {
          hidden_at?: string
          hidden_by?: string | null
          path: string
        }
        Update: {
          hidden_at?: string
          hidden_by?: string | null
          path?: string
        }
        Relationships: []
      }
      intervention_types: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intervention_types_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "intervention_types"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          created_at: string
          created_by: string | null
          extra_data: Json
          fuori_sede: boolean
          id: string
          intervention_date: string
          intervention_type: string
          invio_in_ppi: boolean
          notes: string | null
          operator_username: string | null
          patient_id: string | null
          vitals_timeline: Json
          vs_fc: number | null
          vs_fr: number | null
          vs_glicemia: number | null
          vs_pad: number | null
          vs_pas: number | null
          vs_spo2: number | null
          vs_temp: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          extra_data?: Json
          fuori_sede?: boolean
          id?: string
          intervention_date?: string
          intervention_type: string
          invio_in_ppi?: boolean
          notes?: string | null
          operator_username?: string | null
          patient_id?: string | null
          vitals_timeline?: Json
          vs_fc?: number | null
          vs_fr?: number | null
          vs_glicemia?: number | null
          vs_pad?: number | null
          vs_pas?: number | null
          vs_spo2?: number | null
          vs_temp?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          extra_data?: Json
          fuori_sede?: boolean
          id?: string
          intervention_date?: string
          intervention_type?: string
          invio_in_ppi?: boolean
          notes?: string | null
          operator_username?: string | null
          patient_id?: string | null
          vitals_timeline?: Json
          vs_fc?: number | null
          vs_fr?: number | null
          vs_glicemia?: number | null
          vs_pad?: number | null
          vs_pas?: number | null
          vs_spo2?: number | null
          vs_temp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interventions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          location: string
          name: string
          notes: string | null
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          location?: string
          name: string
          notes?: string | null
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          location?: string
          name?: string
          notes?: string | null
          quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          browser: boolean
          kinds: Json
          sound: boolean
          toast: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          browser?: boolean
          kinds?: Json
          sound?: boolean
          toast?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          browser?: boolean
          kinds?: Json
          sound?: boolean
          toast?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          acknowledged_at: string | null
          body: string | null
          broadcast_id: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          requires_ack: boolean
          title: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          requires_ack?: boolean
          title: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          requires_ack?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      office_service_types: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_service_types_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "office_service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      office_services: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          patient_full_name: string | null
          patient_initials: string | null
          performed_at: string
          service_name: string
          service_other: string | null
          service_type_id: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          patient_full_name?: string | null
          patient_initials?: string | null
          performed_at?: string
          service_name: string
          service_other?: string | null
          service_type_id?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          patient_full_name?: string | null
          patient_initials?: string | null
          performed_at?: string
          service_name?: string
          service_other?: string | null
          service_type_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "office_service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_checkins: {
        Row: {
          checkin_at: string
          checkin_date: string
          created_at: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          checkin_at?: string
          checkin_date?: string
          created_at?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          checkin_at?: string
          checkin_date?: string
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          created_at: string
          created_by: string | null
          extra_data: Json
          first_name: string
          id: string
          last_name: string
          notes: string | null
          notes_color: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          extra_data?: Json
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          notes_color?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          extra_data?: Json
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          notes_color?: string | null
        }
        Relationships: []
      }
      procedures: {
        Row: {
          content: string
          created_at: string
          id: string
          intervention_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          intervention_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          intervention_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_intervention_type_id_fkey"
            columns: ["intervention_type_id"]
            isOneToOne: true
            referencedRelation: "intervention_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          force_logout_at: string | null
          guide_seen: boolean
          id: string
          job_title: string | null
          must_change_password: boolean
          phone: string | null
          phone_prompted: boolean
          show_in_contacts: boolean
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          suspended_until: string | null
          username: string
        }
        Insert: {
          created_at?: string
          force_logout_at?: string | null
          guide_seen?: boolean
          id: string
          job_title?: string | null
          must_change_password?: boolean
          phone?: string | null
          phone_prompted?: boolean
          show_in_contacts?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          username: string
        }
        Update: {
          created_at?: string
          force_logout_at?: string | null
          guide_seen?: boolean
          id?: string
          job_title?: string | null
          must_change_password?: boolean
          phone?: string | null
          phone_prompted?: boolean
          show_in_contacts?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          username?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          problem: string
          report_date: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
          urgency: Database["public"]["Enums"]["report_urgency"]
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          problem: string
          report_date?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["report_urgency"]
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          problem?: string
          report_date?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["report_urgency"]
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      secondary_transports: {
        Row: {
          adi_route_id: string | null
          annullato: boolean
          arrival_hospital_id: string | null
          arrival_text: string | null
          arrival_time: string | null
          created_at: string
          departure_hospital_id: string | null
          departure_text: string | null
          departure_time: string | null
          first_name: string | null
          first_name_2: string | null
          id: string
          is_round_trip: boolean
          kilometers: number | null
          kind: Database["public"]["Enums"]["transport_kind"]
          last_name: string | null
          last_name_2: string | null
          needs_review: boolean
          notes: string | null
          nurse_hourly: number | null
          nurse_hours: number | null
          price: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          sosta_hours: number | null
          sosta_price: number | null
          transport_date: string
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          adi_route_id?: string | null
          annullato?: boolean
          arrival_hospital_id?: string | null
          arrival_text?: string | null
          arrival_time?: string | null
          created_at?: string
          departure_hospital_id?: string | null
          departure_text?: string | null
          departure_time?: string | null
          first_name?: string | null
          first_name_2?: string | null
          id?: string
          is_round_trip?: boolean
          kilometers?: number | null
          kind: Database["public"]["Enums"]["transport_kind"]
          last_name?: string | null
          last_name_2?: string | null
          needs_review?: boolean
          notes?: string | null
          nurse_hourly?: number | null
          nurse_hours?: number | null
          price?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sosta_hours?: number | null
          sosta_price?: number | null
          transport_date?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          adi_route_id?: string | null
          annullato?: boolean
          arrival_hospital_id?: string | null
          arrival_text?: string | null
          arrival_time?: string | null
          created_at?: string
          departure_hospital_id?: string | null
          departure_text?: string | null
          departure_time?: string | null
          first_name?: string | null
          first_name_2?: string | null
          id?: string
          is_round_trip?: boolean
          kilometers?: number | null
          kind?: Database["public"]["Enums"]["transport_kind"]
          last_name?: string | null
          last_name_2?: string | null
          needs_review?: boolean
          notes?: string | null
          nurse_hourly?: number | null
          nurse_hours?: number | null
          price?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sosta_hours?: number | null
          sosta_price?: number | null
          transport_date?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "secondary_transports_adi_route_id_fkey"
            columns: ["adi_route_id"]
            isOneToOne: false
            referencedRelation: "transport_adi_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secondary_transports_arrival_hospital_id_fkey"
            columns: ["arrival_hospital_id"]
            isOneToOne: false
            referencedRelation: "transport_hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secondary_transports_departure_hospital_id_fkey"
            columns: ["departure_hospital_id"]
            isOneToOne: false
            referencedRelation: "transport_hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      site_customizations: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      sport_service_files: {
        Row: {
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          path: string
          service_id: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          path: string
          service_id: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          path?: string
          service_id?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sport_service_files_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "sport_services"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_services: {
        Row: {
          als_backpack: boolean
          assets: Json
          color: string
          created_at: string
          created_by: string | null
          crew_changes: Json
          doctor_name: string | null
          done: boolean
          end_time: string | null
          event_date: string
          event_name: string
          id: string
          location: string | null
          meal_voucher: boolean
          notes: string | null
          paid: boolean
          start_time: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          als_backpack?: boolean
          assets?: Json
          color?: string
          created_at?: string
          created_by?: string | null
          crew_changes?: Json
          doctor_name?: string | null
          done?: boolean
          end_time?: string | null
          event_date: string
          event_name: string
          id?: string
          location?: string | null
          meal_voucher?: boolean
          notes?: string | null
          paid?: boolean
          start_time?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          als_backpack?: boolean
          assets?: Json
          color?: string
          created_at?: string
          created_by?: string | null
          crew_changes?: Json
          doctor_name?: string | null
          done?: boolean
          end_time?: string | null
          event_date?: string
          event_name?: string
          id?: string
          location?: string | null
          meal_voucher?: boolean
          notes?: string | null
          paid?: boolean
          start_time?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sport_vehicles: {
        Row: {
          code: string
          created_at: string
          id: string
          kind: string
          label: string | null
          oos_from: string | null
          oos_reason: string | null
          oos_to: string | null
          out_of_service: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          oos_from?: string | null
          oos_reason?: string | null
          oos_to?: string | null
          out_of_service?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          oos_from?: string | null
          oos_reason?: string | null
          oos_to?: string | null
          out_of_service?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      survey_questions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          label: string
          options: Json | null
          position: number
          required: boolean
          survey_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          label: string
          options?: Json | null
          position?: number
          required?: boolean
          survey_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          label?: string
          options?: Json | null
          position?: number
          required?: boolean
          survey_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json
          created_at: string
          id: string
          privacy_consent: boolean
          respondent_name: string | null
          survey_id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          privacy_consent?: boolean
          respondent_name?: string | null
          survey_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          privacy_consent?: boolean
          respondent_name?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          privacy_required: boolean
          privacy_text: string | null
          public_results: boolean
          slug: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          privacy_required?: boolean
          privacy_text?: string | null
          public_results?: boolean
          slug: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          privacy_required?: boolean
          privacy_text?: string | null
          public_results?: boolean
          slug?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transport_adi_routes: {
        Row: {
          alias: string | null
          arrival: string
          created_at: string
          departure: string
          id: string
          kilometers: number
          kilometers_rt: number | null
          price: number
          price_rt: number | null
          updated_at: string
        }
        Insert: {
          alias?: string | null
          arrival: string
          created_at?: string
          departure: string
          id?: string
          kilometers?: number
          kilometers_rt?: number | null
          price?: number
          price_rt?: number | null
          updated_at?: string
        }
        Update: {
          alias?: string | null
          arrival?: string
          created_at?: string
          departure?: string
          id?: string
          kilometers?: number
          kilometers_rt?: number | null
          price?: number
          price_rt?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      transport_hospitals: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      transport_intra_tariffs: {
        Row: {
          arrival_id: string
          created_at: string
          departure_id: string
          id: string
          kilometers: number | null
          price: number
          updated_at: string
        }
        Insert: {
          arrival_id: string
          created_at?: string
          departure_id: string
          id?: string
          kilometers?: number | null
          price: number
          updated_at?: string
        }
        Update: {
          arrival_id?: string
          created_at?: string
          departure_id?: string
          id?: string
          kilometers?: number | null
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_intra_tariffs_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: false
            referencedRelation: "transport_hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_intra_tariffs_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "transport_hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_tariffs: {
        Row: {
          detailed_time: boolean
          id: string
          nurse_hourly: number
          per_km: number
          sosta_hourly: number
          updated_at: string
        }
        Insert: {
          detailed_time?: boolean
          id: string
          nurse_hourly?: number
          per_km?: number
          sosta_hourly?: number
          updated_at?: string
        }
        Update: {
          detailed_time?: boolean
          id?: string
          nurse_hourly?: number
          per_km?: number
          sosta_hourly?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          entity: string
          entity_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_create_interventions: boolean
          can_manage_anagraphics: boolean
          can_manage_sport: boolean
          can_manage_transports: boolean
          can_modify_own_interventions: boolean
          can_view_others_interventions: boolean
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_create_interventions?: boolean
          can_manage_anagraphics?: boolean
          can_manage_sport?: boolean
          can_manage_transports?: boolean
          can_modify_own_interventions?: boolean
          can_view_others_interventions?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_create_interventions?: boolean
          can_manage_anagraphics?: boolean
          can_manage_sport?: boolean
          can_manage_transports?: boolean
          can_modify_own_interventions?: boolean
          can_view_others_interventions?: boolean
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_revoke_all_user_sessions: {
        Args: { _user_id: string }
        Returns: {
          revoked_refresh_tokens: number
          revoked_sessions: number
        }[]
      }
      admin_revoke_session: {
        Args: { _session_id: string }
        Returns: {
          revoked_count: number
          target_user: string
        }[]
      }
      can_grant_office: { Args: { _uid: string }; Returns: boolean }
      cron_auto_force_logout_rome: { Args: never; Returns: undefined }
      get_public_survey_responses: {
        Args: { _slug: string }
        Returns: {
          answers: Json
          created_at: string
          id: string
          privacy_consent: boolean
          respondent_name: string
        }[]
      }
      has_office_access: { Args: { _uid: string }; Returns: boolean }
      has_permission: {
        Args: { _perm: string; _uid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_sport_access: { Args: { _uid: string }; Returns: boolean }
      has_transports_access: { Args: { _uid: string }; Returns: boolean }
      is_area_member: {
        Args: { _area_id: string; _uid: string }
        Returns: boolean
      }
      is_developer: { Args: { _uid: string }; Returns: boolean }
      is_suspended: { Args: { _uid: string }; Returns: boolean }
      list_active_sessions: {
        Args: never
        Returns: {
          created_at: string
          ip: unknown
          not_after: string
          session_id: string
          updated_at: string
          user_agent: string
          user_id: string
          username: string
        }[]
      }
      list_hidden_route_paths: {
        Args: never
        Returns: {
          path: string
        }[]
      }
      list_job_titles: {
        Args: never
        Returns: {
          job_title: string
          username: string
        }[]
      }
      submit_survey_response: {
        Args: {
          _answers: Json
          _name: string
          _privacy_consent: boolean
          _survey_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "developer" | "office"
      report_status: "new" | "in_progress" | "resolved" | "ignored"
      report_urgency: "urgent" | "deferrable" | "not_urgent"
      transport_kind: "intra" | "other" | "nurse"
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
      app_role: ["admin", "user", "developer", "office"],
      report_status: ["new", "in_progress", "resolved", "ignored"],
      report_urgency: ["urgent", "deferrable", "not_urgent"],
      transport_kind: ["intra", "other", "nurse"],
    },
  },
} as const
