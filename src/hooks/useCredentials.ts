import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Api4ComCredentials, Bitrix24Credentials } from '@/types/api4com';

export function useCredentials(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: api4comCredentials, isLoading: isLoadingApi4com } = useQuery({
    queryKey: ['api4com-credentials', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('api4com_credentials')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Api4ComCredentials | null;
    },
    enabled: !!companyId,
  });

  const { data: bitrix24Credentials, isLoading: isLoadingBitrix } = useQuery({
    queryKey: ['bitrix24-credentials', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('bitrix24_credentials')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Bitrix24Credentials | null;
    },
    enabled: !!companyId,
  });

  const saveApi4comCredentials = useMutation({
    mutationFn: async (apiToken: string) => {
      if (!companyId) throw new Error('Company not found');

      const { data: existing } = await supabase
        .from('api4com_credentials')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('api4com_credentials')
          .update({ api_token: apiToken })
          .eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('api4com_credentials')
          .insert({ company_id: companyId, api_token: apiToken });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api4com-credentials', companyId] });
    },
  });

  const saveBitrix24Credentials = useMutation({
    mutationFn: async (credentials: { domain: string; access_token: string; webhook_url?: string }) => {
      if (!companyId) throw new Error('Company not found');

      const { data: existing } = await supabase
        .from('bitrix24_credentials')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('bitrix24_credentials')
          .update(credentials)
          .eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bitrix24_credentials')
          .insert({ company_id: companyId, ...credentials });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bitrix24-credentials', companyId] });
    },
  });

  return {
    api4comCredentials,
    bitrix24Credentials,
    isLoading: isLoadingApi4com || isLoadingBitrix,
    saveApi4comCredentials,
    saveBitrix24Credentials,
  };
}
