import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useCompany } from '@/hooks/useCompany';
import { toast } from '@/hooks/use-toast';

const companySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface CompanySetupProps {
  onComplete: () => void;
}

export function CompanySetup({ onComplete }: CompanySetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany, createCompany } = useCompany();

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: currentCompany?.name || '',
    },
  });

  const onSubmit = async (data: CompanyFormData) => {
    if (currentCompany) {
      onComplete();
      return;
    }

    setIsLoading(true);
    try {
      await createCompany.mutateAsync(data.name);
      toast({ title: 'Empresa criada com sucesso!' });
      onComplete();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar empresa',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (currentCompany) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <p className="font-medium">{currentCompany.name}</p>
            <p className="text-sm text-muted-foreground">Empresa configurada</p>
          </div>
        </div>
        <Button onClick={onComplete}>Continuar</Button>
      </div>
    );
  }

  return (
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
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar Empresa
        </Button>
      </form>
    </Form>
  );
}
