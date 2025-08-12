## Task Manager – Documentação Completa

Aplicativo de gerenciamento de tarefas com autenticação Google, Firestore, tags, personalização visual e subtarefas. Construído com React + Vite, animações com Framer Motion e testes com Vitest e Playwright.

### Demo (Local)
- Inicie a aplicação e a UI ficará centralizada no meio da tela (tanto login quanto tela principal), com design escuro e responsivo.

### Funcionalidades
- Autenticação com Google (Firebase Auth)
- CRUD de tarefas com ordenação por prioridade
- Personalização de cor, fonte e alinhamento do título e descrição
- Tags globais e por tarefa
- Marcar tarefa como concluída
- Subtarefas por tarefa (criar, alternar, remover)
- Animações suaves na lista (Framer Motion)
- Tratamento de erros básico em operações remotas

### Atalhos de UI
- Clique em “Alinhar Título” e “Alinhar Descrição” para alternar alinhamento entre esquerda/centro/direita.
- “Gerenciar Tags” permite adicionar/remover tags rapidamente.
- Em cada tarefa, a seção “Subtarefas” permite adicionar, marcar como concluída e excluir subtarefas.

### Pré-requisitos
- Node.js 18+

### Instalação
```bash
npm install
```

### Configuração de Ambiente
Crie um arquivo `.env` na raiz baseado no `.env.example`:
```bash
cp .env.example .env
```
Preencha com as credenciais do seu projeto Firebase (ou use os valores padrão já incorporados como fallback):

Variáveis suportadas (todas com prefixo `VITE_`):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

### Executar em Desenvolvimento
```bash
npm run dev
```
O app sobe, por padrão, em `http://localhost:5173`. Caso esteja usando `vite preview` em produção local, utilize `http://localhost:10000`.

### Build de Produção
```bash
npm run build
npm run preview
```

### Testes
- Unitários e integração (Vitest + Testing Library):
```bash
npm run test
```
- Aceitação (Playwright):
```bash
# Instale os navegadores do Playwright uma vez:
npx playwright install

npm run test:e2e
```
Obs.: Os testes E2E partem de uma UI pública. Para cenários autenticados, configure mocks de autenticação ou use uma conta de teste em ambiente isolado.

### Estrutura do Projeto
```
Task-Manager/
  src/
    main.jsx         # Bootstrap React
    App.jsx          # Entrada do app, wrapper centralizado
    TaskManager.jsx  # Lógica principal de tarefas (CRUD, tags, subtarefas)
    firebaseConfig.js# Configuração Firebase com variáveis de ambiente
    index.css        # Estilos globais centralizados
  public/
  assets/
  vite.config.js
  package.json
  README.md
```

### Firebase
O arquivo `src/firebaseConfig.js` usa variáveis de ambiente com fallback para as credenciais fornecidas. Garanta que o Firestore esteja habilitado e com regras apropriadas para seu ambiente. Exemplo de regra de desenvolvimento (não use em produção):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if request.auth != null
                                  && resource.data.userId == request.auth.uid;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Scripts
- `dev`: inicia o servidor Vite
- `build`: build para produção
- `preview`: pré-visualização do build
- `test`: roda testes unitários/integração
- `test:e2e`: testes de aceitação com Playwright

### Estrutura de Dados no Firestore
Cada documento em `tasks` contém:
```json
{
  "userId": "<uid>",
  "title": "string",
  "description": "string",
  "priority": 1,
  "completed": false,
  "tags": [{ "name": "string", "bgColor": "#hex", "textColor": "#hex" }],
  "subtasks": [{ "id": "uuid", "title": "string", "completed": false }],
  "titleTextColor": "#hex",
  "titleFont": "string",
  "descriptionColor": "#hex",
  "descriptionFont": "string",
  "descriptionFontSize": "14",
  "areaColor": "#hex",
  "textAlignTitle": "center",
  "textAlignDescription": "center",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```

### Licença
Consulte `LICENSE`.
