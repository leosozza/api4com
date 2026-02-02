

# Plano: Remover Referências Lovable e Atribuir ao Desenvolvedor Thoth24

## Resumo

Preparar o projeto para submissão como conector oficial Bitrix24, removendo todas as referências à plataforma Lovable e adicionando informações da **Thoth24** como desenvolvedora parceira Bitrix24.

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `README.md` | Reescrever | Novo README profissional com documentação do conector |
| `index.html` | Editar | Atualizar meta tags OG/Twitter |
| `package.json` | Editar | Alterar nome e remover `lovable-tagger` |
| `vite.config.ts` | Editar | Remover import/uso do `lovable-tagger` |
| `.lovable/plan.md` | Deletar | Remover diretório interno do Lovable |
| `supabase/functions/bitrix24-install/index.ts` | Editar | Atualizar URL default do app |
| `supabase/functions/bitrix24-handler/index.ts` | Editar | Atualizar URL default do app |

---

## Detalhes das Mudanças

### 1. README.md (Reescrever Completo)

Novo conteúdo profissional:

```markdown
# Api4Com Connector para Bitrix24

Conector de telefonia que integra o sistema Api4Com WebPhone com o Bitrix24 CRM.

## Funcionalidades

- Click-to-Call direto do Bitrix24
- Registro automático de chamadas no CRM
- Identificação de contatos por número
- Sincronização de ramais com usuários Bitrix24
- Webhook para eventos de chamada em tempo real

## Desenvolvedor

**Thoth24** - Parceiro Bitrix24

## Tecnologias

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (Backend)

## Instalação

O aplicativo deve ser instalado através do Marketplace do Bitrix24.

## Configuração

1. Instale o app no seu portal Bitrix24
2. Acesse a configuração do app
3. Insira seu token da Api4Com
4. Configure o mapeamento de ramais para usuários

## Licença

Proprietário - Thoth24
```

### 2. index.html (Atualizar Meta Tags)

**Antes:**
```html
<meta property="og:title" content="Lovable App" />
<meta property="og:description" content="Lovable Generated Project" />
<meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />
<meta name="twitter:site" content="@Lovable" />
<meta name="twitter:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />
```

**Depois:**
```html
<meta property="og:title" content="Api4Com Connector para Bitrix24" />
<meta property="og:description" content="Integração de telefonia Api4Com com Bitrix24 CRM" />
<meta property="og:image" content="/og-image.png" />
<meta name="twitter:site" content="@thoth24" />
<meta name="twitter:image" content="/og-image.png" />
```

### 3. package.json

**Mudanças:**
- Nome: `"vite_react_shadcn_ts"` → `"api4com-bitrix24-connector"`
- Adicionar: `"author": "Thoth24"`
- Remover: `"lovable-tagger": "^1.1.13"` das devDependencies

### 4. vite.config.ts

**Antes:**
```typescript
import { componentTagger } from "lovable-tagger";
// ...
plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
```

**Depois:**
```typescript
// Sem import do lovable-tagger
plugins: [react()],
```

### 5. Deletar `.lovable/plan.md`

Remover o diretório `.lovable` e seu conteúdo, pois contém planos internos de desenvolvimento.

### 6. Edge Functions - URLs Default

**`supabase/functions/bitrix24-install/index.ts` (linha 312):**
```typescript
// Antes
const appUrl = Deno.env.get("APP_URL") || "https://api4com.lovable.app";

// Depois
const appUrl = Deno.env.get("APP_URL") || "https://api4com.thoth24.com.br";
```

**`supabase/functions/bitrix24-handler/index.ts` (linha 50):**
```typescript
// Antes
return Deno.env.get("APP_URL") || "https://api4com.lovable.app";

// Depois
return Deno.env.get("APP_URL") || "https://api4com.thoth24.com.br";
```

---

## Arquivos que NÃO Precisam ser Alterados

- `bun.lockb` / `package-lock.json`: Serão regenerados automaticamente após editar package.json
- Componentes React: Não contêm referências Lovable
- Edge functions (exceto URLs): Código limpo

---

## Considerações

1. **URL do App**: Alterei para `api4com.thoth24.com.br` - confirme se esta será a URL final
2. **Imagem OG**: Sugiro criar um `/public/og-image.png` com branding Thoth24
3. **Twitter Handle**: Usei `@thoth24` - ajuste se diferente
4. **Licença**: Adicionei "Proprietário - Thoth24" - ajuste conforme necessário

