
# Plano de Integração Completa com WebPhone Api4Com

## Resumo Executivo

Este plano implementa a integração completa entre o WebPhone da Api4Com e o Bitrix24, incluindo:
- **Click-to-Call**: Iniciar chamadas direto do CRM Bitrix24
- **Configuração Automática de Webhooks**: Registrar webhook na Api4Com automaticamente
- **Recebimento de Eventos v1.4**: Processar eventos de chamada no formato correto da Api4Com

## Análise do Estado Atual

### O que já existe:
- Tabelas de banco de dados: `api4com_credentials`, `user_mappings`, `call_logs`, `bitrix24_credentials`
- Edge function `bitrix24-webhook` com lógica de Click-to-Call (parcialmente implementada)
- Edge function `api4com-webhook` com formato de eventos **incorreto**
- Setup Wizard para configurar credenciais

### Problemas Identificados:
1. **Formato de webhook incompatível**: O código atual espera campos como `event`, `call_id`, `extension`, mas a Api4Com v1.4 envia `eventType`, `caller`, `called`, `recordUrl`
2. **Click-to-Call não implementado**: A função `originateCall()` está como placeholder
3. **Webhook não configurado automaticamente**: O usuário precisa configurar manualmente na Api4Com

---

## Fase 1: Atualizar Webhook Api4Com para formato v1.4

### Arquivo: `supabase/functions/api4com-webhook/index.ts`

Reescrever completamente para processar o formato correto:

```text
Formato v1.4 da Api4Com:
{
  "version": "v1.4",
  "eventType": "channel-hangup",
  "id": "uuid-da-chamada",
  "domain": "empresa.api4com.com",
  "direction": "outbound" | "inbound",
  "caller": "1000",           // ramal
  "called": "04833328530",    // numero discado
  "startedAt": "2025-01-01 00:00:00",
  "answeredAt": "2025-01-01 00:00:05",
  "endedAt": "2025-01-01 00:00:10",
  "duration": 5,
  "hangupCause": "NORMAL_CLEARING",
  "hangupCauseCode": "16",
  "recordUrl": "https://...",
  "metadata": { ... }
}
```

**Alteracoes necessarias:**
- Criar nova interface `Api4ComWebhookV14` com campos corretos
- Identificar empresa pelo campo `domain` ou `metadata.gateway`
- Mapear `caller` (ramal) para encontrar o `user_mapping`
- Mapear `called` para o `phone_number`
- Usar `eventType: "channel-hangup"` como evento principal
- Extrair `recordUrl` para gravacao
- Calcular status baseado em `hangupCause`

---

## Fase 2: Implementar Click-to-Call via Api4Com API

### Arquivo: `supabase/functions/bitrix24-webhook/index.ts`

Implementar a funcao `originateCall()` corretamente:

```text
Endpoint Api4Com: POST https://api.api4com.com/api/v1/dialer
Headers: Authorization: <token>
Body: {
  "extension": "1000",
  "phone": "+554833328530",
  "metadata": {
    "gateway": "bitrix24-integration",
    "bitrixUserId": "123",
    "companyId": "uuid"
  }
}
```

**Alteracoes necessarias:**
- Implementar chamada real para `https://api.api4com.com/api/v1/dialer`
- Enviar metadata com identificadores para rastreamento
- Tratar erros e retornar resposta adequada ao Bitrix24

---

## Fase 3: Configuracao Automatica de Webhook

### Nova Edge Function: `supabase/functions/api4com-setup/index.ts`

Criar funcao para configurar webhook automaticamente quando usuario salvar token:

```text
Endpoint Api4Com: PATCH https://api.api4com.com/api/v1/integrations
Headers: Authorization: <token>
Body: {
  "gateway": "bitrix24-connector",
  "webhook": true,
  "webhookConstraint": {
    "metadata": {
      "gateway": "bitrix24-connector"
    }
  },
  "metadata": {
    "webhookUrl": "https://xdyumezeouultnxssnlc.supabase.co/functions/v1/api4com-webhook",
    "webhookVersion": "v1.4",
    "webhookTypes": ["channel-hangup"]
  }
}
```

### Atualizar: `src/components/setup/steps/CredentialsSetup.tsx`

- Ao salvar token Api4Com, chamar edge function `api4com-setup`
- Mostrar status de configuracao do webhook
- Exibir erros se a configuracao falhar

---

