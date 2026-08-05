# Tenant DualWin: diagnóstico e consolidação

## O que os dados mostram

O portal `dualwin.bitrix24.com.br` (member_id `98181653441a68555da7ba1102d6aca6`) existe em **três registros de empresa diferentes**:

| Empresa | Criada em | member_id | Credenciais | Chamadas | Membros |
|---|---|---|---|---|---|
| `b971eb6d…` DualWin Consultoria Empresarial | 30/01 | ausente | Bitrix24 + Api4Com + 1 linha | 5 | 1 |
| `4f7844d1…` Portal dualwin.bitrix24.com.br | 30/01 | presente | Api4Com + 1 linha | 0 | 0 |
| `1cdd794b…` DualWin Consultoria Empresarial | 19/05 | ausente | nenhuma | 0 | 1 |

Sinais de uso:
- Últimas chamadas registradas: 30/01, 02/02 e 13/02 (5 no total, todas de saída).
- Último refresh do token Bitrix24: 24/02 (token expirado desde então).
- Em 19/05 alguém abriu o app e criou uma terceira empresa manual, sem credenciais.

Conclusão: o tenant **usou** a aplicação em fevereiro e voltou a acessar em maio, mas caiu num perfil vazio. Desde 24/02 não há renovação de token nem chamadas — na prática, hoje está parado.

## Causa provável

A auto-vinculação por `bitrix_member_id` resolve para `4f7844d1…`, que está vazia (sem membros, sem credenciais Bitrix). As credenciais reais e o histórico estão em `b971eb6d…`, que não tem `bitrix_member_id`. Quem abre o app pelo portal não enxerga os dados corretos e acaba criando empresa nova — foi o que aconteceu em maio.

## O que fazer

1. **Consolidar o tenant** numa única empresa (`b971eb6d…`, que concentra credenciais e histórico):
   - mover `bitrix_member_id` do registro `4f7844d1…` para `b971eb6d…`;
   - migrar linhas/credenciais Api4Com órfãs, removendo duplicatas;
   - remover/arquivar os registros `4f7844d1…` e `1cdd794b…`.
2. **Reautorizar o portal**: o token está expirado desde 24/02. O admin precisa reabrir o app no Bitrix24 para gerar novo par de tokens (ou reinstalar, se o refresh também tiver expirado).
3. **Prevenir recorrência**: na criação/resolução de empresa, quando o app roda dentro do Bitrix, sempre casar por `bitrix_member_id` antes de permitir criar empresa nova, e bloquear a criação manual em contexto de portal já conhecido.

## Detalhes técnicos

- Consolidação via migração SQL pontual (UPDATE em `companies.bitrix_member_id`, re-parent de `api4com_credentials`/`external_phone_lines`/`call_logs`, DELETE dos duplicados respeitando FKs).
- Ajuste na Edge Function `link-user-to-company` e no fluxo de `CompanySetup` para não criar empresa quando já existe uma com o `member_id` do portal.
- Verificação pós-consolidação: `useCompany` deve retornar `b971eb6d…` para qualquer usuário do portal DualWin.
