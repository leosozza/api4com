

# Adaptação para Marketplace do Bitrix24

## Contexto
A aplicação atual usa autenticação própria (email/senha) e roda como aplicação standalone. Para funcionar no **Marketplace do Bitrix24**, precisa ser convertida para rodar dentro do iframe do Bitrix, usando o SDK `BX24` e obtendo credenciais automaticamente via OAuth durante a instalação.

---

## Mudanças Necessárias

### 1. Integração com SDK BX24

**Adicionar script do Bitrix24 no HTML:**
```text
index.html -> adicionar script BX24
```

**Criar hook React para o SDK:**
- Inicializar `BX24.init()` ao carregar a aplicação
- Obter dados de autenticação automaticamente do contexto
- Disponibilizar métodos `BX24.callMethod()` para chamadas REST
- Detectar se está rodando dentro do iframe do Bitrix

---

### 2. Novo Fluxo de Autenticação

**Substituir login próprio por autenticação via Bitrix:**
- Quando o app é instalado, o Bitrix envia evento `ONAPPINSTALL` com tokens OAuth
- Armazenar `access_token`, `refresh_token`, `domain` e `member_id` no banco
- Usar `member_id` como identificador único da empresa (tenant)

**Remover:**
- Tela de login/signup atual (AuthForm)
- Autenticação email/senha

**Adicionar:**
- Detecção automática do contexto Bitrix
- Fallback para modo desenvolvimento (sem iframe)

---

### 3. Nova Edge Function: `bitrix24-install`

Processar o evento de instalação do app:
- Receber dados do `ONAPPINSTALL`
- Criar/atualizar registro da empresa usando `member_id`
- Salvar credenciais OAuth automaticamente
- Retornar sucesso para o Bitrix finalizar instalação

---

### 4. Ajustes no Banco de Dados

**Modificar tabela `bitrix24_credentials`:**
- Adicionar coluna `member_id` (identificador único do portal)
- Adicionar coluna `client_endpoint` (URL REST do portal)

**Ajustar identificação de empresa:**
- Usar `member_id` do Bitrix como chave de tenant
- Permitir que uma empresa seja identificada pelo contexto do Bitrix

---

### 5. Ajustes no Frontend

**Novo contexto Bitrix:**
```text
src/contexts/BitrixContext.tsx
- Gerenciar estado do BX24
- Prover dados de autenticação para toda a aplicação
```

**Simplificar Setup Wizard:**
- Remover step de credenciais Bitrix (obtido automaticamente)
- Manter apenas: Api4Com token, mapeamento de usuários, linhas telefônicas

**Adaptar para iframe:**
- Remover navegação por URL (usar estados)
- Ajustar layout para funcionar dentro do Bitrix

---

### 6. Handlers de Eventos Bitrix

**Registrar webhooks durante instalação:**
- `ONEXTERNALCALLSTART` - Click-to-call
- `ONEXTERNALCALLBACKSTART` - Chamada de retorno

**Endpoint para processar eventos:**
- Atualizar edge function `bitrix24-webhook` para novos eventos

---

## Arquitetura Final

```text
+------------------+     ONAPPINSTALL      +-------------------+
|   Bitrix24       | ------------------->  | bitrix24-install  |
|   Marketplace    |                       | (Edge Function)   |
+------------------+                       +-------------------+
        |                                          |
        | OAuth tokens                             | Salvar credenciais
        v                                          v
+------------------+     BX24.init()       +-------------------+
|   App no iframe  | <-------------------  | Lovable Cloud     |
|   (React + BX24) |                       | (Supabase)        |
+------------------+                       +-------------------+
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `index.html` | Adicionar script BX24 |
| `src/contexts/BitrixContext.tsx` | Novo - gerenciar SDK BX24 |
| `src/hooks/useBitrix.ts` | Novo - hook para usar contexto |
| `src/types/bitrix24.d.ts` | Novo - tipagem TypeScript do BX24 |
| `src/App.tsx` | Modificar - usar BitrixProvider |
| `src/components/auth/AuthForm.tsx` | Remover ou adaptar para fallback |
| `supabase/functions/bitrix24-install/` | Novo - handler de instalação |
| `supabase/functions/bitrix24-webhook/` | Modificar - mais eventos |

---

## Detalhes Técnicos

### Tipagem do BX24 (TypeScript)

```text
interface BX24Auth {
  access_token: string;
  refresh_token: string;
  domain: string;
  member_id: string;
  client_endpoint: string;
}

interface BX24 {
  init(callback: () => void): void;
  callMethod(method: string, params?: object, callback?: Function): void;
  getAuth(): BX24Auth;
  installFinish(): void;
  isAdmin(): boolean;
  getLang(): string;
}
```

### Migração SQL

```text
ALTER TABLE bitrix24_credentials 
ADD COLUMN member_id TEXT UNIQUE,
ADD COLUMN client_endpoint TEXT;
```

---

## Requisitos para Publicação no Marketplace

Após implementação, você precisará:

1. **Registrar como desenvolvedor** no Bitrix24 Partner Portal
2. **Criar aplicação** com as seguintes configurações:
   - URL do app: URL publicada do Lovable
   - Handler de instalação: URL da edge function `bitrix24-install`
   - Escopos: `telephony`, `crm`, `user`
3. **Submeter para aprovação** do Bitrix24

