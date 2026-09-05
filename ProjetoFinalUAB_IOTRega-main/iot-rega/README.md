# 🌿 IoT Rega — Plataforma de Gestão de Rega Vitivinícola

> Projeto Final de Curso — Licenciatura em Engenharia Informática
> Universidade Aberta | António Pacheco | nº 2100357 | Susana Pedro | nº 2202973

---

## 📐 Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                     │
│          WebSIG (Leaflet) + Dashboards (Recharts)        │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (HTTP/JSON)
┌──────────────────────▼──────────────────────────────────┐
│                  BACKEND (Node.js/Express)                │
│   Auth JWT │ CRUD │ Alertas │ Weather │ Dashboard API    │
└─────┬──────────────────┬────────────────────────────────┘
      │                  │
┌─────▼──────┐   ┌───────▼────────────────────────────────┐
│ PostgreSQL │   │              MQTT Broker               │
│  PostGIS   │   │  (Mosquitto / simulação integrada)      │
│TimescaleDB │   └──────────────────────┬─────────────────┘
└────────────┘                          │
                               ┌────────▼────────┐
                               │  Sensores IoT   │
                               │  (LoRa / simulados) │
                               └─────────────────┘
```

---

## 🚀 Início Rápido (Docker — recomendado)

### Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 20+](https://nodejs.org/) (apenas se quiseres correr o frontend fora do Docker)

### 1. Configurar credenciais
```bash
cd iot-rega
cp .env.example .env
```

Preencher `DB_PASSWORD` e `JWT_SECRET` no `.env` (o `docker-compose` recusa
arrancar sem eles). Sugestões de geração:

```bash
openssl rand -base64 24   # DB_PASSWORD
openssl rand -hex 32      # JWT_SECRET
```

### 2. Arrancar todos os serviços
```bash
docker compose up -d --build
```

Isto inicia:
- **PostgreSQL + PostGIS** na porta 5432 (schema e dados de demonstração aplicados automaticamente)
- **Mosquitto MQTT Broker** nas portas 1883 / 9001
- **Backend API** em http://localhost:3000
- **Frontend** em http://localhost:8080

### 3. Verificar que está a funcionar
```bash
curl http://localhost:3000/api/health
```

### 4. Iniciar sessão
Abre http://localhost:8080 e usa a conta de demonstração criada pelo `schema.sql`:
- **Email:** `admin@iotrega.pt`
- **Password:** `admin123`

Esta conta já tem uma exploração ("Quinta do Demo"), um talhão com polígono e 3 sensores associados, prontos a receber leituras do simulador.

---

## 💻 Desenvolvimento Local (sem Docker)

### Backend
```bash
cd backend
npm install
cp .env.example .env        # editar com as credenciais da tua BD local
psql -U postgres -c "CREATE DATABASE iotrega;"
npm run db:setup            # aplica db/schema.sql (extensões, tabelas, dados de demo)
npm run dev                 # http://localhost:3000
```

> Requer PostgreSQL com as extensões `postgis` e `timescaledb` instaladas.

### Frontend
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Em desenvolvimento, o Vite faz proxy de `/api/*` para `http://localhost:3000` (ver `vite.config.js`), pelo que não é necessário configurar CORS nem uma URL de API separada.

---

## 📡 API Endpoints

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/register` | Registar utilizador |
| POST | `/api/auth/login` | Login (retorna JWT) |
| GET  | `/api/auth/me` | Dados do utilizador autenticado |
| POST | `/api/auth/change-password` | Alterar password (autenticado) |
| POST | `/api/auth/forgot-password` | Pedir token de recuperação |
| POST | `/api/auth/reset-password` | Redefinir password com token |

> Documentação completa dos endpoints em [`docs/api.md`](docs/api.md).

### Explorações (Farms)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/farms` | Listar explorações |
| GET  | `/api/farms/:id` | Detalhe |
| POST | `/api/farms` | Criar |
| PUT  | `/api/farms/:id` | Actualizar |
| DELETE | `/api/farms/:id` | Eliminar |

### Talhões (Plots)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/plots?farm_id=X` | Listar talhões |
| GET  | `/api/plots/geojson?farm_id=X` | FeatureCollection para mapa |
| POST | `/api/plots` | Criar talhão (com polígono GeoJSON) |
| PUT  | `/api/plots/:id` | Actualizar |
| DELETE | `/api/plots/:id` | Eliminar |

### Sensores
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/sensors?plot_id=X` | Sensores de um talhão |
| POST | `/api/sensors` | Registar sensor |
| PUT  | `/api/sensors/:id` | Actualizar |
| DELETE | `/api/sensors/:id` | Eliminar |

### Leituras (TimescaleDB)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/readings?sensor_id=X&from=&to=` | Leituras em bruto |
| GET  | `/api/readings?sensor_id=X&interval=1h` | Leituras agregadas |
| GET  | `/api/readings/latest?plot_id=X` | Última leitura por sensor |
| GET  | `/api/readings/stats?sensor_id=X&period=24h` | Estatísticas |
| POST | `/api/readings` | Inserir leitura manual |
| POST | `/api/readings/bulk` | Inserção em lote |

### Dashboard
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/dashboard/summary?farm_id=X` | Resumo completo |
| GET  | `/api/dashboard/chart?sensor_id=X&period=24h` | Dados para gráfico |

### Alertas e Regras
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/alerts?resolved=false` | Alertas activos |
| PATCH | `/api/alerts/:id/resolve` | Resolver alerta |
| GET  | `/api/alerts/count` | Contagem por severidade |
| GET/POST/PUT/DELETE | `/api/rules` | CRUD de regras de alerta |

### Custos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/costs?plot_id=X&year=Y` | Listar custos |
| GET  | `/api/costs/summary?farm_id=X` | Resumo mensal por categoria |
| POST | `/api/costs` | Registar custo |
| PUT | `/api/costs/:id` | Actualizar |
| DELETE | `/api/costs/:id` | Eliminar |

### Clima
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/api/weather?plot_id=X` | Dados históricos |
| GET  | `/api/weather/forecast?plot_id=X` | Previsão 7 dias |
| POST | `/api/weather/refresh?plot_id=X` | Actualizar agora |

---

## 🤖 Dados dos sensores

> **Estado actual:** o projecto usa **dados estáticos/simulados**. O serviço MQTT
> (`src/services/mqttService.js`) e a extensão TimescaleDB continuam no
> repositório mas estão **desactivados** — ver as linhas comentadas em
> `src/app.js` e `db/schema.sql`. A secção abaixo descreve o comportamento do
> simulador quando reactivado.

Com `SIMULATE_SENSORS=true` no `.env` (ou por omissão no `docker-compose.yml`), o backend gera automaticamente leituras realistas para todos os sensores registados, a cada `SIMULATE_INTERVAL_MS` (10s por omissão), publicando-as por MQTT (ou directamente na BD se não houver broker disponível).

Valores simulados por tipo:
- `temperature`: 10–38 °C
- `humidity`: 30–95 %
- `soil_moisture`: 10–80 %
- `rainfall`: 0–15 mm
- `wind_speed`: 0–40 km/h

Cada leitura simulada é avaliada em tempo real pelo motor de regras (`alertService`), pelo que os alertas de demonstração ("Humidade do solo baixa", "Temperatura crítica") podem disparar organicamente enquanto o simulador corre.

---

## 🖥️ Frontend

React (Vite) com:
- **Autenticação** — login/registo com JWT guardado em `localStorage`, rotas protegidas.
- **Dashboard** — indicadores (sensores activos, alertas, custo do mês, clima) e gráfico de leituras recentes (Recharts).
- **WebSIG** — mapa Leaflet por exploração, com desenho de polígonos de talhões (Leaflet.draw) e visualização das geometrias existentes.
- **Sensores** — CRUD por talhão e vista de detalhe com gráfico histórico (24h / 7d / 30d).
- **Alertas** — listagem e resolução.
- **Regras** — CRUD de regras de alerta (tipo de sensor, condição, limite, severidade).
- **Custos** — registo, edição e eliminação de custos operacionais, com resumo mensal por categoria (gráfico de barras empilhado).
- **Clima** — histórico e previsão a 7 dias por talhão, com actualização manual via Open-Meteo.
- **Perfil** — dados da conta e alteração de password.
- **Recuperação de password** — pedido de token e redefinição.
- **Páginas 404 e de erro** — rota catch-all e `ErrorBoundary` para erros de runtime.
- **Feedback ao utilizador** — spinners de carregamento e toasts de sucesso/erro.
- **Responsividade** — menu lateral colapsável em ecrãs até 900px e formulários empilhados até 600px.

---

## 🗂️ Estrutura do Projecto

```
iot-rega/
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   └── db-setup.js      ← aplica db/schema.sql (npm run db:setup)
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js, farms.js, plots.js, sensors.js,
│   │   │   ├── readings.js, weather.js, alerts.js,
│   │   │   └── rules.js, costs.js, dashboard.js
│   │   └── services/
│   │       ├── mqttService.js
│   │       ├── alertService.js
│   │       └── weatherService.js
│   ├── db/schema.sql
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/client.js        ← axios + interceptor JWT
│   │   ├── context/             ← AuthContext, FarmContext
│   │   ├── components/          ← Layout, ProtectedRoute, StatCard, DrawControl
│   │   └── pages/                ← Login, Register, Dashboard, Farms, PlotsMap,
│   │                                Sensors, SensorDetail, Alerts, Rules, Costs, Weather
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── mosquitto.conf
└── README.md
```

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Base de Dados | PostgreSQL 16 + PostGIS + TimescaleDB |
| Mensageria IoT | MQTT (Eclipse Mosquitto) |
| Autenticação | JWT (jsonwebtoken) + bcrypt |
| API Climática | Open-Meteo (gratuita) |
| Frontend | React + Vite + React Router |
| Mapas / WebSIG | Leaflet + Leaflet.draw |
| Gráficos | Recharts |
| Contentorização | Docker + Docker Compose (Nginx a servir o build do frontend) |

---

## 🧪 Testes

```bash
cd backend
npm install
npm test
```

Testes unitários com **Jest** e **Supertest**, cobrindo:

- **`tests/auth.test.js`** — registo, login, `/me`, alteração e recuperação de password. Verifica que a password é guardada com hash, que o hash nunca é devolvido na resposta, que tokens expirados são rejeitados e que a recuperação não revela se um email existe.
- **`tests/alertService.test.js`** — avaliação de condições e criação de alertas, incluindo a não-duplicação de alertas por resolver.
- **`tests/weatherService.test.js`** — integração com a Open-Meteo, com `axios` mockado.

A base de dados é substituída por um mock, pelo que os testes correm sem PostgreSQL nem rede.

---

## ✅ Nota sobre verificação

O frontend foi validado num browser real (build de produção sem erros, ecrãs de login/registo, tratamento de erros de rede, redireccionamento de rotas protegidas) e o backend tem cobertura automatizada nas áreas descritas acima. A validação ponta-a-ponta com dados reais (mapa, dashboards, sensores) requer a stack completa via `docker compose up -d --build`.

---

## 📋 Próximos Passos (evolução futura)

- [ ] Aplicação Mobile (React Native)
- [ ] Notificações externas (email / SMS) para alertas críticos
- [ ] Automatização da rega (accionamento de `irrigation_system` a partir de regras)
- [ ] Exportação PDF/CSV de relatórios
- [x] Testes automatizados no backend (Jest + Supertest)
- [ ] Testes automatizados no frontend (Vitest)
- [ ] Envio de emails (recuperação de password funciona por token, sem email)
- [ ] Integração com sensores físicos reais (actualmente suportado via MQTT + simulador)
