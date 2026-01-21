export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          display_name: string
          jersey_number: number | null
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name: string
          jersey_number?: number | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string
          jersey_number?: number | null
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      events: {
        Row: {
          id: string
          title: string
          description: string | null
          location: string
          start_time: string
          end_time: string
          max_participants: number | null
          participation_fee: number
          guest_count: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          location: string
          start_time: string
          end_time: string
          max_participants?: number | null
          participation_fee?: number
          guest_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          location?: string
          start_time?: string
          end_time?: string
          max_participants?: number | null
          participation_fee?: number
          guest_count?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      attendances: {
        Row: {
          id: string
          event_id: string
          user_id: string
          status: 'attending' | 'not_attending' | 'undecided'
          comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          status?: 'attending' | 'not_attending' | 'undecided'
          comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          user_id?: string
          status?: 'attending' | 'not_attending' | 'undecided'
          comment?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          event_id: string | null
          notification_type: string
          sent_at: string
          status: string
          error_message: string | null
        }
        Insert: {
          id?: string
          event_id?: string | null
          notification_type: string
          sent_at?: string
          status?: string
          error_message?: string | null
        }
        Update: {
          id?: string
          event_id?: string | null
          notification_type?: string
          sent_at?: string
          status?: string
          error_message?: string | null
        }
      }
    }
    Views: {
      event_details: {
        Row: {
          id: string
          title: string
          description: string | null
          location: string
          start_time: string
          end_time: string
          max_participants: number | null
          participation_fee: number
          guest_count: number
          created_by: string | null
          created_at: string
          updated_at: string
          attending_count: number
          not_attending_count: number
          undecided_count: number
          total_participants: number
        }
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_status: 'attending' | 'not_attending' | 'undecided'
    }
  }
}
