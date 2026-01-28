import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CallLog, CallMetrics } from '@/types/api4com';

interface CallLogsFilter {
  direction?: 'inbound' | 'outbound';
  status?: string;
  startDate?: Date;
  endDate?: Date;
}

export function useCallLogs(companyId: string | undefined, filters?: CallLogsFilter) {
  const { data: callLogs, isLoading } = useQuery({
    queryKey: ['call-logs', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];
      
      let query = supabase
        .from('call_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('call_started_at', { ascending: false });

      if (filters?.direction) {
        query = query.eq('direction', filters.direction);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.startDate) {
        query = query.gte('call_started_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('call_started_at', filters.endDate.toISOString());
      }

      const { data, error } = await query.limit(500);
      
      if (error) throw error;
      return data as CallLog[];
    },
    enabled: !!companyId,
  });

  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['call-metrics', companyId, filters?.startDate, filters?.endDate],
    queryFn: async () => {
      if (!companyId) return null;
      
      let query = supabase
        .from('call_logs')
        .select('direction, status, duration_seconds')
        .eq('company_id', companyId);

      if (filters?.startDate) {
        query = query.gte('call_started_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('call_started_at', filters.endDate.toISOString());
      }

      const { data, error } = await query;
      
      if (error) throw error;

      const logs = data || [];
      const total_calls = logs.length;
      const inbound_calls = logs.filter(l => l.direction === 'inbound').length;
      const outbound_calls = logs.filter(l => l.direction === 'outbound').length;
      const answered_calls = logs.filter(l => l.status === 'answered' || l.status === 'completed').length;
      const missed_calls = logs.filter(l => l.status === 'missed').length;
      const total_duration = logs.reduce((acc, l) => acc + (l.duration_seconds || 0), 0);
      const average_duration = answered_calls > 0 ? Math.round(total_duration / answered_calls) : 0;

      return {
        total_calls,
        inbound_calls,
        outbound_calls,
        answered_calls,
        missed_calls,
        total_duration,
        average_duration,
      } as CallMetrics;
    },
    enabled: !!companyId,
  });

  return {
    callLogs: callLogs ?? [],
    metrics,
    isLoading: isLoading || isLoadingMetrics,
  };
}
