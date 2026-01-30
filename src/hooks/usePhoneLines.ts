import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ExternalPhoneLine } from '@/types/api4com';

export function usePhoneLines(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: phoneLines, isLoading } = useQuery({
    queryKey: ['phone-lines', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('external_phone_lines')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as ExternalPhoneLine[];
    },
    enabled: !!companyId,
  });

  // Register line in Bitrix24
  const registerLineInBitrix = async (lineNumber: string, lineName?: string) => {
    if (!companyId) return { success: false, error: 'Empresa não encontrada' };
    
    try {
      const { data, error } = await supabase.functions.invoke('register-external-line', {
        body: { company_id: companyId, line_number: lineNumber, line_name: lineName }
      });
      
      if (error) {
        console.error('Error registering line in Bitrix:', error);
        return { success: false, error: error.message };
      }
      
      // Check if the response contains an error
      if (data?.error) {
        console.error('Bitrix registration error:', data.error, data.details);
        return { success: false, error: data.error, details: data.details };
      }
      
      return { success: true, ...data };
    } catch (err) {
      console.error('Error calling register-external-line:', err);
      return { success: false, error: 'Falha ao registrar linha' };
    }
  };

  const addPhoneLine = useMutation({
    mutationFn: async (line: { line_number: string; line_name?: string; is_default?: boolean }) => {
      if (!companyId) throw new Error('Company not found');
      
      // If this is the default line, unset other defaults
      if (line.is_default) {
        await supabase
          .from('external_phone_lines')
          .update({ is_default: false })
          .eq('company_id', companyId);
      }
      
      const { error } = await supabase
        .from('external_phone_lines')
        .insert({ company_id: companyId, ...line });
      
      if (error) throw error;

      // Register in Bitrix24 after local save
      const bitrixResult = await registerLineInBitrix(line.line_number, line.line_name);
      return { bitrixRegistered: bitrixResult.success, ...bitrixResult };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-lines', companyId] });
    },
  });

  const updatePhoneLine = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; line_number?: string; line_name?: string; is_default?: boolean }) => {
      if (!companyId) throw new Error('Company not found');
      
      // If setting as default, unset other defaults first
      if (updates.is_default) {
        await supabase
          .from('external_phone_lines')
          .update({ is_default: false })
          .eq('company_id', companyId);
      }
      
      const { error } = await supabase
        .from('external_phone_lines')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-lines', companyId] });
    },
  });

  const deletePhoneLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('external_phone_lines')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-lines', companyId] });
    },
  });

  // Sync all lines with Bitrix24
  const syncAllWithBitrix = useMutation({
    mutationFn: async () => {
      if (!phoneLines) return { synced: 0, errors: 0, errorDetails: [] as string[] };
      
      let synced = 0;
      let errors = 0;
      const errorDetails: string[] = [];
      
      for (const line of phoneLines) {
        const result = await registerLineInBitrix(line.line_number, line.line_name || undefined);
        if (result.success) {
          synced++;
        } else {
          errors++;
          errorDetails.push(`${line.line_number}: ${result.error || 'Erro desconhecido'}`);
        }
      }
      
      return { synced, errors, errorDetails };
    },
  });

  return {
    phoneLines: phoneLines ?? [],
    isLoading,
    addPhoneLine,
    updatePhoneLine,
    deletePhoneLine,
    syncAllWithBitrix,
  };
}
