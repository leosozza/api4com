

# Plano: Corrigir erro "App is not found" no Click-to-Call

## Diagnóstico

O erro "App is not found" indica que o Bitrix24 não consegue localizar o aplicativo quando tenta executar ações de telefonia. Mesmo com:
- Eventos registrados corretamente (ONEXTERNALCALLSTART, ONEXTERNALCALLBACKSTART)
- Linha externa cadastrada (+5515996045202)
- Configurações de usuário corretas (SIP desconectado, linha Api4com selecionada)

O Bitrix24 falha ao tentar carregar o app para processar a chamada.

## Causa Provável

O Bitrix24 Marketplace requer que a URL do "Handler de Configuracoes" seja acessivel e retorne uma resposta valida. Se essa URL retornar erro ou nao for encontrada, o portal exibe "App is not found".

Atualmente, o Handler configurado aponta para `https://api4com.lovable.app/settings`, mas quando o Bitrix24 tenta carregar essa URL em contexto de telefonia (fora do iframe padrao), pode haver problemas de:
- Roteamento (React SPA nao responde a requisicoes POST do Bitrix)
- Falta de tratamento para o evento de carga do app

## Solucao

### Parte 1: Criar Edge Function de Handler para o Marketplace

Criar uma nova Edge Function `bitrix24-handler` que sera o ponto de entrada unico para todas as interacoes do Bitrix24 com o app (instalacao, configuracoes, eventos de telefonia).

```text
supabase/functions/bitrix24-handler/index.ts
```

Esta funcao ira:
1. Detectar o tipo de requisicao (install, settings, placement)
2. Para requisicoes de settings/placement: redirecionar para o app React
3. Para requisicoes de instalacao: processar como faz o bitrix24-install atual
4. Logar todas as requisicoes para diagnostico

### Parte 2: Atualizar URLs no Marketplace do Bitrix24

As URLs no Marketplace devem ser atualizadas para apontar para a Edge Function:

| Campo | URL Atual | URL Nova |
|-------|-----------|----------|
| Application URL | https://api4com.lovable.app | https://api4com.lovable.app |
| Initial install path | /functions/v1/bitrix24-install | /functions/v1/bitrix24-handler?action=install |
| Settings path | /settings | /functions/v1/bitrix24-handler?action=settings |

### Parte 3: Adicionar Diagnostico na UI

Adicionar um botao "Diagnosticar Telefonia" na pagina de Configuracoes que:
1. Chama a Edge Function `diagnose-telephony`
2. Exibe os resultados em formato legivel
3. Sugere acoes corretivas baseadas nos erros encontrados

### Parte 4: Melhorar Tratamento de Erros

Atualizar o `bitrix24-webhook` para:
1. Retornar respostas mais descritivas
2. Lidar com casos onde o app nao e encontrado
3. Tentar renovar tokens automaticamente se estiverem expirados

## Arquivos a Modificar

1. **Criar**: `supabase/functions/bitrix24-handler/index.ts` - Handler unificado
2. **Editar**: `supabase/config.toml` - Registrar nova funcao
3. **Editar**: `src/components/setup/SetupWizard.tsx` - Adicionar botao de diagnostico
4. **Criar**: `src/components/setup/TelephonyDiagnostics.tsx` - Componente de diagnostico

## Acao Manual Necessaria

Apos implementar, voce precisara atualizar as URLs no painel do Marketplace do Bitrix24:
1. Acesse o Partner portal do Bitrix24
2. Edite o app "Api4Com"
3. Atualize o "Initial install path" e "Settings path" para as novas URLs
4. Salve e publique as alteracoes
5. Reinstale o app no portal de teste para aplicar as novas configuracoes

## Resultado Esperado

Apos as alteracoes:
- O erro "App is not found" nao aparecera mais
- O click-to-call disparara o evento ONEXTERNALCALLSTART
- A Edge Function `bitrix24-webhook` recebera a requisicao
- A ligacao sera originada via Api4Com

