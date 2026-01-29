

## Plano: Corrigir Erro "App is not found" no Bitrix24 Telephony

### Diagnostico do Problema

A mensagem **"App is not found"** indica que:

1. **Os eventos de telefonia nao estao registrados**: O Bitrix24 nao sabe para onde enviar os eventos `ONEXTERNALCALLSTART` quando voce clica em um numero de telefone

2. **Token OAuth expirado**: O `access_token` nas credenciais expirou em `2026-01-28 16:40:53` e precisa ser renovado via `refresh_token`

3. **Linha externa nao registrada**: O Bitrix24 Contact Center precisa ter uma linha externa registrada via `telephony.externalLine.add` para que o app apareca nas opcoes de telefonia

### Fluxo Atual vs Esperado

```text
ATUAL:
Usuario clica no telefone no CRM
    → Bitrix procura um handler para ONEXTERNALCALLSTART
    → Nao encontra (evento nao registrado)
    → Exibe "App is not found"

ESPERADO:
Usuario clica no telefone no CRM
    → Bitrix dispara ONEXTERNALCALLSTART para o webhook registrado
    → Edge function bitrix24-webhook recebe o evento
    → Sistema busca mapeamento do usuario
    → Origina chamada via Api4Com
    → WebPhone toca
```

### Solucao Proposta

#### 1. Criar Edge Function para Registro Manual de Eventos

Nova funcao `register-telephony-events` que:
- Renova o token OAuth usando o refresh_token
- Registra eventos `ONEXTERNALCALLSTART` e `ONEXTERNALCALLBACKSTART`
- Registra linha externa no Contact Center via `telephony.externalLine.add`

**Endpoint**: `POST /functions/v1/register-telephony-events`

**Codigo**:
```typescript
// supabase/functions/register-telephony-events/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// 1. Buscar credenciais do Bitrix24 para a empresa
// 2. Renovar access_token usando refresh_token
// 3. Registrar evento ONEXTERNALCALLSTART
// 4. Registrar evento ONEXTERNALCALLBACKSTART  
// 5. Registrar linha externa (telephony.externalLine.add)
// 6. Atualizar tokens no banco
```

#### 2. Adicionar Botao no Setup Wizard

Adicionar secao no `SetupWizard.tsx` ou pagina de Settings com:
- Botao "Registrar Eventos de Telefonia"
- Indicador de status (registrado/nao registrado)
- Feedback visual do resultado

#### 3. Atualizar bitrix24-install para Tratamento de Erros

Melhorar o registro automatico durante instalacao:
- Adicionar logs detalhados de sucesso/falha
- Armazenar status do registro de eventos no banco
- Permitir re-registro manual caso falhe

### Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/functions/register-telephony-events/index.ts` | CRIAR | Edge function para registro manual de eventos |
| `supabase/config.toml` | MODIFICAR | Adicionar config da nova funcao |
| `src/components/setup/steps/PhoneLinesSetup.tsx` | MODIFICAR | Adicionar botao de registro de eventos |
| `src/hooks/useBitrix.ts` | MODIFICAR | Adicionar metodo para chamar a nova funcao |

### Detalhes Tecnicos

#### Renovacao de Token OAuth

```typescript
const refreshResponse = await fetch(`https://oauth.bitrix.info/oauth/token/`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    client_id: BITRIX_CLIENT_ID,
    client_secret: BITRIX_CLIENT_SECRET,
    refresh_token: credentials.refresh_token,
  }),
});
```

#### Registro de Evento

```typescript
await fetch(`https://${domain}/rest/event.bind`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    auth: access_token,
    event: "ONEXTERNALCALLSTART",
    handler: `${SUPABASE_URL}/functions/v1/bitrix24-webhook`,
  }),
});
```

#### Registro de Linha Externa

```typescript
await fetch(`https://${domain}/rest/telephony.externalLine.add`, {
  method: "POST", 
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    auth: access_token,
    NUMBER: phoneLineNumber, // ex: "+5511999999999"
    NAME: "Api4Com",
  }),
});
```

### Segredos Necessarios

A renovacao de tokens OAuth requer:
- `BITRIX_CLIENT_ID`: ID do aplicativo no Marketplace
- `BITRIX_CLIENT_SECRET`: Secret do aplicativo no Marketplace

Estes precisam ser configurados como secrets no projeto.

### Fluxo de Teste Apos Implementacao

1. Acesse Configuracoes no app
2. Clique em "Registrar Eventos de Telefonia"
3. Aguarde confirmacao de sucesso
4. Acesse Telefonia no Bitrix24
5. Clique em um numero de telefone no CRM
6. Verifique se o WebPhone recebe a chamada

### Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Token de refresh tambem expirou | Solicitar reinstalacao do app |
| Permissoes insuficientes no app | Verificar escopos no Marketplace |
| Rate limiting do Bitrix API | Adicionar retry com backoff |

