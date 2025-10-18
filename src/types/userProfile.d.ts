export interface UserProfile {
  id: number;
  firebase_uid: string;
  email: string;
  display_name?: string;
  photo_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreferences {
  id: number;
  user_id: number;
  interview_difficulty: "easy" | "medium" | "hard";
  interview_duration: number;
  preferred_languages?: string[];
  theme: "light" | "dark";
  created_at: Date;
  updated_at: Date;
}

export interface Resume {
  id: number;
  user_id: number;
  title: string;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  content?: string;
  file_data?: Buffer; // Binary PDF data stored in database
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

// DTOs for creating/updating entities
export interface CreateUserProfileDTO {
  firebase_uid: string;
  email: string;
  display_name?: string;
  photo_url?: string;
}

export interface UpdateUserProfileDTO {
  display_name?: string;
  photo_url?: string;
}

export interface CreateUserPreferencesDTO {
  interview_difficulty?: "easy" | "medium" | "hard";
  interview_duration?: number;
  preferred_languages?: string[];
  theme?: "light" | "dark";
}

export interface UpdateUserPreferencesDTO extends CreateUserPreferencesDTO {}

export interface CreateResumeDTO {
  title: string;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  content?: string;
  file_data?: Buffer; // Binary PDF data
  is_primary?: boolean;
}

export interface UpdateResumeDTO extends Partial<CreateResumeDTO> {}
