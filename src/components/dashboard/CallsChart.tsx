import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CallLog } from '@/types/api4com';

interface CallsChartProps {
  callLogs: CallLog[];
  isLoading?: boolean;
}

export function CallsChart({ callLogs, isLoading }: CallsChartProps) {
  const chartData = useMemo(() => {
    const last7Days: Record<string, { date: string; inbound: number; outbound: number }> = {};
    
    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      const dayLabel = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
      last7Days[key] = { date: dayLabel, inbound: 0, outbound: 0 };
    }

    // Count calls per day
    callLogs.forEach((log) => {
      const key = log.call_started_at.split('T')[0];
      if (last7Days[key]) {
        if (log.direction === 'inbound') {
          last7Days[key].inbound++;
        } else {
          last7Days[key].outbound++;
        }
      }
    });

    return Object.values(last7Days);
  }, [callLogs]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chamadas por Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chamadas por Dia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar
                dataKey="inbound"
                name="Recebidas"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="outbound"
                name="Realizadas"
                fill="hsl(var(--primary) / 0.5)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
