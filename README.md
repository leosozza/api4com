# Api4Com Connector para Bitrix24

Conector de telefonia que integra o sistema Api4Com WebPhone com o Bitrix24 CRM, permitindo Click-to-Call, registro automático de chamadas e identificação de contatos.

## Desenvolvedor

**Thoth24** - Parceiro Bitrix24  
Website: [thoth24.com.br](https://thoth24.com.br)

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Funcionalidades](#funcionalidades)
4. [Fluxo de Instalação](#fluxo-de-instalação)
5. [Fluxo de Chamadas](#fluxo-de-chamadas)
6. [Edge Functions](#edge-functions)
7. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
8. [Configuração no Marketplace](#configuração-no-marketplace)
9. [Tecnologias](#tecnologias)

---

## Visão Geral

Este conector permite que empresas utilizem o sistema de telefonia Api4Com diretamente integrado ao Bitrix24 CRM, sem necessidade do SIP nativo do Bitrix. O sistema é **multi-tenant**, permitindo que múltiplas empresas configurem suas próprias credenciais.

### Principais Benefícios

- **Click-to-Call**: Clique em qualquer número no Bitrix24 para iniciar chamada
- **Popup de Chamadas**: Chamadas recebidas exibem popup com dados do CRM
- **Registro Automático**: Todas as chamadas são registradas no histórico do contato
- **Gravações**: Links de gravação anexados automaticamente às atividades

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BITRIX24 CRM                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │ Click-to-   │  │   Popup     │  │    Histórico de Chamadas    │  │
│  │    Call     │  │  Inbound    │  │    (CRM Activities)         │  │
│  └──────┬──────┘  └──────▲──────┘  └──────────────▲──────────────┘  │
│         │                │                         │                 │
│         │ ONEXTERNALCALLSTART    telephony.externalcall.register    │
│         │                │         telephony.externalcall.finish     │
└─────────┼────────────────┼─────────────────────────┼─────────────────┘
          │                │                         │
          ▼                │                         │
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE (Backend)                            │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ bitrix24-webhook │  │ api4com-webhook  │  │  bitrix24-handler│   │
│  │  (Click-to-Call) │  │ (Call Events)    │  │  (Install/Config)│   │
│  └────────┬─────────┘  └────────▲─────────┘  └──────────────────┘   │
│           │                     │                                    │
│           │    ┌────────────────┴────────────────┐                  │
│           │    │         BANCO DE DADOS          │                  │
│           │    │  - companies                    │                  │
│           │    │  - bitrix24_credentials         │                  │
│           │    │  - api4com_credentials          │                  │
│           │    │  - user_mappings                │                  │
│           │    │  - call_logs                    │                  │
│           │    │  - external_phone_lines         │                  │
│           │    └─────────────────────────────────┘                  │
│           │                                                          │
└───────────┼──────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API4COM WEBPHONE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │   Dialer    │  │  Webhooks   │  │       Integrações           │  │
│  │   API       │  │   v1.4      │  │    (bitrix24-connector)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Componentes Principais

| Componente | Descrição |
|------------|-----------|
| **Frontend React** | Interface de configuração embutida via iframe no Bitrix24 |
| **Edge Functions** | Processamento de webhooks e integração com APIs |
| **Banco de Dados** | Armazenamento de credenciais, mapeamentos e logs |
| **SDK Bitrix24** | Biblioteca JavaScript oficial para comunicação com o CRM |

---

## Funcionalidades

### 1. Click-to-Call (Chamadas de Saída)

Quando o usuário clica em um número no Bitrix24:

1. Bitrix24 dispara evento `ONEXTERNALCALLSTART` para nosso webhook
2. Webhook identifica o usuário e busca seu ramal Api4Com
3. Chamada é originada via API Dialer da Api4Com
4. Telefone do agente toca primeiro, depois conecta ao destino

### 2. Popup de Chamadas Recebidas

Quando uma chamada chega no ramal:

1. Api4Com envia webhook `channel-create`
2. Sistema identifica o ramal e busca usuário Bitrix correspondente
3. Chama `telephony.externalcall.register` com `SHOW=1`
4. Popup aparece no Bitrix24 com dados do contato

### 3. Registro de Chamadas

Ao término de cada chamada:

1. Api4Com envia webhook `channel-hangup`
2. Sistema calcula duração e status (atendida/perdida)
3. Chama `telephony.externalcall.finish` com dados da chamada
4. Link de gravação é anexado à atividade do CRM

### 4. Sincronização de Usuários

- Busca automática de usuários ativos do Bitrix24
- Extração de ramal a partir das configurações do telefone interno
- Mapeamento automático ramal ↔ usuário

---

## Fluxo de Instalação

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. INSTALAÇÃO DO APP                                                 │
│                                                                       │
│  Usuário instala app via Marketplace Bitrix24                        │
│         │                                                             │
│         ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ bitrix24-install                                             │     │
│  │  - Recebe ONAPPINSTALL com tokens OAuth                     │     │
│  │  - Cria empresa no banco (ou reutiliza existente)           │     │
│  │  - Salva credenciais Bitrix24 (domain, access_token)        │     │
│  │  - Registra eventos de telefonia                            │     │
│  │  - Registra linha externa                                   │     │
│  │  - Define linha como padrão para saída                      │     │
│  └─────────────────────────────────────────────────────────────┘     │
│         │                                                             │
│         ▼                                                             │
│  Usuário é redirecionado para interface de configuração              │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  2. CONFIGURAÇÃO DO TOKEN API4COM                                     │
│                                                                       │
│  Usuário insere token da Api4Com na interface                        │
│         │                                                             │
│         ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ api4com-setup                                                │     │
│  │  - Valida token via GET /integrations                       │     │
│  │  - Extrai domínio e ramal do usuário                        │     │
│  │  - Configura webhook na Api4Com                             │     │
│  │  - Cria mapeamento automático usuário ↔ ramal               │     │
│  │  - Salva credenciais no banco                               │     │
│  └─────────────────────────────────────────────────────────────┘     │
│         │                                                             │
│         ▼                                                             │
│  Sistema pronto para uso!                                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Auto-Vinculação de Tenant

O sistema detecta automaticamente o `member_id` do portal Bitrix24 e vincula usuários à empresa correspondente. Isso permite:

- Múltiplos usuários do mesmo portal compartilham a mesma configuração
- Não é necessário criar empresa manualmente
- Configurações persistem entre sessões

---

## Fluxo de Chamadas

### Chamada de Saída (Click-to-Call)

```
Bitrix24                    Backend                         Api4Com
   │                           │                               │
   │ 1. Click no número        │                               │
   │──────────────────────────►│                               │
   │   ONEXTERNALCALLSTART     │                               │
   │                           │ 2. Busca mapeamento           │
   │                           │    usuário → ramal            │
   │                           │                               │
   │                           │ 3. POST /dialer               │
   │                           │──────────────────────────────►│
   │                           │                               │
   │                           │ 4. Chamada originada          │
   │                           │◄──────────────────────────────│
   │                           │                               │
   │                           │ 5. channel-create webhook     │
   │                           │◄──────────────────────────────│
   │                           │                               │
   │ 6. register (TYPE=1)      │                               │
   │◄──────────────────────────│                               │
   │   (Atualiza status)       │                               │
   │                           │                               │
   │                           │ 7. channel-answer webhook     │
   │                           │◄──────────────────────────────│
   │                           │                               │
   │                           │ 8. channel-hangup webhook     │
   │                           │◄──────────────────────────────│
   │                           │                               │
   │ 9. finish                 │                               │
   │◄──────────────────────────│                               │
   │   (Registra no CRM)       │                               │
```

### Chamada Recebida (Inbound)

```
Api4Com                     Backend                         Bitrix24
   │                           │                               │
   │ 1. channel-create         │                               │
   │   (direction: inbound)    │                               │
   │──────────────────────────►│                               │
   │                           │ 2. Identifica ramal           │
   │                           │    Busca usuário Bitrix       │
   │                           │                               │
   │                           │ 3. register (SHOW=1, TYPE=2)  │
   │                           │──────────────────────────────►│
   │                           │                               │
   │                           │              4. Popup aparece │
   │                           │                  com CRM card │
   │                           │                               │
   │ 5. channel-answer         │                               │
   │──────────────────────────►│                               │
   │                           │ 6. Atualiza status            │
   │                           │                               │
   │ 7. channel-hangup         │                               │
   │──────────────────────────►│                               │
   │                           │ 8. finish                     │
   │                           │──────────────────────────────►│
   │                           │                               │
   │                           │         9. Atividade criada   │
   │                           │            com gravação       │
```

---

## Edge Functions

| Função | Propósito | JWT |
|--------|-----------|-----|
| `bitrix24-install` | Processa instalação do app (ONAPPINSTALL) | ❌ |
| `bitrix24-handler` | Ponto de entrada unificado para Bitrix24 | ❌ |
| `bitrix24-webhook` | Recebe eventos Click-to-Call | ❌ |
| `api4com-webhook` | Recebe eventos de chamada da Api4Com | ❌ |
| `api4com-setup` | Configura integração Api4Com | ❌ |
| `create-company` | Cria empresa no sistema | ❌ |
| `link-user-to-company` | Vincula usuário anônimo à empresa | ❌ |
| `sync-bitrix-users` | Sincroniza usuários do Bitrix24 | ❌ |
| `register-external-line` | Registra linha telefônica no Bitrix | ❌ |
| `register-telephony-events` | Configura eventos de telefonia | ❌ |
| `set-outgoing-line` | Define linha padrão para saída | ❌ |
| `diagnose-telephony` | Diagnóstico de problemas | ❌ |
| `check-user-phone` | Verifica configuração de telefone | ❌ |
| `test-connection` | Testa conectividade | ❌ |

### Detalhes das Principais Funções

#### `bitrix24-install`

Executada quando o app é instalado:

1. Recebe evento `ONAPPINSTALL` com tokens OAuth
2. Cria ou reutiliza empresa baseada no `member_id`
3. Salva `access_token` e `refresh_token`
4. Registra eventos: `ONEXTERNALCALLSTART`, `ONEXTERNALCALLBACKSTART`
5. Adiciona linha externa via `telephony.externalLine.add`
6. Configura linha como padrão via `voximplant.line.outgoing.set`
7. Chama `BX24.installFinish()` para finalizar

#### `api4com-webhook`

Recebe webhooks v1.4 da Api4Com:

```typescript
interface Api4ComWebhookV14 {
  version: string;
  eventType: 'channel-create' | 'channel-answer' | 'channel-hangup';
  id: string;
  domain: string;
  direction: 'inbound' | 'outbound';
  caller: string;
  called: string;
  startedAt: string;
  answeredAt?: string;
  endedAt: string;
  duration: number;
  hangupCause: string;
  recordUrl?: string;
  metadata?: {
    gateway?: string;
    companyId?: string;
    bitrixUserId?: string;
  };
}
```

Mapeamento de eventos:

| Evento Api4Com | Ação Bitrix24 |
|----------------|---------------|
| `channel-create` | `telephony.externalcall.register` |
| `channel-answer` | Atualiza status no banco |
| `channel-hangup` | `telephony.externalcall.finish` |

#### `bitrix24-webhook`

Recebe eventos do Bitrix24:

- `ONEXTERNALCALLSTART`: Click-to-Call iniciado
  - Busca mapeamento usuário → ramal
  - Origina chamada via Api4Com Dialer
  - Cria registro no `call_logs`

---

## Estrutura do Banco de Dados

### Tabelas

```sql
-- Empresas (tenants)
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  bitrix_member_id TEXT UNIQUE,  -- ID único do portal Bitrix
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Membros da empresa (usuários)
CREATE TABLE company_members (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies,
  user_id UUID,  -- ID do usuário anônimo
  role TEXT,     -- 'admin' ou 'member'
  created_at TIMESTAMPTZ
);

-- Credenciais Bitrix24
CREATE TABLE bitrix24_credentials (
  id UUID PRIMARY KEY,
  company_id UUID UNIQUE REFERENCES companies,
  domain TEXT NOT NULL,           -- ex: empresa.bitrix24.com.br
  member_id TEXT,                 -- ID do portal
  access_token TEXT NOT NULL,     -- Token OAuth
  refresh_token TEXT,
  client_endpoint TEXT,           -- URL da API REST
  webhook_url TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Credenciais Api4Com
CREATE TABLE api4com_credentials (
  id UUID PRIMARY KEY,
  company_id UUID UNIQUE REFERENCES companies,
  api_token TEXT NOT NULL,
  api4com_domain TEXT,            -- Domínio da conta
  webhook_configured BOOLEAN,     -- Se webhook foi configurado
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Mapeamento Ramal ↔ Usuário Bitrix
CREATE TABLE user_mappings (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies,
  api4com_extension TEXT NOT NULL,  -- Ramal Api4Com (ex: "1001")
  bitrix24_user_id TEXT NOT NULL,   -- ID do usuário no Bitrix
  user_name TEXT,                   -- Nome para exibição
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Linhas telefônicas externas
CREATE TABLE external_phone_lines (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies,
  line_number TEXT NOT NULL,   -- Número no formato +55...
  line_name TEXT,              -- Nome da linha
  is_default BOOLEAN,          -- Se é a linha padrão
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Logs de chamadas
CREATE TABLE call_logs (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies,
  user_mapping_id UUID REFERENCES user_mappings,
  external_line_id UUID REFERENCES external_phone_lines,
  direction TEXT,              -- 'inbound' ou 'outbound'
  phone_number TEXT NOT NULL,
  status TEXT,                 -- 'ringing', 'answered', 'missed', etc.
  duration_seconds INTEGER,
  recording_url TEXT,
  bitrix_call_id TEXT,         -- ID da chamada no Bitrix
  api4com_call_id TEXT,        -- ID da chamada na Api4Com
  caller_name TEXT,
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

### Diagrama ER

```
┌──────────────┐      ┌───────────────────┐      ┌───────────────────┐
│  companies   │──────│ bitrix24_creds    │      │ api4com_creds     │
│              │      │                   │      │                   │
│ id           │◄─────│ company_id        │      │ company_id        │
│ name         │      │ domain            │      │ api_token         │
│ member_id    │      │ access_token      │      │ api4com_domain    │
└──────┬───────┘      └───────────────────┘      └───────────────────┘
       │
       │
       ├──────────────────┬──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ user_mappings│   │ phone_lines  │   │ call_logs    │
│              │   │              │   │              │
│ company_id   │   │ company_id   │   │ company_id   │
│ extension    │   │ line_number  │   │ direction    │
│ bitrix_user  │   │ is_default   │   │ status       │
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## Configuração no Marketplace

### URLs de Configuração

Configure no Marketplace do Bitrix24:

| Campo | URL |
|-------|-----|
| **Application URL** | `https://[SUPABASE_URL]/functions/v1/bitrix24-handler?action=settings` |
| **Initial install path** | `https://[SUPABASE_URL]/functions/v1/bitrix24-handler?action=install` |
| **Settings path** | `https://[SUPABASE_URL]/functions/v1/bitrix24-handler?action=settings` |

### Permissões Necessárias

- `telephony` - Gerenciamento de telefonia
- `crm` - Acesso ao CRM para registro de atividades
- `user` - Leitura de usuários para mapeamento

### Eventos de Telefonia

- `ONEXTERNALCALLSTART` - Click-to-Call
- `ONEXTERNALCALLBACKSTART` - Callback externo

---

## Tecnologias

### Frontend

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React | 18.3 | Framework UI |
| TypeScript | 5.x | Tipagem estática |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Estilização |
| shadcn/ui | - | Componentes UI |
| React Query | 5.x | Cache e fetch |
| React Router | 6.x | Roteamento |

### Backend

| Tecnologia | Uso |
|------------|-----|
| Supabase | Banco de dados PostgreSQL + Auth |
| Edge Functions (Deno) | Serverless functions |
| Row Level Security | Segurança multi-tenant |

### Integrações

| API | Versão | Documentação |
|-----|--------|--------------|
| Bitrix24 REST API | - | [rest.bitrix24.com](https://training.bitrix24.com/rest_help/) |
| Api4Com WebPhone | v1.4 | Documentação interna |

---

## Estrutura de Diretórios

```
├── src/
│   ├── components/
│   │   ├── auth/           # Componentes de autenticação
│   │   ├── calls/          # Tabela de logs de chamadas
│   │   ├── dashboard/      # Métricas e gráficos
│   │   ├── layout/         # Layout principal
│   │   ├── setup/          # Wizard de configuração
│   │   └── ui/             # Componentes shadcn/ui
│   ├── contexts/           # Context providers
│   ├── hooks/              # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useBitrix.ts
│   │   ├── useCallLogs.ts
│   │   ├── useCompany.ts
│   │   └── ...
│   ├── integrations/
│   │   └── supabase/       # Cliente Supabase
│   ├── pages/              # Páginas da aplicação
│   └── types/              # Definições TypeScript
│
├── supabase/
│   ├── functions/          # Edge Functions
│   │   ├── api4com-setup/
│   │   ├── api4com-webhook/
│   │   ├── bitrix24-handler/
│   │   ├── bitrix24-install/
│   │   ├── bitrix24-webhook/
│   │   └── ...
│   └── config.toml         # Configuração Supabase
│
├── public/                 # Assets estáticos
└── index.html              # Entry point
```

---

## Licença

Proprietário - Thoth24

Este software é de propriedade exclusiva da Thoth24. Todos os direitos reservados.

---

## Suporte

Para suporte técnico, entre em contato com a Thoth24.
