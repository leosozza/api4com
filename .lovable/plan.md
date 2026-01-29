

# Plano: Corrigir "App is not found" - Problema de Instalacao Incompleta

## Analise da Documentacao Oficial

Baseado na documentacao do Bitrix24 Developer Hub:

1. **O erro "App is not found" ocorre porque o Bitrix24 considera o app NAO INSTALADO**
2. **Eventos (como ONEXTERNALCALLSTART) NAO sao enviados ate a instalacao estar completa**
3. **Para apps com interface, e OBRIGATORIO chamar `BX24.installFinish()` corretamente**

### Trecho da documentacao:
> "Until the application sends a signal indicating the completion of installation via installFinish, the application will be considered not configured. Functionality will be blocked. Events will not be sent to the handler, even after a successful event.bind."

## Causa Raiz Identificada

O problema esta na forma como o app esta configurado no Partner Portal:

| Configuracao | Valor Atual (Provavel) | Valor Correto |
|--------------|------------------------|---------------|
| Application URL | URL da SPA React | Edge Function Handler |
| Initial install path | Pode estar errado | `...bitrix24-handler?action=install` |
| Tipo de app | Com interface | Com interface (requer installFinish) |

## Solucao Completa

### Passo 1: Verificar se o App esta Marcado como Instalado

Adicionar uma verificacao no diagnostico que chama `app.info` para ver se `INSTALLED: true` ou `INSTALLED: false`.

Se `INSTALLED: false`, o app precisa ser reinstalado ou o `installFinish()` nunca foi chamado corretamente.

### Passo 2: Atualizar URLs no Partner Portal

No Bitrix24 Partner Portal, configure:

```text
Application URL (onde o app abre normalmente):
https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=settings

Initial install path (caminho de instalacao):
https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=install

Settings path (configuracoes do app):
https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=settings
```

IMPORTANTE: A "Application URL" deve apontar para o handler que carrega o SDK BX24 e depois redireciona para a SPA, nao diretamente para a SPA.

### Passo 3: Modificar o Handler para Suportar GET

O Bitrix24 abre o app via GET (iframe), mas nosso handler pode nao estar tratando isso corretamente quando e a "Application URL".

Mudancas no `bitrix24-handler`:
- Adicionar suporte a GET requests para action=settings (carregamento do app)
- Garantir que a pagina HTML retornada inicializa BX24 SDK antes de redirecionar

### Passo 4: Adicionar Verificacao de Status no Diagnostico

Implementar chamada `app.info` no diagnostico para mostrar:
- `INSTALLED: true` = App instalado corretamente
- `INSTALLED: false` = Precisa reinstalar

### Passo 5: Reinstalar o App

Apos atualizar as URLs:
1. Desinstalar o app atual em thoth24.bitrix24.com.br
2. Reinstalar o app
3. A pagina de instalacao (handler?action=install) deve:
   - Mostrar mensagem de instalacao
   - Chamar `BX24.installFinish()`
   - Redirecionar para configuracoes

## Mudancas de Codigo

### Arquivo 1: `supabase/functions/bitrix24-handler/index.ts`

Modificar para:
1. Tratar GET requests (quando o Bitrix24 abre o app no iframe)
2. Garantir que a pagina HTML inicializa o SDK antes de redirecionar
3. Adicionar logs para debug

### Arquivo 2: `supabase/functions/diagnose-telephony/index.ts`

Adicionar:
1. Chamada `app.info` para verificar status de instalacao
2. Retornar `isInstalled: true/false` no resultado

### Arquivo 3: `src/components/setup/TelephonyDiagnostics.tsx`

Mostrar:
1. Badge indicando se o app esta instalado ou nao
2. Instrucao clara para reinstalar se `INSTALLED: false`

## Fluxo Esperado Apos Correcao

```text
1. Usuario abre o app no Bitrix24
   ↓
2. Bitrix24 faz GET em: bitrix24-handler?action=settings
   ↓
3. Handler retorna HTML com BX24 SDK
   ↓
4. HTML inicializa BX24.init() e redireciona para SPA
   ↓
5. SPA carrega normalmente dentro do iframe
   ↓
6. Click-to-call no CRM dispara ONEXTERNALCALLSTART
   ↓
7. Evento chega no bitrix24-webhook
```

## Resultado Esperado

- O erro "App is not found" desaparece
- O app abre normalmente no iframe do Bitrix24
- Eventos de telefonia sao enviados para o webhook
- Click-to-call funciona

