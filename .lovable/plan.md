

# Plano: Resolver "App is not found" e Configurar o Conector Corretamente

## Status Atual (O que JA esta funcionando)

Baseado nos logs de diagnostico mais recentes:

| Item | Status | Valor |
|------|--------|-------|
| Eventos registrados | OK | ONEXTERNALCALLSTART, ONEXTERNALCALLBACKSTART |
| Linha externa no Bitrix | OK | +5515996045202 (Api4Com) |
| Provedor de saida | OK | +5515996045202 |
| Mapeamento de usuario | OK | User 1 → Ramal 1000 |
| App instalado | OK | thoth24_solution.api4com (STATUS: F = Free) |

## Problema

Quando voce clica para ligar, o Bitrix24 mostra "App is not found" porque ele nao consegue carregar a URL do aplicativo. Isso acontece porque as URLs no Partner Portal podem estar apontando para locais inacessiveis.

## Solucao

### Passo 1: Atualizar URLs no Partner Portal do Bitrix24

Acesse o Partner Portal e edite o app "Api4Com" com estas URLs:

```text
Application URL (URL principal): 
https://api4com.lovable.app

Initial install path (Caminho de instalacao):
https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=install

Settings path (Caminho de configuracoes):
https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=settings
```

### Passo 2: Verificar Permissoes do App

No Partner Portal, confirme que o app tem estas permissoes (scopes):
- telephony
- crm
- user
- placement

### Passo 3: Reinstalar o App no Portal de Teste

1. Acesse o portal thoth24.bitrix24.com.br
2. Va em Aplicativos → Aplicativos instalados
3. Encontre "Api4Com" e clique em "Desinstalar"
4. Reinstale o app novamente

### Passo 4: Reconfigurar a Linha no Contact Center

Apos reinstalar:
1. Va em Contact Center → Linhas Telefonicas
2. Localize a linha Api4Com (+5515996045202)
3. Clique nela e atribua aos usuarios desejados
4. Defina como linha padrao para chamadas de saida

### Passo 5: Testar o Click-to-Call

1. Abra um contato/lead no CRM
2. Clique no numero de telefone
3. O evento deve ser enviado para nosso webhook

## Melhorias no Codigo (Opcional)

Se o problema persistir apos os passos acima, podemos adicionar:

1. **Adicionar suporte a HEAD no bitrix24-webhook** - O Bitrix24 envia requisicoes HEAD para validar endpoints antes de enviar eventos. Precisamos garantir que nosso webhook responde corretamente.

2. **Melhorar logs de debug** - Adicionar mais detalhes nos logs para rastrear exatamente onde o problema ocorre.

## Resultado Esperado

Apos atualizar as URLs e reinstalar o app:
1. O erro "App is not found" nao deve mais aparecer
2. Ao clicar para ligar, o evento ONEXTERNALCALLSTART sera enviado para o webhook
3. O webhook registrara a chamada e iniciara o fluxo com a Api4Com

## Resumo das URLs Importantes

| Funcao | URL |
|--------|-----|
| App Principal | https://api4com.lovable.app |
| Handler Instalacao | https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=install |
| Handler Configuracoes | https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-handler?action=settings |
| Webhook de Eventos | https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-webhook |

