-- Add columns to api4com_credentials for webhook configuration
ALTER TABLE public.api4com_credentials 
ADD COLUMN IF NOT EXISTS api4com_domain text,
ADD COLUMN IF NOT EXISTS webhook_configured boolean DEFAULT false;