# Documentação da API — IoT Rega

Base URL: `http://localhost:3000/api`

Todas as rotas, excepto as marcadas como **públicas**, exigem o cabeçalho
`Authorization: Bearer <token>`. O token é obtido em `POST /api/auth/login` e
tem validade de 7 dias por omissão (`JWT_EXPIRES_IN`).

Respostas de erro seguem o formato `{ "error": "descrição" }`, com os códigos
`400` (validação), `401` (autenticação), `404` (inexistente ou sem acesso),
`409` (duplicado) e `500` (erro interno).

---

## Autenticação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/auth/register` | **Pública.** Regista utilizador e devolve JWT. Password mínima de 6 caracteres. |
| POST | `/auth/login` | **Pública.** Autentica e devolve JWT. |
| GET | `/auth/me` | Dados do utilizador autenticado. |
| POST | `/auth/change-password` | Altera a password, validando a password actual. |
| POST | `/auth/forgot-password` | **Pública.** Gera token de recuperação (válido 30 min). Resposta genérica para não revelar se o email existe. |
| POST | `/auth/reset-password` | **Pública.** Redefine a password a partir do token. |

## Sistema

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | **Pública.** Estado do serviço, versão e timestamp. |

## Explorações (Farms)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/farms` | Lista as explorações do utilizador. |
| GET | `/farms/:id` | Detalhe de uma exploração. |
| POST | `/farms` | Cria exploração e associa-a ao utilizador como `owner`. |
| PUT | `/farms/:id` | Actualiza nome, descrição e localização. |
| DELETE | `/farms/:id` | Elimina a exploração (cascata para talhões, sensores e leituras). |

## Talhões (Plots)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/plots?farm_id=X` | Lista talhões, com geometria em GeoJSON e contagem de sensores. |
| GET | `/plots/geojson?farm_id=X` | `FeatureCollection` pronta para o Leaflet. |
| GET | `/plots/:id` | Detalhe de um talhão. |
| POST | `/plots` | Cria talhão a partir de um polígono GeoJSON. Sem `position`, usa o centróide do polígono. |
| PUT | `/plots/:id` | Actualiza nome, área, cultura, geometria e posição. |
| DELETE | `/plots/:id` | Elimina o talhão. |

Culturas aceites em `crop_type`: `vinha`, `olival`, `pomar`, `hortícolas`, `outro`.

## Sensores

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/sensors?plot_id=X` | Lista sensores de um talhão. |
| GET | `/sensors/:id` | Detalhe de um sensor. |
| POST | `/sensors` | Regista sensor. |
| PUT | `/sensors/:id` | Actualiza sensor. |
| DELETE | `/sensors/:id` | Elimina sensor. |

Tipos aceites: `temperature`, `humidity`, `soil_moisture`, `rainfall`, `wind_speed`.

## Leituras

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/readings?sensor_id=X&from=&to=&limit=` | Leituras em bruto de um sensor. |
| GET | `/readings/latest?plot_id=X` | Última leitura de cada sensor do talhão. |
| GET | `/readings/stats?sensor_id=X&period=24h` | Mínimo, máximo e média. Períodos: `24h`, `7d`, `30d`. |
| POST | `/readings` | Insere uma leitura e avalia as regras de alerta. |
| POST | `/readings/bulk` | Inserção em lote. |

## Alertas

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/alerts?resolved=false&limit=50` | Lista alertas, com nome do sensor e do talhão. |
| GET | `/alerts/count` | Contagem por severidade. |
| PATCH | `/alerts/:id/resolve` | Marca o alerta como resolvido. |

## Regras de Alerta

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/rules` | Lista regras. |
| POST | `/rules` | Cria regra (tipo de sensor, condição, limite, severidade). |
| PUT | `/rules/:id` | Actualiza regra, incluindo activar/desactivar. |
| DELETE | `/rules/:id` | Elimina regra. |

Condições: `>`, `<`, `>=`, `<=`, `=`. Severidades: `info`, `warning`, `critical`.

## Custos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/costs?plot_id=X&year=Y` | Lista custos do utilizador, com nome do talhão. |
| GET | `/costs/summary?farm_id=X` | Total por mês e categoria. |
| POST | `/costs` | Regista custo. Valida que o talhão pertence ao utilizador. |
| PUT | `/costs/:id` | Actualiza descrição, valor, data e categoria. |
| DELETE | `/costs/:id` | Elimina o registo. |

Categorias: `water`, `energy`, `maintenance`, `fertilization`.

## Clima

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/weather?plot_id=X&from=&to=` | Observações históricas guardadas. |
| GET | `/weather/forecast?plot_id=X` | Previsão para 7 dias. |
| POST | `/weather/refresh?plot_id=X` | Força actualização a partir da Open-Meteo. |

Os dados provêm da API pública [Open-Meteo](https://open-meteo.com/), sem chave
de acesso, actualizados de hora a hora por um cron job.

## Dashboard

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/dashboard/summary?farm_id=X` | Sensores, alertas por severidade, custo do mês, talhões, clima e últimas leituras numa só chamada. |
| GET | `/dashboard/chart?sensor_id=X&period=24h` | Série temporal agregada para o gráfico. |

---

## Notas de implementação

- **Autorização por exploração** — as consultas fazem `JOIN user_farm` com o
  `id` do utilizador do token, pelo que cada utilizador só acede aos dados das
  explorações a que pertence.
- **Recuperação de password** — a tabela `password_reset` guarda apenas o hash
  SHA-256 do token. Não existindo serviço de email configurado, o token é
  escrito no log do servidor e devolvido na resposta apenas fora de produção.
- **Dados dos sensores** — o projecto usa dados estáticos/simulados; o serviço
  MQTT existe em `src/services/mqttService.js` mas está desactivado em
  `src/app.js`.
