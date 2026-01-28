

# Conector Api4Com para Bitrix24

## Visão Geral
Criar uma aplicação que integra a plataforma de telefonia **Api4Com** com o **Bitrix24**, permitindo que empresas usem telefonia externa (sem SIP do Bitrix) diretamente dentro do CRM, com registro automático de chamadas, popup de clientes e gravações sincronizadas.

---

## Funcionalidades Principais

### 1. Tela de Configuração (Setup Wizard)
- **Cadastro de credenciais**: Cada empresa insere seu token da Api4Com e webhook do Bitrix24
- **Mapeamento de usuários**: Vincular ramais da Api4Com aos usuários do Bitrix24
- **Configuração de linha externa**: Registrar número(s) de telefone que serão usados nas chamadas
- **Teste de conexão**: Validar se as credenciais estão corretas

### 2. Click-to-Call (Chamadas Originadas)
- Quando o usuário clica em um número no Bitrix24, a aplicação:
  - Captura o evento `OnExternalCallStart` do Bitrix
  - Envia comando para Api4Com originar a ligação
  - Exibe o card de chamada no Bitrix com dados do cliente (CRM)
  - Atualiza status em tempo real (tocando, atendida, encerrada)

### 3. Popup de Chamada Recebida
- Quando chega uma ligação na Api4Com:
  - Webhook da Api4Com notifica nosso backend
  - Backend chama `telephony.externalcall.register` no Bitrix
  - Exibe card de chamada para o usuário responsável
  - Busca dados do cliente automaticamente pelo número
  - Se não encontrar, oferece opção de criar lead

### 4. Gravação de Chamadas
- Ao finalizar a chamada:
  - Busca URL da gravação na Api4Com
  - Sincroniza com o Bitrix via `telephony.externalcall.finish`
  - Gravação fica disponível no histórico do cliente/lead

### 5. Histórico e Métricas
- **Dashboard dentro do Bitrix** com:
  - Total de chamadas (realizadas, recebidas, perdidas)
  - Tempo médio de atendimento
  - Taxa de conversão por operador
  - Filtros por período, usuário e tipo de chamada
- **Linha do tempo**: Todas as chamadas vinculadas ao cliente no CRM

---

## Arquitetura Técnica

### Backend (Lovable Cloud)
- **Edge Functions** para:
  - Receber webhooks da Api4Com
  - Comunicar com API REST do Bitrix24
  - Gerenciar tokens e configurações por empresa
- **Banco de dados** para:
  - Configurações de cada empresa (tokens, mapeamentos)
  - Logs de chamadas para relatórios
  - Cache de sessões ativas

### Frontend (App Bitrix24)
- Aplicação React que roda dentro do iframe do Bitrix
- Integração com SDK JavaScript do Bitrix24 (`BX24`)
- Telas:
  - Setup/Configuração
  - Dashboard de métricas
  - Histórico de chamadas

### Integrações
- **Api4Com**: Webhooks para eventos de chamada + API para originar ligações
- **Bitrix24**: REST API de telefonia externa (`telephony.externalcall.*`)

---

## Fluxo para Publicação no Marketplace

1. Registrar como desenvolvedor no Bitrix24
2. Criar a aplicação no portal de parceiros
3. Configurar URL do app (apontando para nosso frontend hospedado)
4. Definir escopos necessários (`telephony`, `crm`, `user`)
5. Submeter para aprovação

---

## Resumo das Entregas

| Módulo | Descrição |
|--------|-----------|
| **Setup** | Tela para configurar credenciais Api4Com e Bitrix por empresa |
| **Click-to-Call** | Originar chamadas ao clicar em números no Bitrix |
| **Popup Recebida** | Card de chamada com dados do cliente ao receber ligação |
| **Gravações** | Sincronizar áudio das chamadas no histórico do CRM |
| **Dashboard** | Métricas e relatórios de telefonia |
| **Backend** | Edge functions para webhooks e integrações |

