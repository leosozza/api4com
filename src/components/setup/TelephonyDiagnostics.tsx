import { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DiagnosticsResult {
  domain: string;
  checks: {
    registeredEvents?: Array<{ event: string; handler: string }>;
    allEventsCount?: number;
    externalLines?: Array<{ NUMBER: string; NAME?: string }>;
    externalLinesError?: string;
    appInfo?: { CODE: string; STATUS: string };
    appInfoError?: string;
    currentUser?: { id: string; name: string; isAdmin: boolean };
    currentUserError?: string;
    voximplantOutgoingGet?: unknown;
    voximplantLines?: Array<Record<string, unknown>>;
    telephonyMethods?: string[];
    defaultLineNumber?: string;
    resolvedDefaultLine?: Record<string, unknown>;
  };
  userMappings?: Array<{ id: string; bitrix24_user_id: string; api4com_extension: string; user_name?: string }>;
  phoneLines?: Array<{ id: string; line_number: string; is_default: boolean }>;
}

interface TelephonyDiagnosticsProps {
  companyId: string;
}

export function TelephonyDiagnostics({ companyId }: TelephonyDiagnosticsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const runDiagnostics = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('diagnose-telephony', {
        body: { company_id: companyId },
      });

      if (error) throw error;
      setResult(data);
      toast.success('Diagnóstico concluído');
    } catch (err) {
      console.error('Diagnostics error:', err);
      toast.error('Erro ao executar diagnóstico');
    } finally {
      setIsLoading(false);
    }
  };

  const runRepair = async () => {
    setIsRepairing(true);

    try {
      const { data, error } = await supabase.functions.invoke('register-telephony-events', {
        body: { company_id: companyId },
      });

      if (error) throw error;

      toast.success('Eventos de telefonia registrados com sucesso!');
      
      // Re-run diagnostics to show updated state
      await runDiagnostics();
    } catch (err) {
      console.error('Repair error:', err);
      toast.error('Erro ao registrar eventos');
    } finally {
      setIsRepairing(false);
    }
  };

  const getStatusIcon = (isOk: boolean) => {
    return isOk ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  const hasCallEvents = result?.checks?.registeredEvents?.some(
    (e) => e.event === 'ONEXTERNALCALLSTART' || e.event === 'ONEXTERNALCALLBACKSTART'
  );

  const hasExternalLines = (result?.checks?.externalLines?.length ?? 0) > 0;
  const hasUserMappings = (result?.userMappings?.length ?? 0) > 0;
  const hasPhoneLines = (result?.phoneLines?.length ?? 0) > 0;

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Diagnóstico de Telefonia
        </CardTitle>
        <CardDescription>
          Verifique e repare a configuração do Click-to-Call no Bitrix24
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runDiagnostics}
            disabled={isLoading || isRepairing}
            variant="outline"
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Diagnosticar
          </Button>
          
          <Button
            onClick={runRepair}
            disabled={isLoading || isRepairing}
            variant="default"
            size="sm"
          >
            {isRepairing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Reparar Eventos
          </Button>
        </div>

        {result && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-muted-foreground">
              Portal: {result.domain}
            </div>

            {/* Quick status badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={hasCallEvents ? "default" : "destructive"} className="gap-1">
                {getStatusIcon(!!hasCallEvents)}
                Eventos
              </Badge>
              <Badge variant={hasExternalLines ? "default" : "destructive"} className="gap-1">
                {getStatusIcon(hasExternalLines)}
                Linhas Bitrix
              </Badge>
              <Badge variant={hasPhoneLines ? "default" : "destructive"} className="gap-1">
                {getStatusIcon(hasPhoneLines)}
                Linhas Locais
              </Badge>
              <Badge variant={hasUserMappings ? "default" : "destructive"} className="gap-1">
                {getStatusIcon(hasUserMappings)}
                Mapeamentos
              </Badge>
            </div>

            {/* Issues summary */}
            {!hasCallEvents && (
              <div className="rounded-md bg-red-100 p-3 text-sm text-red-800">
                <strong>Problema:</strong> Eventos de telefonia não registrados. Clique em "Reparar Eventos" para corrigir.
              </div>
            )}

            {!hasExternalLines && hasPhoneLines && (
              <div className="rounded-md bg-yellow-100 p-3 text-sm text-yellow-800">
                <strong>Aviso:</strong> Linhas locais configuradas mas não registradas no Bitrix24. O reparo irá registrá-las.
              </div>
            )}

            {!hasUserMappings && (
              <div className="rounded-md bg-yellow-100 p-3 text-sm text-yellow-800">
                <strong>Aviso:</strong> Nenhum usuário mapeado. Configure os mapeamentos no Contact Center do Bitrix24.
              </div>
            )}

            {/* Detailed results */}
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  Detalhes técnicos
                  {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {/* Registered events */}
                <div className="rounded border bg-background p-2">
                  <div className="mb-1 text-xs font-medium">Eventos registrados ({result.checks.registeredEvents?.length ?? 0}):</div>
                  {result.checks.registeredEvents?.length ? (
                    <ul className="text-xs text-muted-foreground">
                      {result.checks.registeredEvents.map((e, i) => (
                        <li key={i} className="truncate">
                          {e.event} → {e.handler}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum evento de telefonia</p>
                  )}
                </div>

                {/* External lines in Bitrix */}
                <div className="rounded border bg-background p-2">
                  <div className="mb-1 text-xs font-medium">Linhas externas no Bitrix ({result.checks.externalLines?.length ?? 0}):</div>
                  {result.checks.externalLines?.length ? (
                    <ul className="text-xs text-muted-foreground">
                      {result.checks.externalLines.map((l, i) => (
                        <li key={i}>{l.NUMBER} {l.NAME ? `(${l.NAME})` : ''}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma linha externa</p>
                  )}
                </div>

                {/* User mappings */}
                <div className="rounded border bg-background p-2">
                  <div className="mb-1 text-xs font-medium">Mapeamentos de usuários ({result.userMappings?.length ?? 0}):</div>
                  {result.userMappings?.length ? (
                    <ul className="text-xs text-muted-foreground">
                      {result.userMappings.map((m) => (
                        <li key={m.id}>
                          {m.user_name || `User ${m.bitrix24_user_id}`} → Ramal {m.api4com_extension}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum mapeamento</p>
                  )}
                </div>

                {/* App info */}
                {result.checks.appInfo && (
                  <div className="rounded border bg-background p-2">
                    <div className="mb-1 text-xs font-medium">Informações do App:</div>
                    <p className="text-xs text-muted-foreground">
                      Código: {result.checks.appInfo.CODE} | Status: {result.checks.appInfo.STATUS}
                    </p>
                  </div>
                )}

                {/* Voximplant lines */}
                {result.checks.voximplantLines && (
                  <div className="rounded border bg-background p-2">
                    <div className="mb-1 text-xs font-medium">Linhas Voximplant ({result.checks.voximplantLines.length}):</div>
                    <ul className="text-xs text-muted-foreground">
                      {result.checks.voximplantLines.slice(0, 5).map((l, i) => (
                        <li key={i} className="truncate">
                          {JSON.stringify(l)}
                        </li>
                      ))}
                      {result.checks.voximplantLines.length > 5 && (
                        <li>... e mais {result.checks.voximplantLines.length - 5}</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Raw JSON */}
                <details className="rounded border bg-background p-2">
                  <summary className="cursor-pointer text-xs font-medium">JSON completo</summary>
                  <pre className="mt-2 max-h-48 overflow-auto text-xs">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
