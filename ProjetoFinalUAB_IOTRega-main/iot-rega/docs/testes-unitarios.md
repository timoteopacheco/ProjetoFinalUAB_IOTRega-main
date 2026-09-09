# Testes Unitários — IoT Rega Backend

## 1. Enquadramento

O backend é testado com **Jest 29** (test runner e mocking) e **Supertest 6**
(pedidos HTTP contra a aplicação Express, sem abrir socket).

Os testes são **unitários/de integração ao nível da rota**: não é necessária
base de dados PostgreSQL nem broker MQTT em execução. As dependências externas
são substituídas por *mocks*:

| Dependência real | Substituição em teste |
|------------------|-----------------------|
| `src/config/database` (PostgreSQL/PostGIS) | `jest.mock` — `query` e `pool.connect` devolvem resultados controlados |
| `mqtt` (broker MQTT) | `jest.mock('mqtt')` — cliente falso com `on`/`publish`/`subscribe` |
| `axios` (Open-Meteo) | `jest.mock('axios')` — respostas HTTP fixas |
| `src/app.js` (servidor + cron) | `tests/helpers/testApp.js` — monta apenas o router em teste |

O ficheiro `tests/helpers/testApp.js` constrói uma app Express mínima, injecta
um `req.user` fictício (substituindo o middleware JWT nas rotas protegidas) e
liga o `errorHandler`. Isto permite testar cada router isoladamente, sem
arrancar o servidor nem os *cron jobs* de `src/app.js`.

## 2. Como executar

```bash
npm test --prefix ProjetoFinalUAB_IOTRega-main/iot-rega/backend
```

Variantes úteis:

```bash
npx jest --runInBand --verbose
```

```bash
npx jest --runInBand --coverage --collectCoverageFrom='src/**/*.js'
```

O script `npm test` está definido em `package.json` como `jest --runInBand`
(execução sequencial, para evitar interferência entre mocks de módulos).

## 3. Resultados obtidos

Execução completa da suite (`npm test`):

```
Test Suites: 16 passed, 16 total
Tests:       168 passed, 168 total
Snapshots:   0 total
Time:        11.237 s
Ran all test suites.
```

**168 testes em 16 suites, todos aprovados, 0 falhas.**

### 3.1. Resultados por suite

| # | Suite | Testes | Módulo sob teste | Blocos cobertos |
|---|-------|-------:|------------------|-----------------|
| 1 | `tests/plots.test.js` | 17 | `routes/plots.js` | GET `/`, GET `/geojson`, GET `/:id`, POST, PUT, DELETE |
| 2 | `tests/readings.test.js` | 15 | `routes/readings.js` | GET `/`, GET `/latest`, GET `/stats`, POST `/`, POST `/bulk` |
| 3 | `tests/mqttService.test.js` | 14 | `services/mqttService.js` | `connect`, ingestão de mensagens, `publish` |
| 4 | `tests/farms.test.js` | 14 | `routes/farms.js` | GET `/`, GET `/:id`, POST, PUT, DELETE |
| 5 | `tests/auth.test.js` | 13 | `routes/auth.js` | register, login, me, change-password, forgot-password, reset-password |
| 6 | `tests/errorHandler.test.js` | 12 | `middleware/errorHandler.js` | `errorHandler`, `asyncHandler` |
| 7 | `tests/costs.test.js` | 11 | `routes/costs.js` | GET `/`, GET `/summary`, POST, PUT, DELETE |
| 8 | `tests/weatherService.test.js` | 10 | `services/weatherService.js` | `fetchForPlot`, `fetchAllPlots`, `getForecast` |
| 9 | `tests/alertService.test.js` | 10 | `services/alertService.js` | `evaluateCondition`, `evaluateSensor`, `evaluateAllRules` |
| 10 | `tests/sensors.test.js` | 9 | `routes/sensors.js` | GET `/`, GET `/:id`, POST, PUT, DELETE |
| 11 | `tests/authMiddleware.test.js` | 9 | `middleware/auth.js` | `authenticate`, `requireAdmin` |
| 12 | `tests/dashboard.test.js` | 8 | `routes/dashboard.js` | GET `/summary`, GET `/chart` |
| 13 | `tests/weatherRoutes.test.js` | 7 | `routes/weather.js` | GET `/`, GET `/forecast`, POST `/refresh` |
| 14 | `tests/alerts.test.js` | 7 | `routes/alerts.js` | GET `/`, PATCH `/:id/resolve`, GET `/count` |
| 15 | `tests/rules.test.js` | 6 | `routes/rules.js` | GET, POST, PUT, DELETE |
| 16 | `tests/mqttSimulator.test.js` | 6 | `services/mqttService.js` (modo `SIMULATE_SENSORS=true`) | simulador IoT |
| | **Total** | **168** | | |

