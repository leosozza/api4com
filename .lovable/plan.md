# Corrigir tenant SciTec (e a fragmentação de empresas por portal)

## O que está acontecendo

A instalação no portal `scitec.bitrix24.com.br` (05/08) criou a empresa `Portal scitec.bitrix24.com.br` com o `member_id` e as credenciais Bitrix24 — mas ela está com **0 membros e nenhum token Api4Com**.

Enquanto isso, o usuário que aparece na tela está ligado à empresa manual `DualWin Consultoria Empresarial` (criada em 19/05), e foi **nela** que o token Api4Com `scitec.api4com.com` foi salvo. Por isso a tela mostra "Bitrix24 Conectado: scitec.bitrix24.com.br" (vem do contexto do iframe) sob o nome "DualWin" — são dois registros diferentes.

Resultado: os webhooks e as funções de telefonia procuram a empresa pelo `member_id` do portal, caem na empresa do portal (sem token Api4Com, sem linha, sem mapeamento) e nada funciona.

Dois problemas confirmados nos dados:

1. **Dados divididos entre duas empresas** do mesmo portal (a do portal e a manual do usuário). O mesmo já havia acontecido com o portal dualwin.
2. **Endpoint REST errado**: as credenciais do portal scitec estão gravadas com `https://oauth.bitrix.info/rest/` em vez de `https://scitec.bitrix24.com.br/rest/`. Esse endpoint genérico faz os métodos de telefonia falharem com "Method not found".

## O que fazer

### 1. Consertar o tenant scitec agora
- Vincular o usuário atual como admin da empresa do portal `Portal scitec.bitrix24.com.br`.
- Mover o token Api4Com (`scitec.api4com.com`) da empresa manual para a empresa do portal.
- Corrigir o `client_endpoint` das credenciais Bitrix24 para o endpoint do portal.
- Remover a empresa manual duplicada, já vazia depois da migração.

### 2. Consertar o tenant dualwin do mesmo jeito
Consolidar `Portal dualwin.bitrix24.com.br` com a empresa que tem as credenciais e as 5 chamadas, para não deixar o mesmo problema pendente.

### 3. Evitar que volte a acontecer
- Na instalação, gravar sempre `https://<domínio>/rest/` como endpoint, ignorando o endpoint OAuth genérico.
- Ao abrir o app dentro do Bitrix, forçar o vínculo com a empresa do `member_id` **antes** de qualquer fallback por membership, e migrar automaticamente credenciais/linhas/mapeamentos que estejam numa empresa manual do mesmo usuário.
- Bloquear a criação/uso de empresa manual quando o app roda dentro de um portal já conhecido.

## Detalhes técnicos

- Correção de dados via operações pontuais: insert em `company_members`, update de `api4com_credentials.company_id`, update de `bitrix24_credentials.client_endpoint`, delete das empresas duplicadas respeitando as FKs.
- `supabase/functions/bitrix24-install/index.ts`: normalizar `client_endpoint` (descartar host `oauth.bitrix.info`).
- `supabase/functions/link-user-to-company/index.ts`: além de vincular, detectar empresa manual do mesmo usuário sem `bitrix_member_id` e re-parentar credenciais/linhas/mapeamentos/chamadas para a empresa do portal.
- `src/hooks/useCompany.ts`: quando `isInBitrix`, não cair no fallback por `company_members` se o `member_id` resolve uma empresa; hoje o fallback é o que exibe a empresa errada.
- Verificação: após o ajuste, a tela de Credenciais deve mostrar `Portal scitec.bitrix24.com.br` no cabeçalho com o token Api4Com já preenchido, e `diagnose-telephony` deve responder sem "Method not found".
