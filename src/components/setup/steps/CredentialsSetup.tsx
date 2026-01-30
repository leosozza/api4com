import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Check, AlertCircle, CheckCircle, Wifi, WifiOff, ExternalLink, XCircle, Copy, ChevronDown, ChevronUp } from 'lucide-react';
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

// Generate webhook URL from Supabase URL
function getWebhookUrl(providedUrl?: string): string {
  if (providedUrl) return providedUrl;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/api4com-webhook`;
}

// Webhook Section Component with copy functionality and manual instructions
function WebhookSection({ 
  webhookConfigured, 
  domain, 
  webhookUrl 
}: { 
  webhookConfigured?: boolean; 
  domain?: string | null; 
  webhookUrl?: string;
}) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const url = getWebhookUrl(webhookUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: 'URL copiada!',
        description: 'Cole a URL no painel da Api4Com.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Erro ao copiar',
        description: 'Selecione e copie manualmente a URL.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-lg border p-4 mt-4 space-y-4">
      {/* Status Header */}
      <div className="flex items-center gap-3">
        {webhookConfigured ? (
          <>
            <Wifi className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-medium text-sm">Webhook Configurado</h4>
              {domain && (
                <p className="text-xs text-muted-foreground">
                  Domínio: {domain}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Eventos de chamada serão recebidos automaticamente.
              </p>
            </div>
          </>
        ) : (
          <>
            <WifiOff className="h-5 w-5 text-amber-500" />
            <div>
              <h4 className="font-medium text-sm">Webhook Não Configurado</h4>
              <p className="text-xs text-muted-foreground">
                Configure manualmente para sincronizar eventos de chamada.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Webhook URL with Copy */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">URL do Webhook:</label>
        <div className="flex gap-2">
          <Input 
            value={url} 
            readOnly 
            className="font-mono text-xs bg-muted"
          />
          <Button 
            type="button"
            variant="outline" 
            size="icon"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Manual Instructions (Collapsible) */}
      {!webhookConfigured && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            {showInstructions ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Como configurar manualmente
          </button>
          
          {showInstructions && (
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-3">
              <ol className="list-decimal list-inside space-y-2">
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
                <li>Vá em <strong>Integrações</strong> → <strong>Webhook</strong></li>
                <li>Cole a URL acima no campo de webhook</li>
                <li>
                  Ative os eventos:
                  <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground">
                    <li>channel-create</li>
                    <li>channel-answer</li>
                    <li>channel-hangup</li>
                  </ul>
                </li>
                <li>Salve as configurações</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CredentialsSetup({ onComplete }: CredentialsSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const { linkedCompany, isInBitrix, auth, currentUser } = useBitrix();
  const { currentCompany } = useCompany(linkedCompany?.id);
  
  // Use effective company from either source
  const effectiveCompany = currentCompany || linkedCompany;
  const { api4comCredentials, bitrix24Credentials, saveApi4comCredentials } = useCredentials(effectiveCompany?.id);

  const api4comForm = useForm({
    resolver: zodResolver(api4comSchema),
    defaultValues: {
      api_token: api4comCredentials?.api_token || '',
    },
  });

  const handleApi4comSubmit = async (data: z.infer<typeof api4comSchema>) => {
    if (!effectiveCompany?.id) {
      toast({
        title: 'Erro',
        description: 'Empresa não encontrada. Complete o passo anterior primeiro.',
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
          company_id: effectiveCompany.id,
          api_token: data.api_token,
          bitrix_user_id: bitrixUserId,
          user_name: userName,
        },
      });

      console.log('api4com-setup response:', { result, error });

      // Check for errors - can come from 'error' object or from result with error property
      if (error) {
        console.error('Setup error (from error object):', error);
        // Try to extract more details from the error
        const errorMessage = error.message || 'Erro na configuração';
        const errorDetails = typeof error === 'object' ? JSON.stringify(error) : undefined;
        
        setSetupResult({
          success: false,
          error: errorMessage,
          details: errorDetails,
        });
        toast({
          title: 'Erro na configuração',
          description: errorMessage,
          variant: 'destructive',
        });
      } else if (result?.error) {
        // Error returned in the response body
        console.error('Setup error (from result):', result);
        setSetupResult({
          success: false,
          error: result.error,
          details: result.details,
        });
        toast({
          title: 'Erro na configuração',
          description: result.error,
          variant: 'destructive',
        });
      } else if (result?.success) {
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
      } else {
        // Unexpected response format
        console.warn('Unexpected response format:', result);
        setSetupResult(result as SetupResult);
        toast({ 
          title: 'Token salvo',
          description: 'Verifique o status da configuração abaixo.',
        });
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
  // When outside Bitrix (development mode), we only require Api4Com credentials
  const bitrixConfigured = isInBitrix && auth?.member_id;
  const webhookConfigured = api4comCredentials?.webhook_configured || setupResult?.webhook_configured;

  // Outside Bitrix: only require Api4Com. Inside Bitrix: require both
  const isComplete = !!api4comCredentials && (!isInBitrix || bitrixConfigured || !!bitrix24Credentials);

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
          <WebhookSection 
            webhookConfigured={webhookConfigured}
            domain={api4comCredentials.api4com_domain}
            webhookUrl={setupResult?.webhook_url}
          />
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
