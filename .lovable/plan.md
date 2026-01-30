
# Plano: Corrigir Vinculação de Chamadas ao Deal Correto

## Problema Identificado

Quando você clica em um telefone no Deal 90, o Bitrix24 envia um `CALL_ID` único (`externalCall.bc2f40df...`). Porém, quando a chamada termina:

1. O `bitrix24-webhook` salva o `api4com_call_id` retornado pelo dialer
2. O `api4com-webhook` recebe um ID **diferente** no evento `channel-hangup`
3. Como os IDs não correspondem, o sistema não encontra o registro existente
4. Ele cria um **novo registro** no Bitrix24 com `CRM_CREATE=1`, gerando o Deal 94

```text
+------------------+     +------------------+     +------------------+
| Bitrix24 Deal 90 |     | bitrix24-webhook |     | api4com-webhook  |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        | CALL_ID: bc2f40df...   |                        |
        |----------------------->|                        |
        |                        | api4com_id: d7156dca...|
        |                        |----------------------->|
        |                        |                        |
        |                        |      hangup id: 190678fc...
        |                        |<-----------------------|
        |                        |   (IDs NÃO BATEM!)     |
        |                        |                        |
        |   CRM_CREATE=1 → Deal 94 criado!               |
        |<-----------------------------------------------|
```

## Solução

Usar o `bitrix_call_id` (do metadata) como chave de busca secundária, além do `api4com_call_id`.

---

## Alterações Técnicas

### 1. Modificar `api4com-webhook/index.ts`

**Função `handleCallHangup`** (linhas ~303-310):

Atualmente busca apenas por `api4com_call_id`:
```typescript
const { data: existingCall } = await supabase
  .from("call_logs")
  .select("id, bitrix_call_id")
  .eq("api4com_call_id", body.id)  // ← Apenas este critério
  .maybeSingle();
```

**Correção - buscar também pelo `bitrix_call_id` do metadata:**
```typescript
// Primeiro tenta pelo api4com_call_id
let existingCall = null;
const { data: callByApi4comId } = await supabase
  .from("call_logs")
  .select("id, bitrix_call_id, api4com_call_id")
  .eq("company_id", companyId)
  .eq("api4com_call_id", body.id)
  .maybeSingle();

existingCall = callByApi4comId;

// Se não encontrou, tenta pelo bitrix_call_id do metadata
if (!existingCall && body.metadata?.bitrixCallId) {
  console.log("Searching by bitrix_call_id:", body.metadata.bitrixCallId);
  const { data: callByBitrixId } = await supabase
    .from("call_logs")
    .select("id, bitrix_call_id, api4com_call_id")
    .eq("company_id", companyId)
    .eq("bitrix_call_id", body.metadata.bitrixCallId)
    .maybeSingle();
  
  existingCall = callByBitrixId;
}
```

### 2. Atualizar o `api4com_call_id` quando encontrado pelo Bitrix ID

Quando encontrar pelo `bitrix_call_id`, atualizar o `api4com_call_id` para ter consistência:

```typescript
if (existingCall) {
  // Atualiza o api4com_call_id se encontrou pelo bitrix_call_id
  const updateData: Record<string, unknown> = {
    status: callStatus,
    duration_seconds: body.duration || 0,
    recording_url: body.recordUrl || null,
    call_ended_at: body.endedAt,
  };
  
  // Se encontrou pelo bitrix_call_id, atualiza o api4com_call_id
  if (!existingCall.api4com_call_id) {
    updateData.api4com_call_id = body.id;
  }
  
  await supabase
    .from("call_logs")
    .update(updateData)
    .eq("id", existingCall.id);
}
```

### 3. Usar o `bitrix_call_id` existente no finish (NÃO chamar register)

Quando encontrar um registro existente, usar o `bitrix_call_id` original para chamar `telephony.externalcall.finish` **sem criar novo registro**:

```typescript
// Finish call in Bitrix24 usando o CALL_ID original
if (userMapping?.bitrix24_user_id && existingCall.bitrix_call_id) {
  await finishBitrix24Call(supabase, companyId, {
    call_id: existingCall.bitrix_call_id,  // ← ID original do Bitrix
    user_id: userMapping.bitrix24_user_id,
    duration: body.duration || 0,
    status_code: getBitrixStatusCode(callStatus),
    recording_url: body.recordUrl,
  });
}
```

---

## Resultado Esperado

Após a correção:

1. Click-to-call no Deal 90 → Bitrix envia `CALL_ID: bc2f40df...`
2. `bitrix24-webhook` salva com `bitrix_call_id: bc2f40df...`
3. `api4com-webhook` recebe hangup → Busca por `bitrix_call_id` → **ENCONTRA!**
4. Chama `telephony.externalcall.finish` com o `CALL_ID` original
5. Gravação e informações aparecem no **Deal 90** (não cria novo Deal)

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/api4com-webhook/index.ts` | Adicionar busca secundária por `bitrix_call_id` e evitar `CRM_CREATE` duplicado |

---

## Benefícios

- Chamadas iniciadas pelo click-to-call serão corretamente vinculadas ao Deal de origem
- Gravações e métricas aparecerão no histórico correto
- Não haverá criação de Deals duplicados
