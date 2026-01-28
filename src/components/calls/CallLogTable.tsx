import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PhoneIncoming, PhoneOutgoing, Play, Phone } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CallLog } from '@/types/api4com';

interface CallLogTableProps {
  callLogs: CallLog[];
  isLoading?: boolean;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ringing: { label: 'Tocando', variant: 'outline' },
  answered: { label: 'Atendida', variant: 'default' },
  completed: { label: 'Completada', variant: 'default' },
  missed: { label: 'Perdida', variant: 'destructive' },
  busy: { label: 'Ocupado', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function CallLogTable({ callLogs, isLoading }: CallLogTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (callLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Phone className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">Nenhuma chamada registrada</p>
        <p className="text-sm text-muted-foreground">
          As chamadas aparecerão aqui conforme forem realizadas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Número</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Data/Hora</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {callLogs.map((log) => {
            const status = statusConfig[log.status] || { label: log.status, variant: 'outline' as const };
            const DirectionIcon = log.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
            const directionColor = log.direction === 'inbound' ? 'text-emerald-600' : 'text-blue-600';

            return (
              <TableRow key={log.id}>
                <TableCell>
                  <DirectionIcon className={`h-4 w-4 ${directionColor}`} />
                </TableCell>
                <TableCell className="font-mono">{log.phone_number}</TableCell>
                <TableCell>{log.caller_name || '-'}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="font-mono">
                  {formatDuration(log.duration_seconds)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(log.call_started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell>
                  {log.recording_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                    >
                      <a href={log.recording_url} target="_blank" rel="noopener noreferrer">
                        <Play className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
