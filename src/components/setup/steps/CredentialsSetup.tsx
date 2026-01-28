import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Check, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCompany } from '@/hooks/useCompany';
import { useCredentials } from '@/hooks/useCredentials';
import { useBitrix } from '@/hooks/useBitrix';
import { toast } from '@/hooks/use-toast';

const api4comSchema = z.object({
  api_token: z.string().min(10, 'Token inválido'),
});

interface CredentialsSetupProps {
  onComplete: () => void;
}

export function CredentialsSetup({ onComplete }: CredentialsSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useCompany();
  const { api4comCredentials, bitrix24Credentials, saveApi4comCredentials } = useCredentials(currentCompany?.id);
  const { isInBitrix, auth } = useBitrix();

  const api4comForm = useForm({
    resolver: zodResolver(api4comSchema),
    defaultValues: {
      api_token: api4comCredentials?.api_token || '',
    },
  });

  const handleApi4comSubmit = async (data: z.infer<typeof api4comSchema>) => {
    setIsLoading(true);
    try {
      await saveApi4comCredentials.mutateAsync(data.api_token);
      toast({ title: 'Credenciais Api4Com salvas!' });
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

  // Check if Bitrix credentials are available (auto-configured via marketplace)
  const bitrixConfigured = isInBitrix && auth?.member_id;

  const isComplete = !!api4comCredentials && (bitrixConfigured || !!bitrix24Credentials);

  return (
    <div className="space-y-6">
      {/* Bitrix24 Status */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-3">
          {bitrixConfigured ? (
            <>
              <CheckCircle className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-medium">Bitrix24 Conectado</h3>
                <p className="text-sm text-muted-foreground">
                  Portal: {auth?.domain}
                </p>
              </div>
            </>
          ) : bitrix24Credentials ? (
            <>
              <CheckCircle className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-medium">Bitrix24 Configurado</h3>
                <p className="text-sm text-muted-foreground">
                  Portal: {bitrix24Credentials.domain}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Bitrix24 Não Configurado</h3>
                <p className="text-sm text-muted-foreground">
                  Instale o app pelo Marketplace do Bitrix24
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Api4Com Configuration */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Api4Com</h3>
          {api4comCredentials && <Check className="h-4 w-4 text-primary" />}
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Obtenha seu token em{' '}
            <a
              href="https://developers.api4com.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              developers.api4com.com
            </a>
          </AlertDescription>
        </Alert>

        <Form {...api4comForm}>
          <form onSubmit={api4comForm.handleSubmit(handleApi4comSubmit)} className="space-y-4">
            <FormField
              control={api4comForm.control}
              name="api_token"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Token da API</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Seu token Api4Com" {...field} />
                  </FormControl>
                  <FormDescription>
                    Token de autenticação para acessar a API da Api4Com.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Api4Com
            </Button>
          </form>
        </Form>
      </div>

      {isComplete && (
        <Button onClick={onComplete} className="w-full">
          Continuar para Mapeamento de Usuários
        </Button>
      )}
    </div>
  );
}
