// Supabase Database Types
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          pregnancy_week: number | null;
          due_date: string | null;
          dietary_restrictions: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          pregnancy_week?: number | null;
          due_date?: string | null;
          dietary_restrictions?: string[] | null;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          pregnancy_week?: number | null;
          due_date?: string | null;
          dietary_restrictions?: string[] | null;
        };
      };
      food_items: {
        Row: {
          id: string;
          name: string;
          portion: string | null;
          has_calcium: boolean;
          has_iron: boolean;
          has_folic_acid: boolean;
          has_protein: boolean;
          has_vitamin_d: boolean | null;
          has_omega3: boolean | null;
          has_fiber: boolean | null;
          has_warnings: boolean;
          warning_message: string | null;
          warning_type: 'unsafe' | 'limit' | 'allergen' | null;
          tags: string[] | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          portion?: string | null;
          has_calcium?: boolean;
          has_iron?: boolean;
          has_folic_acid?: boolean;
          has_protein?: boolean;
          has_vitamin_d?: boolean | null;
          has_omega3?: boolean | null;
          has_fiber?: boolean | null;
          has_warnings?: boolean;
          warning_message?: string | null;
          warning_type?: 'unsafe' | 'limit' | 'allergen' | null;
          tags?: string[] | null;
          description?: string | null;
        };
        Update: {
          name?: string;
          portion?: string | null;
          has_calcium?: boolean;
          has_iron?: boolean;
          has_folic_acid?: boolean;
          has_protein?: boolean;
          has_vitamin_d?: boolean | null;
          has_omega3?: boolean | null;
          has_fiber?: boolean | null;
          has_warnings?: boolean;
          warning_message?: string | null;
          warning_type?: 'unsafe' | 'limit' | 'allergen' | null;
          tags?: string[] | null;
          description?: string | null;
        };
      };
      meals: {
        Row: {
          id: string;
          user_id: string;
          meal_date: string;
          day_of_week: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
          meal_type: 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          meal_date: string;
          day_of_week: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
          meal_type: 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner';
          notes?: string | null;
        };
        Update: {
          meal_date?: string;
          day_of_week?: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
          meal_type?: 'breakfast' | 'snack1' | 'lunch' | 'snack2' | 'dinner';
          notes?: string | null;
        };
      };
      meal_items: {
        Row: {
          id: string;
          meal_id: string;
          food_item_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          food_item_id: string;
          sort_order?: number;
        };
        Update: {
          meal_id?: string;
          food_item_id?: string;
          sort_order?: number;
        };
      };
      weekly_milestones: {
        Row: {
          id: string;
          week_number: number;
          milestone_description: string;
          priority_nutrient: string;
          priority_goal: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          week_number: number;
          milestone_description: string;
          priority_nutrient: string;
          priority_goal: string;
        };
        Update: {
          week_number?: number;
          milestone_description?: string;
          priority_nutrient?: string;
          priority_goal?: string;
        };
      };
    };
  };
};
