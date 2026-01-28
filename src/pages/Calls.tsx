import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { CallLogTable } from '@/components/calls/CallLogTable';
import { useCompany } from '@/hooks/useCompany';
import { useCallLogs } from '@/hooks/useCallLogs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function Calls() {
  const { currentCompany } = useCompany();
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [status, setStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const { callLogs, isLoading } = useCallLogs(currentCompany?.id, {
    direction: direction === 'all' ? undefined : direction,
    status: status === 'all' ? undefined : status,
    startDate: dateRange.from,
    endDate: dateRange.to,
  });

  const clearFilters = () => {
    setDirection('all');
    setStatus('all');
    setDateRange({});
  };

  const hasFilters = direction !== 'all' || status !== 'all' || dateRange.from || dateRange.to;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Histórico de Chamadas</h2>
            <p className="text-muted-foreground">
              {callLogs.length} chamadas encontradas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Direção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="inbound">Recebidas</SelectItem>
                <SelectItem value="outbound">Realizadas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="answered">Atendidas</SelectItem>
                <SelectItem value="completed">Completadas</SelectItem>
                <SelectItem value="missed">Perdidas</SelectItem>
                <SelectItem value="busy">Ocupado</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal',
                    !dateRange.from && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'dd/MM', { locale: ptBR })} -{' '}
                        {format(dateRange.to, 'dd/MM', { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })
                    )
                  ) : (
                    'Período'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
                  onSelect={(range) => setDateRange(range ? { from: range.from, to: range.to } : {})}
                  locale={ptBR}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters}>
                <Filter className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <CallLogTable callLogs={callLogs} isLoading={isLoading} />
      </div>
    </AppLayout>
  );
}
