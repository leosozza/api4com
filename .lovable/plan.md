
# Plano: Reenviar telephony.externalcall.finish para Deal 134

## Diagnóstico

O `telephony.externalcall.finish` falhou porque o **access_token do Bitrix24 expirou em 2 de fevereiro de 2026**. A chamada ocorreu em 18 de fevereiro, logo todas as chamadas à API do Bitrix24 falharam silenciosamente.

**Dados da chamada:**
- Bitrix Call ID: `externalCall.d58222b22d4e11e3d273c9b174a08d9e.1771443560`
- Bitrix User ID: `1`
- Duração: 180 segundos
- Status: completed (code 200)
- Gravação: `https://listener.api4com.com/files/listen/a6f1f205-1232-4705-a53f-599e3241826d.mp3`
- Endpoint: `https://thoth24.bitrix24.com.br/rest/`

## O que será feito

### 1. Criar Edge Function `retry-call-finish`

Uma função que:
1. Renova o token OAuth usando o `refresh_token` existente (via `https://oauth.bitrix.info/oauth/token/`)
2. Salva o novo token no banco de dados
3. Envia `telephony.externalcall.finish` com os dados da chamada e a URL da gravação
4. Retorna o resultado da operação

A function será chamada via POST com o `company_id` no body, e os dados da chamada estarão hardcoded para esta operação específica.

### 2. Configuração

Adicionar ao `supabase/config.toml`:
```toml
[functions.retry-call-finish]
verify_jwt = false
```

### 3. Executar e Testar

Após deploy, chamar a function para reenviar o finish e verificar se a gravação foi vinculada ao deal no Bitrix24.

---

## Detalhes Técnicos

**Fluxo da function:**

```text
1. Buscar credenciais Bitrix24 (company_id: 82e09b93...)
2. Renovar OAuth token via oauth.bitrix.info
3. Salvar novo token no banco
4. POST telephony.externalcall.finish com:
   - CALL_ID: externalCall.d58222b2...
   - USER_ID: 1
   - DURATION: 180
   - STATUS_CODE: 200
   - RECORD_URL: https://listener.api4com.com/files/listen/a6f1f205...mp3
5. Retornar resultado
```

**Problema raiz a resolver depois:** O `api4com-webhook` não faz refresh de token antes de chamar o Bitrix24. Isso deve ser corrigido para evitar falhas futuras.
