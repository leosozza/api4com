import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Loader2, Phone, Star, RefreshCw, Check, AlertCircle, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCompany } from '@/hooks/useCompany';
import { usePhoneLines } from '@/hooks/usePhoneLines';
import { useBitrix } from '@/hooks/useBitrix';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const phoneLineSchema = z.object({
  line_number: z.string().min(8, 'Número inválido').regex(/^[+\d\s()-]+$/, 'Formato inválido'),
  line_name: z.string().optional(),
  is_default: z.boolean().default(false),
});

interface PhoneLinesSetupProps {
  onComplete: () => void;
}

export function PhoneLinesSetup({ onComplete }: PhoneLinesSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisteringEvents, setIsRegisteringEvents] = useState(false);
  const [eventsRegistered, setEventsRegistered] = useState(false);
  const { linkedCompany } = useBitrix();
  const { currentCompany } = useCompany(linkedCompany?.id);
  
  // Use effective company from either source
  const effectiveCompany = currentCompany || linkedCompany;
  const { phoneLines, addPhoneLine, deletePhoneLine, updatePhoneLine, syncAllWithBitrix } = usePhoneLines(effectiveCompany?.id);

  const form = useForm({
    resolver: zodResolver(phoneLineSchema),
    defaultValues: {
      line_number: '',
      line_name: '',
      is_default: false,
    },
  });

  const onSubmit = async (data: z.infer<typeof phoneLineSchema>) => {
    setIsLoading(true);
    try {
      const result = await addPhoneLine.mutateAsync({
        line_number: data.line_number,
        line_name: data.line_name,
        is_default: data.is_default,
      });
      form.reset();
      
      if (result?.bitrixRegistered) {
        toast({ 
          title: 'Linha adicionada!',
          description: 'Linha registrada localmente e no Bitrix24.'
        });
      } else {
        toast({ 
          title: 'Linha adicionada!',
          description: 'Linha salva. Você pode sincronizar com o Bitrix24 depois.',
          variant: 'default'
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePhoneLine.mutateAsync(id);
      toast({ title: 'Linha removida!' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updatePhoneLine.mutateAsync({ id, is_default: true });
      toast({ title: 'Linha padrão atualizada!' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleSyncWithBitrix = async () => {
    try {
      const result = await syncAllWithBitrix.mutateAsync();
      if (result.synced > 0) {
        toast({ 
          title: 'Sincronização concluída!',
          description: `${result.synced} linha(s) sincronizada(s) com o Bitrix24.`
        });
      }
      if (result.errors > 0) {
        // Show detailed error message
        const errorMessage = result.errorDetails && result.errorDetails.length > 0
          ? result.errorDetails.join('; ')
          : `${result.errors} linha(s) falharam ao sincronizar.`;
        
        // Check if it's a credentials issue
        const isCredentialError = errorMessage.toLowerCase().includes('credentials not found') || 
                                   errorMessage.toLowerCase().includes('bitrix24 credentials');
        
        toast({ 
          title: 'Sincronização parcial',
          description: isCredentialError 
            ? 'Credenciais do Bitrix24 não encontradas. Certifique-se de que o app foi instalado via Marketplace do Bitrix24.'
            : errorMessage,
          variant: 'destructive'
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro na sincronização',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleRegisterTelephonyEvents = async () => {
    if (!effectiveCompany?.id) {
      toast({
        title: 'Erro',
        description: 'Empresa não encontrada. Complete os passos anteriores primeiro.',
        variant: 'destructive',
      });
      return;
    }

    setIsRegisteringEvents(true);
    try {
      const defaultLine = phoneLines.find(l => l.is_default) || phoneLines[0];
      
      // Get member_id from company for fallback lookup
      const memberId = currentCompany?.bitrix_member_id;
      
      const { data, error } = await supabase.functions.invoke('register-telephony-events', {
        body: {
          company_id: effectiveCompany.id,
          member_id: memberId,
          phone_line_number: defaultLine?.line_number,
          phone_line_name: defaultLine?.line_name || 'Api4Com',
        },
      });

      if (error) throw error;

      if (data?.success) {
        setEventsRegistered(true);
        toast({
          title: 'Eventos registrados!',
          description: data.message || 'Click-to-call agora está ativo.',
        });
      } else {
        throw new Error(data?.message || 'Falha ao registrar eventos');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao registrar eventos',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsRegisteringEvents(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Telephony Events Registration */}
      <Alert className={eventsRegistered ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-amber-500 bg-amber-50 dark:bg-amber-950'}>
        <Radio className={`h-5 w-5 ${eventsRegistered ? 'text-green-600' : 'text-amber-600'}`} />
        <AlertTitle className={eventsRegistered ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200'}>
          {eventsRegistered ? 'Eventos de Telefonia Ativos' : 'Registrar Eventos de Telefonia'}
        </AlertTitle>
        <AlertDescription className={eventsRegistered ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}>
          {eventsRegistered ? (
            'Click-to-call está configurado. Clique em um número no Bitrix24 para discar.'
          ) : (
            <>
              Para que o click-to-call funcione, os eventos de telefonia precisam estar registrados no Bitrix24.
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={handleRegisterTelephonyEvents}
                disabled={isRegisteringEvents}
              >
                {isRegisteringEvents ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="mr-2 h-4 w-4" />
                )}
                Registrar Eventos de Telefonia
              </Button>
            </>
          )}
        </AlertDescription>
      </Alert>

      {/* Info banner about user mapping */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
        <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-200">Mapeamento de Usuários</p>
          <p className="text-blue-700 dark:text-blue-300">
            O mapeamento de usuários aos ramais é feito diretamente no Contact Center do Bitrix24. 
            Aqui você configura apenas as linhas telefônicas externas.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="line_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número da Linha</FormLabel>
                  <FormControl>
                    <Input placeholder="+55 11 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="line_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Linha Principal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="is_default"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="!mt-0">Definir como linha padrão</FormLabel>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Adicionar Linha
            </Button>
            {phoneLines.length > 0 && (
              <Button 
                type="button" 
                variant="outline"
                onClick={handleSyncWithBitrix}
                disabled={syncAllWithBitrix.isPending}
              >
                {syncAllWithBitrix.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sincronizar com Bitrix
              </Button>
            )}
          </div>
        </form>
      </Form>

      {phoneLines.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phoneLines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-mono">{line.line_number}</TableCell>
                <TableCell>{line.line_name || '-'}</TableCell>
                <TableCell>
                  {line.is_default && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="h-3 w-3" />
                      Padrão
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="flex gap-1">
                  {!line.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSetDefault(line.id)}
                      title="Definir como padrão"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(line.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Phone className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhuma linha externa configurada ainda.
          </p>
        </div>
      )}

      {phoneLines.length > 0 && (
        <Button onClick={onComplete} className="w-full">
          <Check className="mr-2 h-4 w-4" />
          Finalizar Configuração
        </Button>
      )}
    </div>
  );
}
