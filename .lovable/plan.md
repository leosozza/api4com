

# Plano: Corrigir Registro de Linha Externa no Bitrix24

## Problema Identificado

O diagnóstico revela que:
1. **externalLines: []** - A linha externa NAO esta registrada no Bitrix24
2. **voximplantOutgoingGet: "LINK_BASE_NUMBER"** - O provedor de saida esta configurado para telefonia INTERNA
3. **resolvedDefaultLine: null** - Nossa linha nao foi encontrada no sistema de telefonia

A causa raiz: o componente `TelephonyDiagnostics.tsx` chama a funcao `register-telephony-events` sem passar o parametro `phone_line_number`, logo a linha nunca e registrada.

## Solucao

### Parte 1: Corrigir o componente TelephonyDiagnostics

Modificar a funcao `runRepair` para:
1. Buscar a linha telefonica padrao do banco de dados antes de chamar o reparo
2. Passar `phone_line_number` e `phone_line_name` para a Edge Function

```text
Arquivo: src/components/setup/TelephonyDiagnostics.tsx
```

Alteracoes:
- Antes de chamar `register-telephony-events`, buscar a linha padrao da empresa usando `supabase.from("external_phone_lines").select()`
- Passar os dados da linha no body da requisicao

### Parte 2: Melhorar feedback visual

Adicionar indicadores mais claros no diagnostico:
- Mostrar explicitamente que a linha precisa ser registrada no Bitrix
- Mostrar o status do provedor de saida (voximplantOutgoingGet)
- Adicionar badge para "Provedor Saida" mostrando se esta correto ou nao

### Parte 3: Adicionar botao de registro completo

Criar um botao "Registrar Linha no Bitrix" que:
1. Busca a linha padrao
2. Chama `register-telephony-events` com todos os parametros
3. Exibe feedback claro sobre o resultado

## Arquivos a Modificar

1. **Editar**: `src/components/setup/TelephonyDiagnostics.tsx`
   - Corrigir `runRepair` para incluir `phone_line_number`
   - Adicionar badge de status do provedor de saida
   - Melhorar mensagens de erro

## Resultado Esperado

Apos as alteracoes:
1. Clicar em "Reparar Eventos" ira:
   - Registrar eventos ONEXTERNALCALLSTART/ONEXTERNALCALLBACKSTART
   - Registrar a linha externa via `telephony.externalLine.add`
   - Definir o provedor de saida via `voximplant.line.outgoing.set`
2. O diagnostico mostrara "Linhas Bitrix" em verde
3. O click-to-call no Bitrix24 acionara nosso webhook

