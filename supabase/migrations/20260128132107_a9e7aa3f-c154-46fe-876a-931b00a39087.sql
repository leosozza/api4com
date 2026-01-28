-- Companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company members with roles
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Api4Com credentials (encrypted tokens stored as text - will be encrypted by edge functions)
CREATE TABLE public.api4com_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  api_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitrix24 credentials
CREATE TABLE public.bitrix24_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  domain TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  webhook_url TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User mappings (Api4Com extension -> Bitrix user)
CREATE TABLE public.user_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  api4com_extension TEXT NOT NULL,
  bitrix24_user_id TEXT NOT NULL,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, api4com_extension)
);

-- External phone lines
CREATE TABLE public.external_phone_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  line_number TEXT NOT NULL,
  line_name TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, line_number)
);

-- Call logs
CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_mapping_id UUID REFERENCES public.user_mappings(id),
  external_line_id UUID REFERENCES public.external_phone_lines(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ringing', 'answered', 'missed', 'busy', 'failed', 'completed')),
  duration_seconds INTEGER DEFAULT 0,
  recording_url TEXT,
  bitrix_call_id TEXT,
  api4com_call_id TEXT,
  caller_name TEXT,
  call_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  call_ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api4com_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitrix24_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_phone_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is company admin
CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- Helper function: Check if user is company member
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
  )
$$;

-- RLS Policies for companies
CREATE POLICY "Members can view their company"
  ON public.companies FOR SELECT
  USING (public.is_company_member(id));

CREATE POLICY "Admins can update their company"
  ON public.companies FOR UPDATE
  USING (public.is_company_admin(id));

CREATE POLICY "Authenticated users can create companies"
  ON public.companies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for company_members
CREATE POLICY "Members can view company membership"
  ON public.company_members FOR SELECT
  USING (public.is_company_member(company_id) OR user_id = auth.uid());

CREATE POLICY "Admins can manage members"
  ON public.company_members FOR INSERT
  WITH CHECK (public.is_company_admin(company_id) OR (
    -- Allow first member to be admin when creating company
    NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = company_members.company_id)
    AND role = 'admin'
    AND user_id = auth.uid()
  ));

CREATE POLICY "Admins can update members"
  ON public.company_members FOR UPDATE
  USING (public.is_company_admin(company_id) AND user_id != auth.uid());

CREATE POLICY "Admins can delete members"
  ON public.company_members FOR DELETE
  USING (public.is_company_admin(company_id) AND user_id != auth.uid());

-- RLS Policies for api4com_credentials
CREATE POLICY "Admins can view api4com credentials"
  ON public.api4com_credentials FOR SELECT
  USING (public.is_company_admin(company_id));

CREATE POLICY "Admins can manage api4com credentials"
  ON public.api4com_credentials FOR ALL
  USING (public.is_company_admin(company_id));

-- RLS Policies for bitrix24_credentials
CREATE POLICY "Admins can view bitrix24 credentials"
  ON public.bitrix24_credentials FOR SELECT
  USING (public.is_company_admin(company_id));

CREATE POLICY "Admins can manage bitrix24 credentials"
  ON public.bitrix24_credentials FOR ALL
  USING (public.is_company_admin(company_id));

-- RLS Policies for user_mappings
CREATE POLICY "Members can view user mappings"
  ON public.user_mappings FOR SELECT
  USING (public.is_company_member(company_id));

CREATE POLICY "Admins can manage user mappings"
  ON public.user_mappings FOR ALL
  USING (public.is_company_admin(company_id));

-- RLS Policies for external_phone_lines
CREATE POLICY "Members can view external lines"
  ON public.external_phone_lines FOR SELECT
  USING (public.is_company_member(company_id));

CREATE POLICY "Admins can manage external lines"
  ON public.external_phone_lines FOR ALL
  USING (public.is_company_admin(company_id));

-- RLS Policies for call_logs
CREATE POLICY "Members can view call logs"
  ON public.call_logs FOR SELECT
  USING (public.is_company_member(company_id));

CREATE POLICY "System can insert call logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (public.is_company_member(company_id));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api4com_credentials_updated_at
  BEFORE UPDATE ON public.api4com_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bitrix24_credentials_updated_at
  BEFORE UPDATE ON public.bitrix24_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_mappings_updated_at
  BEFORE UPDATE ON public.user_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_external_phone_lines_updated_at
  BEFORE UPDATE ON public.external_phone_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX idx_call_logs_company_id ON public.call_logs(company_id);
CREATE INDEX idx_call_logs_call_started_at ON public.call_logs(call_started_at);
CREATE INDEX idx_user_mappings_company_id ON public.user_mappings(company_id);