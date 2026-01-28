-- Add member_id and client_endpoint columns to bitrix24_credentials
ALTER TABLE public.bitrix24_credentials 
ADD COLUMN IF NOT EXISTS member_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS client_endpoint TEXT;

-- Create index for faster lookups by member_id
CREATE INDEX IF NOT EXISTS idx_bitrix24_credentials_member_id ON public.bitrix24_credentials(member_id);

-- Add member_id column to companies table for direct tenant identification
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS bitrix_member_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_companies_bitrix_member_id ON public.companies(bitrix_member_id);