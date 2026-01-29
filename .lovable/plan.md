

## Plano: Automatizar Busca de Informações da Api4Com

### Contexto

Atualmente, o sistema exige que o usuário configure manualmente as linhas telefônicas. Analisando a documentação e os logs da Api4Com, encontrei que:

**O que pode ser automatizado:**
- **Domínio da conta** (ex: `thoth24.api4com.com`) - disponível no endpoint `/integrations`
- **Ramal do usuário** (ex: `1000`) - disponível na metadata da integração `sippulse`

**O que precisa continuar manual:**
- **Linhas telefônicas/DIDs** (números de entrada como +55 11 3000-0000) - a API Api4Com nao expoe um endpoint para listar os DIDs da conta. Estes numeros sao gerenciados pelo portal administrativo da Api4Com.

### Mudancas Propostas

#### 1. Melhorar api4com-setup/index.ts
Extrair automaticamente o dominio e o ramal do usuario a partir da resposta do `/integrations`:

```text
GET /integrations retorna:
[
  {
    "gateway": "sippulse",
    "metadata": {
      "domain": "thoth24.api4com.com",  <- Extrair automaticamente
      "username": "1000"                <- Este e o ramal do usuario
    }
  }
]
```

**Acoes:**
- Salvar `api4com_domain` no banco automaticamente
- Criar mapeamento do usuario automaticamente se encontrar o ramal

#### 2. Atualizar o fluxo de user_mappings
Em vez de exigir configuracao manual, usar o ramal extraido da Api4Com e vincula-lo ao usuario Bitrix24 logado.

#### 3. Simplificar PhoneLinesSetup.tsx
- Manter a configuracao de linhas telefonica (DIDs) como manual
- Adicionar explicacao clara de que DIDs sao os numeros de telefone publicos da empresa

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/api4com-setup/index.ts` | Extrair dominio e ramal do sippulse integration |
| `src/hooks/useCredentials.ts` | Retornar dados extraidos do setup |
| `src/components/setup/steps/CredentialsSetup.tsx` | Mostrar ramal detectado e dominio |

### Resumo Visual

```text
Antes:
1. Usuario coloca token Api4Com
2. Usuario digita linhas manualmente
3. Usuario mapeia ramais manualmente

Depois:
1. Usuario coloca token Api4Com
2. Sistema extrai dominio e ramal automaticamente
3. Linhas telefonica (DIDs) continuam manuais (nao disponivel via API)
4. Mapeamento de ramal pode ser automatico (ramal + usuario Bitrix logado)
```

### Nota Importante

As **linhas telefonica** (DIDs) nao podem ser automatizadas porque a Api4Com nao expoe esse dado via API publica. O usuario precisa saber quais numeros sua empresa possui e cadastra-los manualmente para que o Bitrix24 identifique chamadas recebidas.

