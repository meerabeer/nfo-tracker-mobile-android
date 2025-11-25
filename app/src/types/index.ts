// User and Authentication Types
export type UserRole = 'NFO' | 'Manager';

export interface NFOUser {
  username: string;
  full_name: string;
  home_location: string;
  is_active: boolean;
}

export interface Manager {
  username: string;
  full_name: string;
  area: string;
}

export interface AuthState {
  user: NFOUser | Manager | null;
  role: UserRole | null;
  isLoading: boolean;
  error: string | null;
}

// NFO Status and Activity Types
export type NFOStatusType = 'free' | 'busy';

export interface NFOStatus {
  username: string;
  logged_in: boolean;
  on_shift: boolean;
  status: NFOStatusType;
  activity: string;
  site_id: string | null;
  work_order_id: string | null;
  lat: number | null;
  lng: number | null;
  last_active_at: string;
  last_active_source: string;
  created_at: string;
  updated_at: string;
}

// Site Master Type
export interface SiteMaster {
  site_id: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  location_type: string;
}

// ETA Response Type
export interface ETAResponse {
  distance_km: number;
  duration_min: number;
}

// Location Type
export interface LocationCoordinates {
  lat: number;
  lng: number;
}

// Debug/Dashboard Info
export interface DebugInfo {
  backgroundTaskRegistered: boolean;
  lastGpsLocation: LocationCoordinates | null;
  lastGpsUpdateTime: string | null;
  lastSupabaseUpdate: string | null;
  lastSupabaseError: string | null;
}
