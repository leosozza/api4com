import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Company, CompanyMember } from '@/types/api4com';

export function useCompany() {
  const queryClient = useQueryClient();

  const { data: companies, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Company[];
    },
  });

  const { data: currentCompany, isLoading: isLoadingCurrentCompany } = useQuery({
    queryKey: ['current-company'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return null;

      const { data: company, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', membership.company_id)
        .maybeSingle();

      if (error) throw error;
      return company ? { ...company, role: membership.role } as Company & { role: string } : null;
    },
  });

  const createCompany = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Create company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({ name })
        .select()
        .single();

      if (companyError) throw companyError;

      // Add user as admin
      const { error: memberError } = await supabase
        .from('company_members')
        .insert({
          company_id: company.id,
          user_id: user.id,
          role: 'admin',
        });

      if (memberError) throw memberError;

      return company as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['current-company'] });
    },
  });

  return {
    companies,
    currentCompany,
    isLoading: isLoadingCompanies || isLoadingCurrentCompany,
    createCompany,
  };
}
