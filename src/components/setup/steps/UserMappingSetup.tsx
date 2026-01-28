import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/hooks/useCompany';
import { useUserMappings } from '@/hooks/useUserMappings';
import { toast } from '@/hooks/use-toast';

const mappingSchema = z.object({
  api4com_extension: z.string().min(1, 'Ramal obrigatório'),
  bitrix24_user_id: z.string().min(1, 'ID do usuário obrigatório'),
  user_name: z.string().optional(),
});

interface UserMappingSetupProps {
  onComplete: () => void;
}

export function UserMappingSetup({ onComplete }: UserMappingSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { currentCompany } = useCompany();
  const { userMappings, addMapping, deleteMapping } = useUserMappings(currentCompany?.id);

  const form = useForm({
    resolver: zodResolver(mappingSchema),
    defaultValues: {
      api4com_extension: '',
      bitrix24_user_id: '',
      user_name: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof mappingSchema>) => {
    setIsLoading(true);
    try {
      await addMapping.mutateAsync({
        api4com_extension: data.api4com_extension,
        bitrix24_user_id: data.bitrix24_user_id,
        user_name: data.user_name,
      });
      form.reset();
      toast({ title: 'Mapeamento adicionado!' });
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
      await deleteMapping.mutateAsync(id);
      toast({ title: 'Mapeamento removido!' });
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
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="api4com_extension"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ramal Api4Com</FormLabel>
                  <FormControl>
                    <Input placeholder="1001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bitrix24_user_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID Usuário Bitrix</FormLabel>
                  <FormControl>
                    <Input placeholder="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="user_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="João Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Adicionar Mapeamento
          </Button>
        </form>
      </Form>

      {userMappings.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ramal Api4Com</TableHead>
              <TableHead>ID Bitrix</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userMappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-mono">{mapping.api4com_extension}</TableCell>
                <TableCell className="font-mono">{mapping.bitrix24_user_id}</TableCell>
                <TableCell>{mapping.user_name || '-'}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(mapping.id)}
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
          <Users className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhum mapeamento configurado ainda.
          </p>
        </div>
      )}

      {userMappings.length > 0 && (
        <Button onClick={onComplete} className="w-full">
          Continuar para Linhas Externas
        </Button>
      )}
    </div>
  );
}
