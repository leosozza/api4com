

## Objetivo
Eliminar a necessidade de criar empresa manualmente dentro do Bitrix24. Quando o app for aberto dentro do Bitrix:
1. Detectar o `member_id` do portal
2. Encontrar ou vincular automaticamente o usuário anônimo à empresa correspondente
3. Pular o passo "Criar Empresa" no wizard

## Diagnóstico do Problema

### Estado atual do banco de dados
- **Empresa via instalação**: `Portal thoth24.bitrix24.com.br` (criada pelo `bitrix24-install`)
  - `bitrix_member_id`: `2b292197955c1c2fc0f5561388afc284`
  - **Problema**: Não tem nenhum membro (`company_members`) vinculado
- **Empresa via formulário**: `Empresa Teste Bitrix` (criada manualmente)
  - Tem membro com `user_id` anônimo
  - **Problema**: Não tem `bitrix_member_id`

### Por que a criação manual falha
O usuário atual no iframe do Bitrix tem um `user_id` diferente a cada sessão anônima. A edge function `create-company` cria uma empresa sem `bitrix_member_id`, então:
- Na próxima sessão (novo `user_id` anônimo), não encontra o `company_member` antigo
- O app mostra o wizard pedindo para criar empresa novamente

### Solução
Usar o `auth.member_id` do Bitrix como identificador principal do tenant:
1. Quando o app inicializa dentro do Bitrix, obtém o `member_id`
2. Busca empresa pelo `bitrix_member_id` (não pelo `user_id`)
3. Se encontrar, vincula o usuário anônimo atual como membro
4. Se não encontrar, cria empresa automaticamente (instalação já faz isso)

## Plano de Implementação

### Fase 1: Auto-vinculação de usuário ao tenant Bitrix

**Edge Function `link-user-to-company`** (nova)
- Recebe: `member_id` do Bitrix + token do usuário anônimo
- Procura empresa com `bitrix_member_id = member_id`
- Se existir e usuário não for membro, adiciona como membro
- Retorna a empresa vinculada

**BitrixContext.tsx** (atualizar)
- Após obter `auth.member_id` do BX24:
  - Chamar `link-user-to-company` passando o `member_id`
  - Atualizar `companyId` no contexto automaticamente
- Resultado: usuário já entra com empresa vinculada, sem precisar do wizard

### Fase 2: Simplificar o fluxo do Setup Wizard

**useCompany.ts** (atualizar)
- `currentCompany`: Além de buscar por `company_members`, também buscar por `bitrix_member_id` se estiver dentro do Bitrix

**SetupWizard.tsx** (atualizar)
- Se `currentCompany` existir (via auto-vinculação), pular direto para credenciais

**CompanySetup.tsx** (simplificar)
- Se já houver empresa (via `bitrix_member_id`), mostrar apenas um card de confirmação
- Remover o formulário de criação quando dentro do Bitrix

### Fase 3: Remover/ajustar botão de reset no header

**AppLayout.tsx** (atualizar)
- Remover o botão de reset de sessão (ou esconder quando dentro do Bitrix)
- Alternativa: Manter apenas para modo desenvolvimento
- Motivo: Não faz sentido resetar sessão no Bitrix (causa confusão e quebra o fluxo)

### Fase 4: Limpeza de dados (one-time)

**Script de migração** (opcional)
- Vincular empresas órfãs criadas manualmente ao `bitrix_member_id` correto
- Remover empresas duplicadas sem uso

## Arquivos a Modificar

### Backend (Edge Functions)
- `supabase/functions/link-user-to-company/index.ts` (novo)
  - Recebe `member_id` e token
  - Busca empresa pelo `bitrix_member_id`
  - Adiciona usuário como membro se não existir
  - Retorna empresa

### Frontend
- `src/contexts/BitrixContext.tsx`
  - Chamar `link-user-to-company` após inicializar BX24
  - Atualizar `companyId` automaticamente
  
- `src/hooks/useCompany.ts`
  - Adicionar parâmetro opcional `memberId` para buscar empresa alternativa
  - Priorizar busca por `bitrix_member_id` quando disponível

- `src/components/setup/SetupWizard.tsx`
  - Detectar se empresa já existe via Bitrix
  - Pular passo de empresa automaticamente

- `src/components/setup/steps/CompanySetup.tsx`
  - Mostrar "Empresa vinculada" em vez de formulário quando via Bitrix

- `src/components/layout/AppLayout.tsx`
  - Remover/esconder botão de reset de sessão

## Fluxo Final (como vai funcionar)

```text
+---------------------+
|  Usuário abre app   |
|  dentro do Bitrix   |
+---------------------+
          |
          v
+---------------------+
|  BX24.init()        |
|  Obtém member_id    |
+---------------------+
          |
          v
+---------------------+
|  link-user-to-      |
|  company (edge fn)  |
+---------------------+
          |
    +-----+-----+
    |           |
    v           v
+--------+  +--------+
| Existe |  |  Não   |
| empresa|  | existe |
+--------+  +--------+
    |           |
    v           v
+--------+  +--------+
| Vincula|  | Mostra |
| usuário|  | erro   |
+--------+  +--------+
    |
    v
+---------------------+
|  Setup Wizard       |
|  Pula para passo 2  |
|  (Credenciais)      |
+---------------------+
```

## Critérios de Sucesso

1. Abrir app dentro do Bitrix: empresa aparece automaticamente vinculada
2. Não mostra formulário de "Criar Empresa"
3. Sem botão de "sair/reset" no header
4. Recarregar página mantém empresa vinculada
5. Múltiplos usuários do portal Bitrix veem mesma empresa

## Riscos e Mitigações

- **Modo desenvolvimento** (fora do Bitrix): Manter comportamento atual de criar empresa manualmente
- **Empresas órfãs**: Script de limpeza ou deixar usuário escolher se já existe empresa com mesmo `member_id`

