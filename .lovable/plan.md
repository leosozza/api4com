
## Plano: Corrigir Desalinhamento de Dados entre Empresas

### Diagnostico do Problema

O erro "Edge Function returned a non-2xx status code" ocorre porque:

| Recurso | Empresa | ID |
|---------|---------|-----|
| Credenciais Bitrix24 | Portal thoth24.bitrix24.com.br | `82e09b93-8617-4692-9365-dd87cc77c60b` |
| Linha Telefonica | Thoth24 solution | `54401a1c-9d80-42d8-ad73-d29290999b32` |
| User Mapping | Portal thoth24.bitrix24.com.br | `82e09b93-8617-4692-9365-dd87cc77c60b` |

Quando o usuario clica em "Registrar Eventos de Telefonia", o sistema:
1. Usa o `currentCompany.id` (`54401a1c-9d80-42d8-ad73-d29290999b32`)
2. A edge function busca credenciais Bitrix24 para essa empresa
3. Nao encontra (retorno vazio) - as credenciais estao em outra empresa
4. Retorna erro 404 "Bitrix24 credentials not found"

### Causas do Desalinhamento

Existem **4 empresas de teste** no banco de dados criadas em momentos diferentes durante o desenvolvimento. O portal Bitrix24 `thoth24.bitrix24.com.br` foi instalado quando a empresa `82e09b93-...` existia, mas depois o usuario criou outra empresa `54401a1c-...` e cadastrou recursos nela.

### Solucao Proposta

#### Opcao A: Corrigir Dados no Banco (Recomendado para testes)

Migrar as credenciais Bitrix24 para a empresa que tem os recursos:

```sql
-- Mover credenciais Bitrix24 para a empresa Thoth24 solution
UPDATE bitrix24_credentials 
SET company_id = '54401a1c-9d80-42d8-ad73-d29290999b32'
WHERE company_id = '82e09b93-8617-4692-9365-dd87cc77c60b';

-- Mover user_mappings para a mesma empresa
UPDATE user_mappings 
SET company_id = '54401a1c-9d80-42d8-ad73-d29290999b32'
WHERE company_id = '82e09b93-8617-4692-9365-dd87cc77c60b';
```

**Vantagem**: Solucao rapida para continuar testando
**Desvantagem**: Nao resolve o problema estrutural

#### Opcao B: Melhorar a Edge Function (Recomendado para producao)

Modificar a edge function `register-telephony-events` para buscar credenciais pelo `member_id` do Bitrix24 em vez do `company_id`:

```text
1. Receber company_id no request
2. Buscar a linha telefonica da empresa
3. Buscar QUALQUER credencial Bitrix24 que tenha o mesmo portal
   (usando o member_id ou domain como chave)
4. Usar essas credenciais para registrar os eventos
```

**Vantagem**: Mais resiliente a desalinhamentos
**Desvantagem**: Requer mudanca na logica e pode causar confusao

#### Opcao C: Limpar Dados e Reinstalar (Mais robusto)

1. Deletar todas as empresas de teste
2. Reinstalar o app no Bitrix24
3. Sistema cria empresa correta automaticamente
4. Recadastrar credenciais Api4Com e linhas

### Recomendacao

Para continuar os testes agora, executar a **Opcao A** (migracao de dados).

Para producao, implementar validacoes que impecam a criacao de multiplas empresas para o mesmo portal Bitrix24.

### Arquivos a Modificar (Opcao B)

| Arquivo | Modificacao |
|---------|-------------|
| `supabase/functions/register-telephony-events/index.ts` | Buscar credenciais por `member_id` ou `domain` alem do `company_id` |
| `src/components/setup/steps/PhoneLinesSetup.tsx` | Passar `member_id` ao chamar a funcao |

### Detalhes Tecnicos (Opcao B)

```typescript
// Busca atual (falha se company_id estiver errado)
const { data: credentials } = await supabase
  .from("bitrix24_credentials")
  .select("*")
  .eq("company_id", company_id)
  .single();

// Busca melhorada (fallback por member_id)
let credentials = null;

// Primeira tentativa: por company_id
const { data: byCompany } = await supabase
  .from("bitrix24_credentials")
  .select("*")
  .eq("company_id", company_id)
  .maybeSingle();

if (byCompany) {
  credentials = byCompany;
} else {
  // Fallback: buscar por member_id (se fornecido)
  if (member_id) {
    const { data: byMember } = await supabase
      .from("bitrix24_credentials")
      .select("*")
      .eq("member_id", member_id)
      .maybeSingle();
    credentials = byMember;
  }
}
```

### Proximos Passos

1. **Imediato**: Aprovar migracao de dados (Opcao A) para desbloquear testes
2. **Curto prazo**: Implementar busca por fallback na edge function
3. **Medio prazo**: Adicionar validacao para evitar empresas duplicadas por portal
