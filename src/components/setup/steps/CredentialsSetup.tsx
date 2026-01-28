import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/hooks/useCompany';
import { useCredentials } from '@/hooks/useCredentials';
import { toast } from '@/hooks/use-toast';

const api4comSchema = z.object({
  api_token: z.string().min(10, 'Token inválido'),
});

const bitrixSchema = z.object({
  domain: z.string().min(3, 'Domínio inválido').regex(/^[\w-]+\.bitrix24\.(com|com\.br)$/, 'Formato: empresa.bitrix24.com'),
  webhook_url: z.string().url('URL inválida').optional().or(z.literal('')),
  access_token: z.string().min(10, 'Token inválido'),
});

interface CredentialsSetupProps {
  onComplete: () => void;
}

export function CredentialsSetup({ onComplete }: CredentialsSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useCompany();
  const { api4comCredentials, bitrix24Credentials, saveApi4comCredentials, saveBitrix24Credentials } = useCredentials(currentCompany?.id);

  const api4comForm = useForm({
    resolver: zodResolver(api4comSchema),
    defaultValues: {
      api_token: api4comCredentials?.api_token || '',
    },
  });

  const bitrixForm = useForm({
    resolver: zodResolver(bitrixSchema),
    defaultValues: {
      domain: bitrix24Credentials?.domain || '',
      webhook_url: bitrix24Credentials?.webhook_url || '',
      access_token: bitrix24Credentials?.access_token || '',
    },
  });

  const handleApi4comSubmit = async (data: z.infer<typeof api4comSchema>) => {
    setIsLoading(true);
    try {
      await saveApi4comCredentials.mutateAsync(data.api_token);
      toast({ title: 'Credenciais Api4Com salvas!' });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBitrixSubmit = async (data: z.infer<typeof bitrixSchema>) => {
    setIsLoading(true);
    try {
      await saveBitrix24Credentials.mutateAsync({
        domain: data.domain,
        access_token: data.access_token,
        webhook_url: data.webhook_url || undefined,
      });
      toast({ title: 'Credenciais Bitrix24 salvas!' });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isComplete = !!api4comCredentials && !!bitrix24Credentials;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="api4com">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="api4com" className="gap-2">
            Api4Com
            {api4comCredentials && <Check className="h-4 w-4 text-primary" />}
          </TabsTrigger>
          <TabsTrigger value="bitrix24" className="gap-2">
            Bitrix24
            {bitrix24Credentials && <Check className="h-4 w-4 text-primary" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api4com" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="bitrix24" className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Configure um webhook de entrada em seu Bitrix24 com as permissões: telephony, crm, user
            </AlertDescription>
          </Alert>

          <Form {...bitrixForm}>
            <form onSubmit={bitrixForm.handleSubmit(handleBitrixSubmit)} className="space-y-4">
              <FormField
                control={bitrixForm.control}
                name="domain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Domínio do Bitrix</FormLabel>
                    <FormControl>
                      <Input placeholder="suaempresa.bitrix24.com.br" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={bitrixForm.control}
                name="webhook_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL do Webhook (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://suaempresa.bitrix24.com.br/rest/1/..." {...field} />
                    </FormControl>
                    <FormDescription>
                      Webhook de entrada para chamadas REST API.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={bitrixForm.control}
                name="access_token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Token</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Token de acesso" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Bitrix24
              </Button>
            </form>
          </Form>
        </TabsContent>
      </Tabs>

      {isComplete && (
        <Button onClick={onComplete} className="w-full">
          Continuar para Mapeamento de Usuários
        </Button>
      )}
    </div>
  );
}
