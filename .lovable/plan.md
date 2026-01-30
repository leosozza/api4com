
# Plano: Corrigir Click-to-Call para Usar Conector Api4Com (PBX)

## Problema Identificado

O evento `ONEXTERNALCALLSTART` **não está sendo disparado** porque, segundo a documentação oficial do Bitrix24:

> "To ensure the event is triggered, go to **Telephony > Telephony Settings** and select your application in the **Default outgoing call number** field."

O usuário configurou corretamente o "Número para chamadas efetuadas" **no perfil do usuário** (Telephony Users), mas **não configurou o número padrão GLOBAL** nas Configurações de Telefonia.

O Bitrix24 prioriza a telefonia nativa (WebRTC/Voximplant) quando não detecta que uma aplicação externa é o **provedor padrão global** de saída.

---

## Solução

### 1. Configuração Manual no Bitrix24 (Prioridade)

**Passo 1: Definir Número Padrão Global**
1. Ir em **CRM > Vendas > Canais de Vendas > Telefonia**
2. Clicar em **Configurar telefonia**
3. Selecionar **Configurações de Telefonia** (Telephony Settings)
4. No campo **"Número padrão para chamadas efetuadas"**, selecionar **"Api4Com: +5515996045202"**
5. Salvar

**Passo 2: Verificar Configuração do Usuário** (Já feito)
1. Na mesma área, ir em **Usuários de Telefonia**
2. O usuário Leonardo já está com "Api4Com" selecionado

**Passo 3: Testar**
- Abrir um Lead/Contato no CRM
- Clicar no número de telefone
- Se funcionou: o webhook `bitrix24-webhook` vai receber o evento
- Se não funcionou: O Bitrix ainda vai discar nativamente

---

### 2. Melhorias na UI de Diagnóstico

Criar alertas mais claros no painel de diagnóstico (`TelephonyDiagnostics.tsx`) para identificar automaticamente este problema.

**Verificações a adicionar:**
- Detectar se `voximplant.line.outgoing.get` retorna a linha Api4Com
- Comparar linha global vs linha do usuário
- Exibir alerta específico quando global != Api4Com

**Arquivos a modificar:**
- `src/components/setup/TelephonyDiagnostics.tsx`: Adicionar seção "Configuração de Saída Global"

---

### 3. Checklist para PBX/Conector REST

O usuário perguntou "como configurar como PBX". No Bitrix24 com REST connector:

| Configuração | Local | Valor |
|--------------|-------|-------|
| Número padrão global | Telefonia > Configurações | Api4Com: +55... |
| Número do usuário | Telefonia > Usuários | Api4Com: +55... |
| Telefone SIP | Telefonia > Usuários | "Não conectado" |
| Eventos registrados | (Via API) | ONEXTERNALCALLSTART |
| Linha externa | (Via API) | +5515996045202 |

---

## Resumo Técnico

O fluxo correto de click-to-call com conector REST:

```text
1. Usuário clica no telefone no CRM
2. Bitrix verifica "Número padrão para chamadas efetuadas"
   - Se = Aplicação REST: dispara evento ONEXTERNALCALLSTART para o webhook
   - Se = Telefonia nativa: ignora webhook e disca via WebRTC/Voximplant
3. Webhook recebe evento
4. Webhook chama Api4Com para originar chamada
5. PBX conecta ramal + destino
```

O problema atual está no passo 2: O Bitrix está usando telefonia nativa porque o **número padrão global** não está configurado para a aplicação Api4Com.
