
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "bookings": {
                  Row: {
                    "created_at": string,"date": string,"grad_id": string,"grad_ok": boolean,"id": string,"note": string,"period": number,"reason": string | null,"status": Database["public"]['Enums']["booking_status"],"teacher_id": string,"teacher_ok": boolean,"undergrad_id": string,"updated_at": string,"booking_is_upcoming": boolean | null
                  }
                  ComputedFields: "booking_is_upcoming"
                  Insert: {
                    "created_at"?: string,"date": string,"grad_id": string,"grad_ok"?: boolean,"id"?: string,"note"?: string,"period": number,"reason"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"teacher_id": string,"teacher_ok"?: boolean,"undergrad_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"grad_id"?: string,"grad_ok"?: boolean,"id"?: string,"note"?: string,"period"?: number,"reason"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"teacher_id"?: string,"teacher_ok"?: boolean,"undergrad_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_grad_id_fkey"
      columns: ["grad_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_period_fkey"
      columns: ["period"]
isOneToOne: false
      referencedRelation: "periods"
      referencedColumns: ["period"]
    },{
      foreignKeyName: "bookings_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_undergrad_id_fkey"
      columns: ["undergrad_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"duty_leads": {
                  Row: {
                    "period": number,"semester_id": number,"user_id": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "period": number,"semester_id": number,"user_id": string,"weekday": number
                  }
                  Update: {
                    "period"?: number,"semester_id"?: number,"user_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "duty_leads_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duty_leads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"no_class_days": {
                  Row: {
                    "date": string,"note": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date": string,"note"?: string
                  }
                  Update: {
                    "date"?: string,"note"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "booking_id": string,"created_at": string,"emailed_at": string | null,"id": number,"read_at": string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"created_at"?: string,"emailed_at"?: string | null,"id"?: never,"read_at"?: string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "booking_id"?: string,"created_at"?: string,"emailed_at"?: string | null,"id"?: never,"read_at"?: string | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"periods": {
                  Row: {
                    "end_time": string,"label": string,"period": number,"start_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "end_time": string,"label": string,"period": number,"start_time": string
                  }
                  Update: {
                    "end_time"?: string,"label"?: string,"period"?: number,"start_time"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string,"id": string,"is_admin": boolean,"mentor_id": string | null,"must_change_password": boolean,"notify_email": string | null,"role": Database["public"]['Enums']["user_role"] | null,"status": Database["public"]['Enums']["account_status"],"student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"email": string,"id": string,"is_admin"?: boolean,"mentor_id"?: string | null,"must_change_password"?: boolean,"notify_email"?: string | null,"role"?: Database["public"]['Enums']["user_role"] | null,"status"?: Database["public"]['Enums']["account_status"],"student_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string,"id"?: string,"is_admin"?: boolean,"mentor_id"?: string | null,"must_change_password"?: boolean,"notify_email"?: string | null,"role"?: Database["public"]['Enums']["user_role"] | null,"status"?: Database["public"]['Enums']["account_status"],"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_mentor_id_fkey"
      columns: ["mentor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"semesters": {
                  Row: {
                    "end_date": string,"id": number,"is_current": boolean,"name": string,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "end_date": string,"id"?: never,"is_current"?: boolean,"name": string,"start_date": string
                  }
                  Update: {
                    "end_date"?: string,"id"?: never,"is_current"?: boolean,"name"?: string,"start_date"?: string
                  }
                  Relationships: [
                    
                  ]
                },"slot_exceptions": {
                  Row: {
                    "date": string,"id": number,"kind": string,"period": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date": string,"id"?: never,"kind"?: string,"period"?: number | null,"user_id": string
                  }
                  Update: {
                    "date"?: string,"id"?: never,"kind"?: string,"period"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slot_exceptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"weekly_slots": {
                  Row: {
                    "period": number,"semester_id": number,"user_id": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "period": number,"semester_id": number,"user_id": string,"weekday": number
                  }
                  Update: {
                    "period"?: number,"semester_id"?: number,"user_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "weekly_slots_semester_id_fkey"
      columns: ["semester_id"]
isOneToOne: false
      referencedRelation: "semesters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "weekly_slots_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_exception":
{ Args: { "p_confirm"?: boolean,"p_date": string,"p_period": number }; Returns: Json
                           },
"add_no_class_day":
{ Args: { "p_confirm"?: boolean,"p_date": string,"p_note": string }; Returns: Json
                           },
"admin_reset_flag":
{ Args: { "p_user": string }; Returns: undefined
                           },
"admin_setup_member":
{ Args: { "p_display_name": string,"p_is_admin": boolean,"p_mentor": string,"p_notify_email": string,"p_role": Database["public"]['Enums']["user_role"],"p_student_id": string,"p_user": string }; Returns: undefined
                           },
"available_slots":
{ Args: Record<PropertyKey, never>; Returns: {
              "date": string,"period": number
            }[]
                           },
"booking_is_upcoming":
{ Args: { "b": Omit<Database["public"]['Tables']["bookings"]['Row'], Database["public"]['Tables']["bookings"]['ComputedFields']> }; Returns: boolean
                           },
"cancel_booking":
{ Args: { "p_booking": string,"p_reason"?: string }; Returns: undefined
                           },
"cancel_bookings_internal":
{ Args: { "p_ids": (string)[],"p_reason": string }; Returns: undefined
                           },
"change_affected_json":
{ Args: { "p_ids": (string)[] }; Returns: Json
                           },
"clear_day_slot":
{ Args: { "p_confirm"?: boolean,"p_date": string,"p_period": number }; Returns: Json
                           },
"create_booking":
{ Args: { "p_date": string,"p_note"?: string,"p_period": number }; Returns: string
                           },
"current_semester":
{ Args: Record<PropertyKey, never>; Returns: {
              "end_date": string,
"id": number,
"is_current": boolean,
"name": string,
"start_date": string
            }
                          SetofOptions: {
        from: "*"
        to: "semesters"
        isOneToOne: true
        isSetofReturn: false
      } },
"day_slot_check":
{ Args: { "p_date": string,"p_period": number }; Returns: {
              "end_date": string,
"id": number,
"is_current": boolean,
"name": string,
"start_date": string
            }
                          SetofOptions: {
        from: "*"
        to: "semesters"
        isOneToOne: true
        isSetofReturn: false
      } },
"expire_pending_bookings":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"is_active_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_active_teacher":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_present":
{ Args: { "p_date": string,"p_period": number,"p_user": string }; Returns: boolean
                           },
"is_teacher_or_grad":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (number)[] }; Returns: undefined
                           },
"password_changed":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"public_board":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "date": string,"display_name": string,"is_lead": boolean,"is_teacher": boolean,"period": number
            }[]
                           },
"public_periods":
{ Args: Record<PropertyKey, never>; Returns: {
              "end_time": string,"label": string,"period": number,"start_time": string
            }[]
                           },
"remove_exception":
{ Args: { "p_date": string,"p_period": number }; Returns: undefined
                           },
"remove_no_class_day":
{ Args: { "p_date": string }; Returns: undefined
                           },
"respond_booking":
{ Args: { "p_accept": boolean,"p_booking": string,"p_reason"?: string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"roster":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "date": string,"period": number,"user_id": string
            }[]
                           },
"set_account_status":
{ Args: { "p_confirm"?: boolean,"p_status": Database["public"]['Enums']["account_status"],"p_user": string }; Returns: Json
                           },
"set_admin":
{ Args: { "p_is_admin": boolean,"p_user": string }; Returns: undefined
                           },
"set_day_slot":
{ Args: { "p_confirm"?: boolean,"p_date": string,"p_on": boolean,"p_period": number }; Returns: Json
                           },
"set_display_name":
{ Args: { "p_name": string,"p_user": string }; Returns: undefined
                           },
"set_duty_lead":
{ Args: { "p_period": number,"p_user": string,"p_weekday": number }; Returns: undefined
                           },
"set_mentor":
{ Args: { "p_confirm"?: boolean,"p_grad": string,"p_undergrad": string }; Returns: Json
                           },
"set_notify_email":
{ Args: { "p_email": string,"p_user": string }; Returns: undefined
                           },
"set_weekly_slot":
{ Args: { "p_confirm"?: boolean,"p_date"?: string,"p_on": boolean,"p_period": number,"p_weekday": number }; Returns: Json
                           },
"taipei_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"taipei_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"the_teacher":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"uncovered_days":
{ Args: { "p_from": string,"p_to": string }; Returns: string[]
                           }
          }
          Enums: {
            "account_status": "pending"|"active"|"disabled","booking_status": "pending"|"confirmed"|"rejected"|"cancelled"|"expired","notification_type": "booking_requested"|"booking_confirmed"|"booking_rejected"|"booking_cancelled"|"booking_expired","user_role": "teacher"|"grad"|"undergrad"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["pending", "active", "disabled"],"booking_status": ["pending", "confirmed", "rejected", "cancelled", "expired"],"notification_type": ["booking_requested", "booking_confirmed", "booking_rejected", "booking_cancelled", "booking_expired"],"user_role": ["teacher", "grad", "undergrad"]
          }
        }
} as const
