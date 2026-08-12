import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Company } from '@/types/api4com';
import { useBitrix } from './useBitrix';

// Helper to ensure session exists before critical operations
async function ensureSessionForOperation(): Promise<string> {
  console.log('[useCompany] Ensuring session for operation...');
  
  // First attempt: check existing session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.access_token) {
    console.log('[useCompany] Session found:', session.user.id);
    return session.access_token;
  }
  
  console.log('[useCompany] No session, attempting anonymous sign-in...');
  
  // Second attempt: sign in anonymously
  const { data, error } = await supabase.auth.signInAnonymously();
  
  if (error) {
    console.error('[useCompany] Anonymous sign-in failed:', error);
    throw new Error(
      'Não foi possível estabelecer uma sessão. ' +
      'Isso pode acontecer em ambientes de iframe com cookies de terceiros bloqueados. ' +
      'Tente recarregar a página ou abrir em uma nova aba.'
    );
  }
  
  if (!data.session?.access_token) {
    throw new Error('Sessão criada mas sem token de acesso');
  }
  
  console.log('[useCompany] Anonymous session created:', data.user?.id);
  return data.session.access_token;
}

export function useCompany(bitrixMemberId?: string | null) {
  const queryClient = useQueryClient();
  const { isInBitrix, linkedCompany, companyId: bitrixCompanyId } = useBitrix();

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
    queryKey: ['current-company', bitrixMemberId, bitrixCompanyId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // PRIORITY 1: If we're in Bitrix and have a linked company from BitrixContext, use it
      // This ensures we always use the correct company based on Bitrix member_id
      if (isInBitrix && linkedCompany && bitrixCompanyId) {
        console.log('[useCompany] Using Bitrix-linked company:', bitrixCompanyId);
        
        const { data: company, error } = await supabase
          .from('companies')
          .select('*')
          .eq('id', bitrixCompanyId)
          .maybeSingle();

        if (error) throw error;
        if (company) {
          return { ...company, role: linkedCompany.role } as Company & { role: string };
        }
      }

      // Inside Bitrix with a resolved portal company, never fall back to a manual
      // membership - that is what used to surface the wrong company.
      if (isInBitrix && bitrixCompanyId) {
        console.log('[useCompany] In Bitrix with portal company, skipping membership fallback');
        return null;
      }

      // PRIORITY 2: Find by company_members (for non-Bitrix mode or fallback)
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id, role')
        .eq('user_id', user.id)
        .maybeSingle();


      if (membership) {
        const { data: company, error } = await supabase
          .from('companies')
          .select('*')
          .eq('id', membership.company_id)
          .maybeSingle();

        if (error) throw error;
        if (company) {
          return { ...company, role: membership.role } as Company & { role: string };
        }
      }

      // If no membership but we have bitrix_member_id, company exists but user not yet linked
      // This shouldn't happen after the link-user-to-company call, but handle gracefully
      return null;
    },
  });

  const createCompany = useMutation({
    mutationFn: async (name: string) => {
      // Ensure we have a valid session with retry logic
      await ensureSessionForOperation();

      console.log('[useCompany] Calling create-company function...');
      
      // Use supabase.functions.invoke instead of fetch for better iframe compatibility
      const { data, error } = await supabase.functions.invoke('create-company', {
        body: { name },
      });

      if (error) {
        console.error('[useCompany] Edge function error:', error);
        throw new Error(error.message || 'Falha ao criar empresa');
      }

      if (!data?.success) {
        console.error('[useCompany] Function returned error:', data?.error);
        throw new Error(data?.error || 'Falha ao criar empresa');
      }

      console.log('[useCompany] Company created successfully:', data.company?.id);
      return data.company as Company;
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
