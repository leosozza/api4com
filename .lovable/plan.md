

## Visao Geral

Este plano detalha as melhorias necessarias para tornar o conector Api4Com + Bitrix24 completamente funcional, permitindo fazer e receber chamadas diretamente do Bitrix24.

## Estado Atual

### O que ja funciona:
- Instalacao do app via Marketplace do Bitrix24 (bitrix24-install)
- Vinculacao automatica de usuario/empresa via member_id (link-user-to-company)
- Configuracao de credenciais Api4Com com webhook automatico (api4com-setup)
- Click-to-Call via evento OnExternalCallStart (bitrix24-webhook)
- Recebimento de webhooks de chamadas finalizadas (api4com-webhook)

### O que precisa ser implementado:
1. **Registro de linhas externas no Bitrix24** - As linhas telefonica precisam ser registradas no Bitrix para aparecerem nas configuracoes de telefonia
2. **Popup de chamadas recebidas** - Quando uma chamada entra, mostrar o card no Bitrix para o usuario
3. **Sincronizacao de mapeamentos de usuarios** - Buscar usuarios do Bitrix automaticamente
4. **Simplificacao do wizard** - Remover etapas manuais que podem ser automatizadas

---

## Fase 1: Registro de Linhas Externas no Bitrix24

Quando uma linha telefonica e cadastrada no sistema, ela deve ser registrada no Bitrix24 usando `telephony.externalLine.add`.

### Arquivos a modificar:

**supabase/functions/register-external-line/index.ts** (novo)
- Recebe: line_number, line_name, company_id
- Usa credenciais Bitrix da empresa para chamar telephony.externalLine.add
- Registra a linha no Bitrix24

**src/hooks/usePhoneLines.ts** (atualizar)
- Apos adicionar linha localmente, chamar edge function para registrar no Bitrix

**src/components/setup/steps/PhoneLinesSetup.tsx** (atualizar)
- Mostrar status de sincronizacao com Bitrix
- Adicionar botao para sincronizar linhas existentes

---

## Fase 2: Popup de Chamadas Recebidas

Quando uma chamada e recebida no softphone Api4Com, o sistema deve notificar o Bitrix24 para mostrar o popup do card de chamada.

### Fluxo:
```text
Chamada recebida -> Api4Com Webhook (channel-create) 
                 -> Buscar usuario por ramal
                 -> telephony.externalcall.register (SHOW=1, TYPE=2)
                 -> Popup aparece no Bitrix
                 
Chamada finalizada -> Api4Com Webhook (channel-hangup)
                   -> telephony.externalcall.finish
                   -> Card fechado + gravacao anexada
```

### Arquivos a modificar:

**supabase/functions/api4com-webhook/index.ts** (atualizar)
- Processar evento `channel-create` para chamadas recebidas
- Chamar telephony.externalcall.register com SHOW=1
- Armazenar bitrix_call_id para usar no finish
- Processar evento `channel-answer` para atualizar status

**supabase/functions/api4com-setup/index.ts** (atualizar)
- Configurar webhook para receber eventos: channel-create, channel-answer, channel-hangup

---

## Fase 3: Auto-sincronizacao de Usuarios do Bitrix

Buscar usuarios do Bitrix24 automaticamente para facilitar o mapeamento de ramais.

### Arquivos:

**supabase/functions/sync-bitrix-users/index.ts** (novo)
- Chamar user.get no Bitrix para listar usuarios
- Retornar lista de usuarios com ID, nome, departamento, telefone interno

**src/hooks/useBitrixUsers.ts** (novo)
- Hook para buscar e cachear usuarios do Bitrix
- Usar para popular select no formulario de mapeamento

**src/components/setup/steps/UserMappingSetup.tsx** (atualizar)
- Substituir campo texto por select com usuarios do Bitrix
- Mostrar nome do usuario selecionado
- Auto-preencher se houver match de telefone interno

---

## Fase 4: Simplificacao do Setup Wizard

Reduzir etapas manuais no wizard de configuracao.

### Mudancas:

**src/components/setup/SetupWizard.tsx**
- Remover etapa de "Usuarios" se isInBitrix
- Manter apenas: Credenciais -> Linhas

