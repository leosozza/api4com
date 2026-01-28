import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { UserMapping } from '@/types/api4com';

export function useUserMappings(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: userMappings, isLoading } = useQuery({
    queryKey: ['user-mappings', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('user_mappings')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as UserMapping[];
    },
    enabled: !!companyId,
  });

  const addMapping = useMutation({
    mutationFn: async (mapping: { api4com_extension: string; bitrix24_user_id: string; user_name?: string }) => {
      if (!companyId) throw new Error('Company not found');
      
      const { error } = await supabase
        .from('user_mappings')
        .insert({ company_id: companyId, ...mapping });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-mappings', companyId] });
    },
  });

  const updateMapping = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; api4com_extension?: string; bitrix24_user_id?: string; user_name?: string }) => {
      const { error } = await supabase
        .from('user_mappings')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-mappings', companyId] });
    },
  });

  const deleteMapping = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_mappings')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-mappings', companyId] });
    },
  });

  return {
    userMappings: userMappings ?? [],
    isLoading,
    addMapping,
    updateMapping,
    deleteMapping,
  };
}