## Fase 4: Atualizar Banco de Dados

### Nova coluna na tabela `api4com_credentials`:

```sql
ALTER TABLE api4com_credentials 
ADD COLUMN api4com_domain text,
ADD COLUMN webhook_configured boolean DEFAULT false;
```

Armazenar o dominio da Api4Com para identificar a empresa nos webhooks.

---

## Fase 5: Melhorar Processamento de Chamadas

### Atualizar: `supabase/functions/api4com-webhook/index.ts`

Logica de processamento:

1. Receber evento `channel-hangup`
2. Identificar empresa por `domain` ou `metadata.gateway`
3. Encontrar mapeamento de usuario pelo `caller` (ramal)
4. Determinar direcao da chamada (`direction`)
5. Calcular status final baseado em:
   - `answeredAt` existe -> chamada atendida
   - `duration > 0` -> chamada completada
   - `hangupCause` = "NO_ANSWER" -> chamada perdida
6. Criar/atualizar registro em `call_logs`
7. Notificar Bitrix24 via `telephony.externalcall.finish`

---

## Diagrama de Fluxo

```text
+----------------+     +----------------+     +------------------+
|   Bitrix24     |     |    Lovable     |     |    Api4Com       |
|    CRM         |     |    Backend     |     |    WebPhone      |
+----------------+     +----------------+     +------------------+
        |                      |                       |
        |  1. Click-to-Call    |                       |
        |--------------------->|                       |
        |                      |  2. POST /dialer      |
        |                      |---------------------->|
        |                      |                       |
        |                      |  3. Chamada iniciada  |
        |                      |<----------------------|
        |                      |                       |
        |                      |  4. webhook hangup    |
        |                      |<----------------------|
        |                      |                       |
        |  5. externalcall.    |                       |
        |     finish           |                       |
        |<---------------------|                       |
        |                      |                       |
```

---

## Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/functions/api4com-webhook/index.ts` | Reescrever | Formato v1.4 |
| `supabase/functions/bitrix24-webhook/index.ts` | Modificar | Click-to-Call real |
| `supabase/functions/api4com-setup/index.ts` | Criar | Config automatica webhook |
| `src/components/setup/steps/CredentialsSetup.tsx` | Modificar | Chamar setup automatico |
| `src/types/api4com.ts` | Modificar | Novos tipos v1.4 |
| `supabase/config.toml` | Modificar | Adicionar nova funcao |
| Migracao SQL | Criar | Novas colunas |

---

## Detalhes Tecnicos

### Interface do Webhook v1.4

```typescript
interface Api4ComWebhookV14 {
  version: "v1.4";
  eventType: "channel-hangup";
  id: string;
  domain: string;
  direction: "inbound" | "outbound";
  caller: string;
  called: string;
  startedAt: string;
  answeredAt?: string;
  endedAt: string;
  duration: number;
  hangupCause: string;
  hangupCauseCode: string;
  recordUrl?: string;
  metadata?: {
    gateway?: string;
    bitrixUserId?: string;
    companyId?: string;
    [key: string]: unknown;
  };
}
```

### Mapeamento de Status

```typescript
const getCallStatus = (event: Api4ComWebhookV14): string => {
  if (!event.answeredAt) return "missed";
  if (event.duration > 0) return "completed";
  if (event.hangupCause === "USER_BUSY") return "busy";
  if (event.hangupCause === "NO_ANSWER") return "missed";
  return "completed";
};
```

### Configuracao do supabase/config.toml

```toml
[functions.api4com-setup]
verify_jwt = false
```

---

## Ordem de Implementacao

1. **Migracao SQL** - Adicionar colunas necessarias
2. **api4com-webhook** - Reescrever para formato v1.4
3. **api4com-setup** - Criar funcao de configuracao automatica
4. **bitrix24-webhook** - Implementar Click-to-Call real
5. **CredentialsSetup.tsx** - Integrar configuracao automatica
6. **Tipos TypeScript** - Atualizar interfaces

---

## Resultado Final

Apos a implementacao:

1. Usuario instala app no Bitrix24
2. No Setup Wizard, insere token da Api4Com
3. Sistema configura webhook automaticamente na Api4Com
4. Click-to-Call funciona do Bitrix24 para o WebPhone
5. Eventos de chamada sao recebidos no formato v1.4
6. Chamadas sao registradas no Bitrix24 com gravacoes
7. Dashboard mostra metricas em tempo real