**src/components/setup/steps/UserMappingSetup.tsx**
- Mostrar apenas informacoes sobre como usar o Contact Center do Bitrix
- Link para documentacao sobre mapeamento de usuarios no Contact Center

**src/components/setup/steps/PhoneLinesSetup.tsx**
- Tornar mais visual com feedback de sincronizacao

---

## Fase 5: Registro de Eventos de Telefonia

Garantir que todos os eventos de telefonia do Bitrix estao registrados corretamente.

### Arquivos:

**supabase/functions/bitrix24-install/index.ts** (atualizar)
- Alem de ONEXTERNALCALLSTART, registrar ONEXTERNALCALLBACKSTART
- Verificar se eventos ja estao registrados antes de adicionar

**supabase/functions/bitrix24-webhook/index.ts** (atualizar)
- Processar evento ONEXTERNALCALLBACKSTART (callback request)
- Melhorar logging para debug

---

## Fase 6: Dashboard e Monitoramento

Melhorar visibilidade das chamadas e status do sistema.

### Arquivos:

**src/pages/Dashboard.tsx** (atualizar)
- Mostrar ultimas chamadas em tempo real
- Status das integracoes (Api4Com conectado, Bitrix conectado)
- Metricas de chamadas

**src/components/calls/RealtimeCallsWidget.tsx** (novo)
- Widget que mostra chamadas ativas e recentes
- Atualiza automaticamente via realtime do Supabase

---

## Detalhes Tecnicos

### Endpoint telephony.externalcall.register

Parametros para chamadas recebidas:
```javascript
{
  USER_ID: "123",           // ID do usuario Bitrix
  PHONE_NUMBER: "+55...",   // Numero que esta ligando
  TYPE: 2,                  // 2 = incoming
  CRM_CREATE: 1,            // Criar lead se nao existir
  SHOW: 1,                  // Mostrar popup
  LINE_NUMBER: "...",       // Linha externa cadastrada
  CALL_START_DATE: "..."    // ISO8601
}
```

Retorna:
```javascript
{
  CALL_ID: "abc123",
  CRM_ENTITY_TYPE: "LEAD",
  CRM_ENTITY_ID: 456
}
```

### Endpoint telephony.externalcall.finish

```javascript
{
  CALL_ID: "abc123",
  USER_ID: "123",
  DURATION: 180,
  STATUS_CODE: "200",       // 200=completed, 304=missed, 486=busy
  RECORD_URL: "https://..."
}
```

### Webhook Api4Com v1.4 - Tipos de Evento

| Evento | Descricao | Uso |
|--------|-----------|-----|
| channel-create | Chamada iniciada | Mostrar popup |
| channel-answer | Chamada atendida | Atualizar status |
| channel-hangup | Chamada finalizada | Registrar no CRM |

---

## Limpeza e Correcoes

### Dados orfaos no banco
- A empresa "Thoth24 solution" (54401a1c) tem api4com_credentials configurado
- A empresa "Portal thoth24..." (82e09b93) tem bitrix24_credentials configurado
- Essas sao empresas diferentes que deveriam ser a mesma

### Acao recomendada:
1. Mover bitrix24_credentials para a empresa correta
2. Ou vincular bitrix_member_id a empresa que tem api4com configurado

---

## Ordem de Implementacao

1. **Fase 2** - Popup de chamadas recebidas (maior impacto)
2. **Fase 1** - Registro de linhas externas
3. **Fase 5** - Eventos de telefonia
4. **Fase 4** - Simplificacao do wizard
5. **Fase 3** - Auto-sincronizacao de usuarios
6. **Fase 6** - Dashboard e monitoramento

---

## Resumo das Alteracoes

| Arquivo | Acao | Prioridade |
|---------|------|------------|
| api4com-webhook/index.ts | Adicionar channel-create/answer | Alta |
| api4com-setup/index.ts | Incluir mais tipos de webhook | Alta |
| register-external-line/index.ts | Criar nova edge function | Media |
| sync-bitrix-users/index.ts | Criar nova edge function | Baixa |
| bitrix24-install/index.ts | Melhorar registro de eventos | Media |
| UserMappingSetup.tsx | Simplificar/remover | Media |
| PhoneLinesSetup.tsx | Adicionar sync com Bitrix | Media |
| SetupWizard.tsx | Remover etapa desnecessaria | Baixa |