### 3.2. Cobertura de código

Resultado de `npx jest --coverage --collectCoverageFrom='src/**/*.js'`:

| Ficheiro | % Instruções | % Ramos | % Funções | % Linhas |
|----------|-------------:|--------:|----------:|---------:|
| **`src/middleware`** | **100** | **95.23** | **100** | **100** |
| `auth.js` | 100 | 100 | 100 | 100 |
| `errorHandler.js` | 100 | 92.30 | 100 | 100 |
| **`src/routes`** | **98.00** | **93.00** | **97.82** | **97.89** |
| `alerts.js` | 100 | 100 | 100 | 100 |
| `auth.js` | 90.47 | 78.57 | 83.33 | 90.47 |
| `costs.js` | 100 | 93.93 | 100 | 100 |
| `dashboard.js` | 100 | 100 | 100 | 100 |
| `farms.js` | 100 | 100 | 100 | 100 |
| `plots.js` | 100 | 88.37 | 100 | 100 |
| `readings.js` | 100 | 96.66 | 100 | 100 |
| `rules.js` | 100 | 100 | 100 | 100 |
| `sensors.js` | 100 | 100 | 100 | 100 |
| `weather.js` | 100 | 100 | 100 | 100 |
| **`src/services`** | **97.18** | **94.28** | **94.44** | **97.77** |
| `alertService.js` | 100 | 94.44 | 100 | 100 |
| `mqttService.js` | 94.80 | 93.47 | 90.90 | 96.00 |
| `weatherService.js` | 100 | 100 | 100 | 100 |

Não estão cobertos, por opção, `src/app.js` (arranque do servidor e *cron
jobs*), `src/config/database.js` (pool de ligações real) e
`src/config/db-setup.js` (script de criação do schema) — são pontos de entrada
de infra-estrutura, substituídos por mocks nos testes.

**A camada de lógica aplicacional — rotas, middleware e serviços — está coberta
acima de 97 % em instruções e linhas.**

## 4. Tipos de cenário testados

Cada rota é testada em, pelo menos, três eixos:

1. **Caminho feliz** — pedido válido devolve `200`/`201` e o corpo esperado;
   verifica-se também o SQL invocado e os parâmetros passados (evita
   regressões nas queries PostGIS/time-series).
2. **Validação de entrada** — campos em falta ou inválidos devolvem `400`
   (ex.: `sensor_id é obrigatório`, `crop_type` fora da lista, área negativa,
   password com menos de 6 caracteres).
3. **Autorização e inexistência** — recurso de outro utilizador ou inexistente
   devolve `404` (as queries fazem `JOIN user_farm` com o `id` do token);
   credenciais inválidas devolvem `401`.
4. **Erros de infra-estrutura** — falha da base de dados propaga para o
   `errorHandler` e devolve `500`, sem *stack trace* exposto e sem deixar
   escapar excepções não tratadas nos serviços de fundo (`alertService`,
   `mqttService`).

### Exemplos de assertivas (excerto do output `--verbose`)

```
PASS tests/auth.test.js
  POST /api/auth/register
    √ cria o utilizador e devolve um token
    √ rejeita passwords com menos de 6 caracteres
  POST /api/auth/login
    √ devolve token com credenciais válidas
    √ rejeita password errada
    √ rejeita utilizador inexistente
  GET /api/auth/me
    √ exige token
    √ rejeita token expirado
  POST /api/auth/forgot-password
    √ não revela se o email existe
    √ guarda apenas o hash do token, nunca o token em claro
  POST /api/auth/reset-password
    √ rejeita token inválido ou expirado
    √ redefine a password e invalida o token usado

PASS tests/alertService.test.js
  evaluateCondition
    √ avalia correctamente cada operador
    √ devolve false para operadores desconhecidos
  evaluateSensor
    √ cria um alerta quando a regra é violada e não existe alerta activo
    √ não duplica o alerta se já existir um por resolver
    √ não cria alerta quando o valor está dentro do limite
    √ termina silenciosamente se o sensor não existir
    √ não deixa escapar erros da base de dados
```

O output completo, teste a teste, encontra-se em
[`evidencias/jest-verbose.txt`](evidencias/jest-verbose.txt); a tabela de
cobertura integral em [`evidencias/jest-coverage.txt`](evidencias/jest-coverage.txt).

## 5. Evidências

| Evidência | Ficheiro |
|-----------|----------|
| Output resumido da execução (screenshot do terminal) | incluído no relatório |
| Output completo com nome de cada teste | `docs/evidencias/jest-verbose.txt` |
| Relatório de cobertura de código | `docs/evidencias/jest-coverage.txt` |
| Código dos testes | `backend/tests/*.test.js` (2 368 linhas) |
