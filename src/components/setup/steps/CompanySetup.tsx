import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Building2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/hooks/useAuth';
import { useBitrix } from '@/hooks/useBitrix';
import { toast } from '@/hooks/use-toast';

const companySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface CompanySetupProps {
  linkedCompany?: { id: string; name: string; role?: string } | null;
  onComplete: () => void;
}

export function CompanySetup({ linkedCompany, onComplete }: CompanySetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { currentCompany, createCompany } = useCompany();
  const { session, ensureSession } = useAuth();
  const [sessionReady, setSessionReady] = useState(!!session);

  // Use linked company from Bitrix if available
  const effectiveCompany = currentCompany || linkedCompany;

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: effectiveCompany?.name || '',
    },
  });

  // Check and ensure session on mount and when session changes
  useEffect(() => {
    const checkSession = async () => {
      if (!session) {
        console.log('[CompanySetup] No session detected, attempting to ensure...');
        const newSession = await ensureSession();
        setSessionReady(!!newSession);
      } else {
        setSessionReady(true);
      }
    };
    
    checkSession();
  }, [session, ensureSession]);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      const newSession = await ensureSession();
      setSessionReady(!!newSession);
      if (newSession) {
        toast({
          title: 'Reconectado',
          description: 'Sessão estabelecida com sucesso.',
        });
      } else {
        toast({
          title: 'Falha ao reconectar',
          description: 'Não foi possível estabelecer uma sessão. Tente recarregar a página.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[CompanySetup] Reconnect failed:', error);
      toast({
        title: 'Erro ao reconectar',
        description: 'Tente recarregar a página ou abrir em uma nova aba.',
        variant: 'destructive',
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  const onSubmit = async (data: CompanyFormData) => {
    if (effectiveCompany) {
      onComplete();
      return;
    }

    // Double-check session before submitting
    if (!sessionReady) {
      toast({
        title: 'Sessão não disponível',
        description: 'Aguarde a conexão ou clique em "Reconectar".',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await createCompany.mutateAsync(data.name);
      toast({ title: 'Empresa criada com sucesso!' });
      onComplete();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao criar empresa',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (effectiveCompany) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <p className="font-medium">{effectiveCompany.name}</p>
            <p className="text-sm text-muted-foreground">
              {linkedCompany ? 'Empresa vinculada automaticamente' : 'Empresa configurada'}
            </p>
          </div>
        </div>
        <Button onClick={onComplete}>Continuar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session status alert */}
      {!sessionReady && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Sessão não detectada. Isso pode ocorrer em iframes com cookies bloqueados.
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="ml-2"
            >
              {isReconnecting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Reconectar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da Empresa</FormLabel>
                <FormControl>
                  <Input placeholder="Minha Empresa Ltda" {...field} />
                </FormControl>
                <FormDescription>
                  Este nome será usado para identificar sua integração.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button 
            type="submit" 
            disabled={isLoading || !sessionReady}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!sessionReady ? 'Aguardando sessão...' : 'Criar Empresa'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
