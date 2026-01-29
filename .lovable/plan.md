
# Plano: Corrigir Click-to-Call do Webphone

## Diagnóstico

O click-to-call não está funcionando porque:

1. **Evento não chega ao webhook**: Nenhum log foi registrado na edge function `bitrix24-webhook` quando você tentou fazer uma ligação
2. **Mapeamento de usuário incorreto**: O mapeamento atual usa `bitrix24_user_id: 1`, mas o ID real do seu usuário no Bitrix24 provavelmente é diferente
3. **Linha externa pode não estar vinculada corretamente**: A linha externa precisa estar associada ao usuário no Contact Center do Bitrix24

## Problemas Identificados

```text
+-------------------------+     +---------------------+     +------------------+
| Bitrix24 Click-to-Call  | --> | ONEXTERNALCALLSTART | --> | bitrix24-webhook |
|                         |     | (evento não enviado)|     | (sem logs)       |
+-------------------------+     +---------------------+     +------------------+
                                        |
                                        v
                                +-------------------+
                                | Possíveis Causas: |
                                | 1. Usuário não    |
                                |    vinculado à    |
                                |    linha externa  |
                                | 2. App não é o    |
                                |    padrão para    |
                                |    telefonia      |
                                | 3. ID do usuário  |
                                |    incorreto      |
                                +-------------------+
```

## Solução em 3 Etapas

### Etapa 1: Descobrir o ID Real do Usuário Bitrix24

Invocar a edge function `sync-bitrix-users` para listar todos os usuários do portal Bitrix24 e identificar o ID correto do usuário que está fazendo as chamadas.

### Etapa 2: Atualizar o Mapeamento de Usuário

Corrigir o registro na tabela `user_mappings` para usar o ID real do usuário Bitrix24 (provavelmente `26` baseado nos logs anteriores) em vez de `1`.

### Etapa 3: Verificar Configuração no Bitrix24

O Bitrix24 só envia o evento `ONEXTERNALCALLSTART` quando:
- O usuário está **vinculado à linha externa** no Contact Center
- O aplicativo é o **handler padrão** para chamadas externas

Será necessário verificar manualmente no Bitrix24:
1. **Contact Center → Configurar números de telefone**
2. Verificar se a linha `+5515996045202` está configurada
3. Verificar se o usuário está autorizado a usar essa linha

---

## Detalhes Técnicos

### Consulta para identificar usuários do Bitrix24

Chamar a edge function `sync-bitrix-users` com o `company_id` correto para listar os usuários e seus IDs reais.

### Atualização do mapeamento

```sql
UPDATE user_mappings 
SET bitrix24_user_id = '<ID_CORRETO>' 
WHERE company_id = '82e09b93-8617-4692-9365-dd87cc77c60b';
```

### Verificação no Bitrix24 (manual)

1. Acessar **Contact Center → Configurar números de telefone**
2. Localizar a linha `+5515996045202 (Api4Com)`
3. Clicar em **Configurações da linha**
4. Verificar se os usuários corretos estão vinculados
5. Verificar se o app está como **handler padrão**
