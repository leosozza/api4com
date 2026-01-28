

# Correção das URLs Inacessíveis

## Problema Identificado

Há **dois problemas** que impedem o Bitrix24 de acessar as URLs:

### 1. Aplicação Não Publicada
O projeto ainda não foi publicado. Atualmente só existe a URL de preview:
- **Preview**: `https://id-preview--323edde2-5511-4445-973c-b0c7cd67038e.lovable.app`
- **Produção**: `https://api4com.lovable.app` (não acessível até publicar)

**Solução**: Clicar em **Publish** (Publicar) no canto superior direito para ativar o domínio customizado.

### 2. Edge Function com Erro de Parsing
A edge function `bitrix24-install` está acessível, mas tem um bug no tratamento dos dados que o Bitrix24 envia.

O erro nos logs:
```text
SyntaxError: Unexpected end of JSON input
```

**Causa**: O Bitrix24 pode enviar campos `auth` e `data` como strings ou como objetos serializados de forma diferente do esperado. O código atual tenta fazer `JSON.parse()` em dados que podem não ser JSON válido.

---

## Plano de Correção

### Passo 1: Publicar a Aplicação
Você precisa clicar no botão **Publish** para que a URL `https://api4com.lovable.app` fique acessível.

### Passo 2: Corrigir a Edge Function

Melhorar o parsing da edge function para lidar com os diferentes formatos que o Bitrix24 pode enviar:

```text
supabase/functions/bitrix24-install/index.ts
- Adicionar logging detalhado para debug
- Tratar diferentes formatos de auth (string JSON, objeto, URLSearchParams)
- Adicionar try/catch específico para JSON.parse
- Verificar se o corpo está vazio antes de tentar parsear
```

**Mudanças específicas:**

1. Adicionar log do corpo bruto recebido para debug
2. Verificar se `req.body` está vazio antes de processar
3. Usar try/catch ao fazer JSON.parse nos campos individuais
4. Tratar o caso onde Bitrix envia dados diretamente como query params ou formato diferente

---

## Ação Imediata Necessária

Antes de eu fazer as correções no código, você precisa:

1. **Publicar o app** clicando em "Publish" no canto superior direito
2. Aguardar a publicação completar
3. Me avisar quando estiver publicado para eu corrigir a edge function

