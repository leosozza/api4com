

# Plano: Exibir URL do Webhook para Configuração Manual

## Contexto

O sistema já tenta configurar o webhook automaticamente via API da Api4Com quando o token é salvo. Porém, quando essa configuração falha (ou o usuário quer configurar manualmente), a URL do webhook não é exibida para cópia.

## Problema Identificado

- A edge function `api4com-setup` retorna `webhook_url` na resposta
- A UI não exibe essa URL para o usuário copiar
- Quando `webhook_configured: false`, não há instruções claras de configuração manual

## Solução Proposta

### 1. Atualizar `CredentialsSetup.tsx`

Modificar o componente para:

1. **Sempre mostrar a URL do webhook** após configurar o token (seja automático ou manual)
2. **Adicionar botão "Copiar"** para facilitar cópia da URL
3. **Exibir instruções claras** quando a configuração automática falhar

### Mudanças no Componente

```text
┌────────────────────────────────────────────────────────┐
│  Webhook                                               │
│  ──────────────────────────────────────────────────── │
│  ✓ Configurado automaticamente                        │ (se sucesso)
│  ─ OU ─                                               │
│  ⚠ Configuração automática falhou                     │ (se falha)
│                                                        │
│  URL do Webhook:                                       │
│  ┌──────────────────────────────────────┬────────┐   │
│  │ https://xdyum...com-webhook          │ Copiar │   │
│  └──────────────────────────────────────┴────────┘   │
│                                                        │
│  ▼ Como configurar manualmente:                       │
│    1. Acesse app.api4com.com                          │
│    2. Vá em Integrações → Webhook                     │
│    3. Cole a URL acima                                │
│    4. Ative os eventos: channel-create, ...           │
└────────────────────────────────────────────────────────┘
```

### Detalhes Técnicos

1. **Guardar `webhook_url` no estado** (`setupResult.webhook_url`)
2. **Gerar URL estática** baseada no `VITE_SUPABASE_URL` quando não vier do setup
3. **Usar `navigator.clipboard.writeText()`** para copiar
4. **Exibir seção expandível** com instruções de configuração manual

### Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/setup/steps/CredentialsSetup.tsx` | Adicionar exibição da URL do webhook com botão copiar e instruções manuais |

### Código da Seção de Webhook (Nova)

Substituir a seção "Webhook Status" existente (linhas 264-296) por uma versão expandida que:

1. Mostra status (Configurado/Não Configurado)
2. Exibe a URL do webhook em um campo copiável
3. Adiciona instruções de configuração manual quando necessário
4. Usa toast para feedback ao copiar

### Dependências

- Nenhuma nova dependência necessária
- Usar `Copy` icon do lucide-react (já disponível)

