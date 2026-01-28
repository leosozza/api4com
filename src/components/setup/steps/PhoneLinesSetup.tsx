import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Loader2, Phone, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useCompany } from '@/hooks/useCompany';
import { usePhoneLines } from '@/hooks/usePhoneLines';
import { toast } from '@/hooks/use-toast';

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
  const { currentCompany } = useCompany();
  const { phoneLines, addPhoneLine, deletePhoneLine, updatePhoneLine } = usePhoneLines(currentCompany?.id);

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
      await addPhoneLine.mutateAsync({
        line_number: data.line_number,
        line_name: data.line_name,
        is_default: data.is_default,
      });
      form.reset();
      toast({ title: 'Linha adicionada!' });
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

  const handleDelete = async (id: string) => {
    try {
      await deletePhoneLine.mutateAsync(id);
      toast({ title: 'Linha removida!' });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updatePhoneLine.mutateAsync({ id, is_default: true });
      toast({ title: 'Linha padrão atualizada!' });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
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
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Adicionar Linha
          </Button>
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
          Finalizar Configuração
        </Button>
      )}
    </div>
  );
}
