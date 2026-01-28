// Types for Api4Com Bitrix24 Connector

export interface Company {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: 'admin' | 'member';
  created_at: string;
}

export interface Api4ComCredentials {
  id: string;
  company_id: string;
  api_token: string;
  created_at: string;
  updated_at: string;
}

export interface Bitrix24Credentials {
  id: string;
  company_id: string;
  domain: string;
  access_token: string;
  refresh_token?: string;
  webhook_url?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserMapping {
  id: string;
  company_id: string;
  api4com_extension: string;
  bitrix24_user_id: string;
  user_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalPhoneLine {
  id: string;
  company_id: string;
  line_number: string;
  line_name?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  company_id: string;
  user_mapping_id?: string;
  external_line_id?: string;
  direction: 'inbound' | 'outbound';
  phone_number: string;
  status: 'ringing' | 'answered' | 'missed' | 'busy' | 'failed' | 'completed';
  duration_seconds: number;
  recording_url?: string;
  bitrix_call_id?: string;
  api4com_call_id?: string;
  caller_name?: string;
  call_started_at: string;
  call_ended_at?: string;
  created_at: string;
}

export interface CallMetrics {
  total_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  answered_calls: number;
  missed_calls: number;
  total_duration: number;
  average_duration: number;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}
