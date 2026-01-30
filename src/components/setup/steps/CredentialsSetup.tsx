import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Check, AlertCircle, CheckCircle, Wifi, WifiOff, ExternalLink, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCompany } from '@/hooks/useCompany';
import { useCredentials } from '@/hooks/useCredentials';
import { useBitrix } from '@/hooks/useBitrix';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const api4comSchema = z.object({
  api_token: z.string().min(10, 'Token inválido'),
});

interface CredentialsSetupProps {
  onComplete: () => void;
}

interface SetupResult {
  success: boolean;
  domain?: string;
  extension?: string;
  webhook_configured?: boolean;
  webhook_url?: string;
  user_mapping_created?: boolean;
  error?: string;
  details?: string;
}

// Helper to detect token-related errors
function isTokenInvalidError(error: string | undefined, details?: string): boolean {
  if (!error) return false;
  const lowerError = error.toLowerCase();
  const lowerDetails = (details || '').toLowerCase();
  return (
    lowerError.includes('inválido') ||
    lowerError.includes('invalid') ||
    lowerError.includes('401') ||
    lowerError.includes('unauthorized') ||
    lowerDetails.includes('401') ||
    lowerDetails.includes('unauthorized')
  );
}

export function CredentialsSetup({ onComplete }: CredentialsSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const { currentCompany } = useCompany();
  const { api4comCredentials, bitrix24Credentials, saveApi4comCredentials } = useCredentials(currentCompany?.id);
  const { isInBitrix, auth, currentUser } = useBitrix();

  const api4comForm = useForm({
    resolver: zodResolver(api4comSchema),
    defaultValues: {
      api_token: api4comCredentials?.api_token || '',
    },
  });

  const handleApi4comSubmit = async (data: z.infer<typeof api4comSchema>) => {
    if (!currentCompany?.id) {
      toast({
        title: 'Erro',
        description: 'Empresa não encontrada',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setSetupResult(null);

    try {
      // First save the credentials
      await saveApi4comCredentials.mutateAsync(data.api_token);

      // Then call the setup edge function to configure the webhook
      // Pass Bitrix user info for auto user mapping
      const bitrixUserId = currentUser?.ID;
      const userName = currentUser ? 
        `${currentUser.NAME || ''} ${currentUser.LAST_NAME || ''}`.trim() : undefined;
      
      const { data: result, error } = await supabase.functions.invoke('api4com-setup', {
        body: {
          company_id: currentCompany.id,
          api_token: data.api_token,
          bitrix_user_id: bitrixUserId,
          user_name: userName,
        },
      });

      if (error) {
        console.error('Setup error:', error);
        setSetupResult({
          success: false,
          error: error.message,
        });
        toast({
          title: 'Aviso',
          description: 'Credenciais salvas, mas houve um erro na configuração automática do webhook.',
          variant: 'destructive',
        });
      } else {
        setSetupResult(result as SetupResult);
        if (result?.webhook_configured) {
          toast({ 
            title: 'Configuração completa!',
            description: 'Token salvo e webhook configurado automaticamente.',
          });
        } else {
          toast({ 
            title: 'Token salvo',
            description: 'Credenciais salvas. O webhook precisará ser configurado manualmente.',
          });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Setup error:', error);
      setSetupResult({
        success: false,
        error: message,
      });
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
  const webhookConfigured = api4comCredentials?.webhook_configured || setupResult?.webhook_configured;

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
          <h3 className="font-medium">Api4Com WebPhone</h3>
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
              {api4comCredentials ? 'Atualizar e Configurar' : 'Salvar e Configurar'}
            </Button>
          </form>
        </Form>

        {/* Webhook Status */}
        {api4comCredentials && (
          <div className="rounded-lg border p-4 mt-4">
            <div className="flex items-center gap-3">
              {webhookConfigured ? (
                <>
                  <Wifi className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-medium text-sm">Webhook Configurado</h4>
                    {api4comCredentials.api4com_domain && (
                      <p className="text-xs text-muted-foreground">
                        Domínio: {api4comCredentials.api4com_domain}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Eventos de chamada serão recebidos automaticamente.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h4 className="font-medium text-sm">Webhook Não Configurado</h4>
                    <p className="text-xs text-muted-foreground">
                      O Click-to-Call funcionará, mas eventos de chamada não serão sincronizados.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Extension Detected */}
        {setupResult?.extension && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-primary" />
              <div>
                <h4 className="font-medium text-sm">Ramal Detectado: {setupResult.extension}</h4>
                {setupResult.user_mapping_created ? (
                  <p className="text-xs text-muted-foreground">
                    Mapeamento automático criado para o usuário logado.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Domínio: {setupResult.domain}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Setup Result Details */}
        {setupResult && !setupResult.success && setupResult.error && (
          <Alert variant="destructive" className="mt-4">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="space-y-3">
              {isTokenInvalidError(setupResult.error, setupResult.details) ? (
                <>
                  <div className="font-medium">Token Api4Com inválido ou expirado</div>
                  <div className="text-sm space-y-2">
                    <p>O token informado não foi aceito pela Api4Com. Isso pode acontecer se:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>O token foi copiado incorretamente (verifique espaços extras)</li>
                      <li>O token expirou ou foi revogado</li>
                      <li>O token não tem as permissões necessárias</li>
                    </ul>
                    <div className="pt-2">
                      <strong>Como obter um token válido:</strong>
                      <ol className="list-decimal list-inside space-y-1 ml-2 mt-1">
                        <li>
                          Acesse{' '}
                          <a
                            href="https://app.api4com.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline inline-flex items-center gap-1"
                          >
                            app.api4com.com
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </li>
                        <li>Vá em <strong>Integrações</strong> → <strong>API</strong></li>
                        <li>Copie o token completo (certifique-se de copiar tudo)</li>
                        <li>Cole o token no campo acima e tente novamente</li>
                      </ol>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium">Erro na configuração</div>
                  <p className="text-sm">{setupResult.error}</p>
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {isComplete && (
        <Button onClick={onComplete} className="w-full">
          Continuar para Mapeamento de Usuários
        </Button>
      )}
    </div>
  );
}
