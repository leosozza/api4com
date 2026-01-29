import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BitrixUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  internal_phone: string;
  active: boolean;
}

export function useBitrixUsers(companyId: string | undefined) {
  const { data: users, isLoading, error, refetch } = useQuery({
    queryKey: ['bitrix-users', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase.functions.invoke('sync-bitrix-users', {
        body: { company_id: companyId }
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch users');
      
      return data.users as BitrixUser[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    users: users ?? [],
    isLoading,
    error,
    refetch,
  };
}
