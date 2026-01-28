-- Drop the buggy policy
DROP POLICY IF EXISTS "Admins can manage members" ON public.company_members;

-- Create corrected policy that allows:
-- 1. Company admins to add members
-- 2. First user to create themselves as admin of a NEW company (no existing members for that company_id)
CREATE POLICY "Admins can manage members" 
ON public.company_members FOR INSERT
TO authenticated
WITH CHECK (
  is_company_admin(company_id) 
  OR (
    -- Allow first admin creation for a new company
    NOT EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_members.company_id
    )
    AND role = 'admin'
    AND user_id = auth.uid()
  )
);