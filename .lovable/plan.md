

## Plano: Corrigir Fluxo de Click-to-Call

### Problema Diagnosticado

O Bitrix24 discou diretamente porque:
1. **Sem mapeamento de usuario**: A tabela `user_mappings` esta vazia. O webhook precisa saber qual ramal Api4Com corresponde ao usuario Bitrix24 que clicou no numero.
2. **Webhook nao registrado ou Bitrix usando telefonia interna**: Nao ha logs do `bitrix24-webhook`, indicando que o evento `ONEXTERNALCALLSTART` nao esta chegando.
3. **Extensao Chrome Api4Com**: E obrigatoria para o WebPhone funcionar.

### Fluxo Esperado vs Atual

```text
ESPERADO (com integracao):
Usuario clica telefone no Bitrix
    → Bitrix dispara ONEXTERNALCALLSTART
    → bitrix24-webhook recebe evento
    → Busca mapeamento (ramal do usuario)
    → Chama API Api4Com /dialer
    → WebPhone (extensao Chrome) toca
    → Usuario atende no WebPhone

ATUAL (sem configuracao):
Usuario clica telefone no Bitrix
    → Bitrix usa telefonia interna (SIP padrao)
    → Chamada sai pelo softphone nativo do Bitrix
```

### Correcoes Necessarias

#### 1. Criar Mapeamento de Usuario de Teste
Inserir registro na tabela `user_mappings` com:
- `company_id`: 82e09b93-8617-4692-9365-dd87cc77c60b
- `api4com_extension`: O ramal do usuario (ex: "1000")
- `bitrix24_user_id`: O ID do usuario Bitrix que fez o teste

#### 2. Verificar Registro do Evento no Bitrix24
O evento `ONEXTERNALCALLSTART` precisa estar registrado no Bitrix24 apontando para:
```
https://xdyumezeouultnxssnlc.supabase.co/functions/v1/bitrix24-webhook
```

Isso deveria ter sido feito durante a instalacao do app (`bitrix24-install`).

#### 3. Adicionar Orientacoes no Setup Wizard
- Verificar se a extensao Chrome Api4Com esta instalada
- Mostrar instrucoes claras sobre o fluxo de chamadas

### Proximos Passos

| Passo | Acao |
|-------|------|
| 1 | Criar mapeamento de usuario de teste no banco |
| 2 | Verificar/registrar eventos de telefonia no Bitrix24 |
| 3 | Testar chamada novamente com logs ativos |
| 4 | Adicionar orientacoes da extensao Chrome no UI |

### Informacao Necessaria

Para criar o mapeamento, preciso saber:
- **Seu ID de usuario no Bitrix24** (aparece na URL do perfil ou pode ser consultado via API)
- **Seu ramal na Api4Com** (ex: 1000, 1001, etc.)

### Detalhes Tecnicos

O `bitrix24-install` ja registra os eventos durante a instalacao:
```typescript
await registerBitrixEvent(auth, "ONEXTERNALCALLSTART", webhookBaseUrl);
await registerBitrixEvent(auth, "ONEXTERNALCALLBACKSTART", webhookBaseUrl);
```

Porem, se o app foi instalado antes dessas linhas serem adicionadas, ou se houve erro, os eventos podem nao estar registrados.

