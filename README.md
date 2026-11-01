# Central de Monitoramento & Rastreador Web

Sistema completo de rastreamento veicular em tempo real com backend Node.js + Express + Socket.IO + SQLite e frontend responsivo com mapa interativo Leaflet.js.

## 🚀 Funcionalidades

- **Autenticação JWT na Central**: Login seguro de operadores para acesso à central de monitoramento.
- **Autenticação por Token para Rastreadores**: Endpoint protegido onde cada dispositivo envia telemetria usando seu próprio token de acesso via Bearer Token ou cabeçalho `X-Device-Token`.
- **Transmissão em Tempo Real**: Atualização instantânea da frota usando WebSockets via Socket.IO.
- **Mapa Interativo Leaflet**:
  - Marcadores customizados para os veículos com tooltips dinâmicos (nome, velocidade, coordenadas).
  - Traçado de histórico de trajeto com linhas poligomais estilizadas e marcadores de início e fim.
  - Centralização automática ao selecionar veículos ou histórico.
- **Painel Lateral Responsivo**:
  - Contadores de dispositivos (Total, Online, Offline).
  - Filtro e busca de dispositivos em tempo real.
  - Indicadores visuais de status (online/offline).
  - Consulta de histórico de rotas com filtro de limite de pontos.
  - Cadastro interativo de novos dispositivos/veículos.
- **Detecção de Offline Automática**: Dispositivos sem comunicação recente são automaticamente marcados como offline.
- **Simulador de Rastreador**: Script CLI para simular o movimento de um ou múltiplos veículos por rotas pré-definidas em tempo real.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**:
  - Node.js
  - Express
  - Socket.IO
  - SQLite (com `better-sqlite3` e WAL mode para alta performance)
  - JSON Web Token (`jsonwebtoken`)
  - Bcrypt.js (`bcryptjs`)
- **Frontend**:
  - HTML5 / CSS3 responsivo (design moderno em tons escuros e azuis)
  - JavaScript Vanilla moderno (ES6+)
  - Leaflet.js (Mapas e camadas OpenStreetMap)
  - Socket.IO Client
- **Testes & Ferramentas**:
  - Node.js test runner nativo (`node:test`)
  - Simulador de rotas GPS integrado

---

## 📋 Pré-requisitos

- Node.js v18 ou superior instalado
- npm ou yarn

---

## ⚙️ Instalação e Execução

1. Clone o repositório ou navegue até o diretório do projeto:
   ```bash
   cd central-rastreamento
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. (Opcional) Configure as variáveis de ambiente:
   O projeto já inclui valores padrão no `.env.example`. Se desejar personalizar a porta ou o segredo JWT, crie um arquivo `.env`:
   ```bash
   cp .env.example .env
   ```

4. Inicie o servidor:
   ```bash
   npm start
   ```
   O servidor estará disponível em: `http://localhost:3000`

---

## 🔑 Credenciais Padrão

Ao iniciar pela primeira vez, o banco SQLite é inicializado com:

### Operador da Central (Web UI):
- **Usuário**: `admin`
- **Senha**: `admin123`

### Dispositivos Pré-cadastrados:
1. **Caminhão Entrega 01** (Placa: `ABC-1234`)
   - Token do rastreador: `tracker-token-secret-001`
2. **Van Distribuição 02** (Placa: `XYZ-5678`)
   - Token do rastreador: `tracker-token-secret-002`

---

## 📡 API do Rastreador (Envio de Posições)

### `POST /api/posicao`
Endpoint utilizado pelos dispositivos rastreadores para envio de telemetria GPS.

**Headers requeridos:**
- `Authorization: Bearer <TOKEN_DO_DISPOSITIVO>`
  *(ou via cabeçalho `X-Device-Token: <TOKEN_DO_DISPOSITIVO>`)*
- `Content-Type: application/json`

**Corpo da Requisição (JSON):**
```json
{
  "latitude": -23.55052,
  "longitude": -46.633308,
  "speed": 45.2,
  "heading": 180,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```
*Campos `speed`, `heading` e `timestamp` são opcionais.*

**Exemplo com cURL:**
```bash
curl -X POST http://localhost:3000/api/posicao \
  -H "Authorization: Bearer tracker-token-secret-001" \
  -H "Content-Type: application/json" \
  -d '{"latitude": -23.55052, "longitude": -46.633308, "speed": 40.5}'
```

---

## 🚗 Simulador de Rastreador GPS

O projeto inclui um script que simula um ou múltiplos rastreadores se deslocando em rotas reais pela cidade de São Paulo.

### Simular todos os veículos simultaneamente:
```bash
node scripts/simulador.js --all
```

### Simular um dispositivo específico:
```bash
node scripts/simulador.js --token tracker-token-secret-001
```

### Personalizar o intervalo de transmissão (em segundos):
```bash
node scripts/simulador.js --all --interval 1
```

---

## 🧪 Execução dos Testes Automatizados

Para executar os testes automatizados da API:
```bash
npm test
```

Os testes cobrem:
- Autenticação e login de operadores (JWT).
- Envio de telemetria de posição com validação de token do rastreador.
- Rejeição de tokens inválidos.
- Listagem de dispositivos e recuperação do histórico de rotas.

---

## 📂 Estrutura de Arquivos

```
├── public/                 # Interface Web da Central
│   ├── index.html          # Dashboard principal e tela de login
│   ├── css/style.css       # Estilos responsivos
│   └── js/app.js           # Lógica frontend (Leaflet, Socket.IO, JWT)
├── src/                    # Código-fonte do Backend
│   ├── db/database.js      # Conexão SQLite, migrações e seed
│   ├── middleware/auth.js  # Middlewares de autenticação (JWT e Token do Dispositivo)
│   ├── routes/
│   │   ├── authRoutes.js   # Rotas de login (/api/auth/login)
│   │   └── deviceRoutes.js # Rotas de posição e gestão de dispositivos
│   └── server.js           # Servidor Express + Socket.IO
├── scripts/
│   └── simulador.js        # Script de simulação de telemetria GPS
├── tests/
│   └── api.test.js         # Testes automatizados da API
├── .env.example            # Exemplo de configuração de ambiente
├── package.json            # Metadados e dependências
└── README.md               # Esta documentação
```

---

## 📄 Licença

Distribuído sob a licença MIT.
