
Objetivo
- Fazer a criação de empresa funcionar de forma consistente dentro do Bitrix24, mesmo após clicar em “sair”, eliminando o erro “User not authenticated”.
- Tornar o app resiliente a atrasos na carga do SDK do Bitrix24 (BX24) e a condições comuns de iframe (rede mais lenta / storage restrito).

Diagnóstico (o que está acontecendo hoje)
- Você está “dentro do Bitrix24”, mas o app mostra “Modo desenvolvimento” porque o `window.BX24` não está disponível a tempo e o código faz fallback após ~3s. Se o SDK carregar depois disso, o app não tenta inicializar de novo.
- Você clicou em “sair” (logout). O app desloga a sessão do backend e não garante automaticamente uma nova sessão (anônima) antes de permitir ações.
- A criação de empresa depende de uma sessão válida (`supabase.auth.getSession()`), então quando a sessão está ausente (após logout, ou ainda não reestabelecida no iframe), o fluxo quebra e aparece “User not authenticated”.
- Além disso, hoje o frontend chama a função `create-company` via `fetch`. Em iframe, é melhor chamar via `supabase.functions.invoke` para padronizar headers/auth e reduzir problemas de CORS/intermediários.

Plano de implementação (passos)
1) Tornar o “logout” seguro (reset de sessão)
   - Ajustar o comportamento do botão de sair no topo:
     - Em vez de apenas `signOut()`, implementar um “Resetar sessão”:
       1) faz signOut
       2) em seguida recria sessão anônima automaticamente (sign-in anônimo)
     - Resultado: o usuário nunca fica “sem sessão” ao clicar em sair, evitando o “User not authenticated”.
   - (Opcional/UX) Renomear o ícone/tooltip para deixar claro que é “Resetar sessão” em vez de “Sair”, já que aqui não existe login tradicional.

2) Reforçar a garantia de sessão antes de ações críticas (especialmente criar empresa)
   - No `useCompany().createCompany`:
     - Se `getSession()` vier vazio, tentar `signInAnonymously()` e depois chamar `getSession()` novamente (com retry curto).
     - Se ainda assim não tiver sessão, mostrar um erro amigável explicando que o Bitrix/iframe bloqueou a sessão e sugerindo recarregar/abrir em outra aba.
   - No `CompanySetup` (UI):
     - Desabilitar o botão “Criar Empresa” enquanto a sessão não estiver pronta.
     - Exibir um aviso pequeno “Reconectando…” e um botão “Reconectar” (que força o sign-in anônimo) se detectar ausência de sessão.
   - Isso elimina o cenário em que o usuário clica rápido e a sessão ainda não foi reestabelecida.

3) Trocar a chamada da função backend de `fetch` para `supabase.functions.invoke`
   - Em `useCompany`:
     - Substituir o `fetch(`${VITE_SUPABASE_URL}/functions/v1/create-company`, ...)` por:
       - `supabase.functions.invoke('create-company', { body: { name } })`
     - Benefícios:
       - O SDK injeta headers corretos
       - Menos risco de CORS/preflight inconsistente em iframe
       - Código mais curto e mais padrão para o projeto

4) Deixar o backend `create-company` mais robusto para autenticação moderna
   - Atualizar a função `create-company` para validar o token usando o método recomendado:
     - `auth.getClaims(token)` (com client inicializado com ANON KEY + Authorization global)
   - Manter um client separado com SERVICE ROLE apenas para inserts (companies/company_members).
   - Melhorar logs (sem expor token):
     - Logar se veio Authorization, tamanho do token, e mensagens de erro do `getClaims`.
   - Resultado: reduz falsos negativos de “User not authenticated” quando o token/assinatura usa signing-keys.

5) Corrigir a detecção do Bitrix (remover falso “Modo desenvolvimento”)
   - Ajustar `BitrixContext`:
     - Aumentar timeout de detecção do `window.BX24` (ex.: 10–15s) ou implementar re-tentativas progressivas (ex.: 3s, 6s, 12s) antes de assumir “dev mode”.
     - Se o app já entrou em “dev mode” e depois `window.BX24` aparecer, reexecutar a inicialização (sem precisar recarregar).
   - Resultado: dentro do Bitrix, o app deixa de “cair” no modo desenvolvimento por causa de atraso de rede.

Sequência recomendada
- Primeiro: (1) + (2) para eliminar o problema imediatamente após logout.
- Depois: (3) para reduzir fragilidade em iframe.
- Depois: (4) para garantir validação consistente no backend.
- Por fim: (5) para resolver a raiz do “Modo desenvolvimento” dentro do Bitrix.

Critérios de aceite (como vamos validar)
- Dentro do Bitrix24:
  - Abrir o app e criar empresa com sucesso na primeira tentativa.
  - Clicar em “sair/resetar sessão” e imediatamente conseguir criar empresa (sem recarregar).
  - O botão “Criar Empresa” não permite clique enquanto não houver sessão pronta.
  - O app não exibe “Modo desenvolvimento” de forma permanente quando o SDK está disponível (ou se exibir, ele se corrige sozinho quando BX24 carregar).
- Verificar no console:
  - Logs indicando criação/recriação de sessão anônima.
- Verificar no backend:
  - A função `create-company` recebe a requisição e retorna 200 com `company`.

Riscos e observações
- Alguns ambientes de iframe podem bloquear storage/cookies de terceiros: mesmo com correções, pode ser necessário abrir o app em “nova aba” pelo Bitrix ou ajustar configurações do navegador. O plano acima minimiza, mas não elimina 100% essas limitações do browser.
- Manteremos a segurança: a função `create-company` continuará exigindo token válido; apenas garantiremos que o app sempre tenha uma sessão anônima válida quando estiver no Bitrix.

Arquivos que provavelmente serão ajustados (técnico)
- Frontend:
  - `src/components/layout/AppLayout.tsx` (botão “sair” → resetar sessão)
  - `src/hooks/useAuth.ts` (adicionar método resetSession ou suporte a sign-in anônimo pós-logout)
  - `src/hooks/useCompany.ts` (invoke + ensure session/retry)
  - `src/components/setup/steps/CompanySetup.tsx` (UI/disable + reconectar)
  - `src/contexts/BitrixContext.tsx` (retries de BX24 e/ou re-init; opcionalmente re-auth pós SIGNED_OUT)
- Backend:
  - `supabase/functions/create-company/index.ts` (getClaims + logs + client duplo)

Teste end-to-end guiado (passo a passo para você)
1) Abrir o app dentro do Bitrix24.
2) Ir em Dashboard → Setup → Empresa.
3) Criar empresa.
4) Clicar no botão de sair/reset.
5) Criar empresa novamente (em outro tenant/ambiente de teste) ou validar que o botão não quebra e que a sessão volta automaticamente.
