# Documentação da API — IoT Rega

**Base URL:** `http://localhost:3000/api`
**Versão:** 1.0.0
**Formato:** JSON (`Content-Type: application/json`)

Todas as rotas, excepto as marcadas como **pública**, exigem o cabeçalho
`Authorization: Bearer <token>`. O token é obtido em `POST /api/auth/login` e
tem validade de 7 dias por omissão (`JWT_EXPIRES_IN`).

## Convenções

**Códigos de estado**

| Código | Significado |
|--------|-------------|
| `200 OK` | Pedido processado com sucesso |
| `201 Created` | Recurso criado |
| `400 Bad Request` | Erro de validação dos dados enviados |
| `401 Unauthorized` | Token em falta, inválido ou expirado; credenciais erradas |
| `403 Forbidden` | Autenticado mas sem permissão (`requireAdmin`) |
| `404 Not Found` | Recurso inexistente **ou sem acesso** (ver nota de segurança) |
| `409 Conflict` | Violação de unicidade (ex.: email ou `device_id` já registados) |
| `500 Internal Server Error` | Erro interno |

**Formato de erro**

```json
{ "error": "Talhão não encontrado ou sem acesso à exploração." }
```

Erros de validação do `express-validator` devolvem um array:

```json
{ "errors": [ { "type": "field", "msg": "Invalid value", "path": "email", "location": "body" } ] }
```

**Nota de segurança.** Um recurso que exista mas pertença a outro utilizador
devolve `404` e não `403`, para não revelar a existência de dados de terceiros.
O isolamento é garantido por `JOIN user_farm` com o `id` do utilizador do token
em todas as consultas (excepções documentadas em
[`estado-implementacao.md`](estado-implementacao.md)).

---

# 1. Autenticação — `/api/auth`

| Método | Endpoint | Auth | Descrição |
|--------|----------|:----:|-----------|
| POST | `/auth/register` | pública | Regista utilizador e devolve JWT |
| POST | `/auth/login` | pública | Autentica e devolve JWT |
| GET | `/auth/me` | JWT | Dados do utilizador autenticado |
| POST | `/auth/change-password` | JWT | Altera password validando a actual |
| POST | `/auth/forgot-password` | pública | Gera token de recuperação (30 min) |
| POST | `/auth/reset-password` | pública | Redefine password a partir do token |

### POST `/auth/register`

**Corpo**

| Campo | Tipo | Obrig. | Regra |
|-------|------|:------:|-------|
| `name` | string | sim | Não vazio |
| `email` | string | sim | Formato de email, normalizado |
| `password` | string | sim | Mínimo 6 caracteres |

```json
{ "name": "Susana Pedro", "email": "susana@exemplo.pt", "password": "segredo123" }
```

**Resposta `201`** — a password é guardada com bcrypt (10 rondas) e nunca devolvida.

```json
{
  "user": { "id": 1, "name": "Susana Pedro", "email": "susana@exemplo.pt",
            "role": "user", "created_at": "2026-05-06T10:12:03.114Z" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Erros:** `400` validação · `409` email já registado.

### POST `/auth/login`

**Corpo:** `email`, `password` (ambos obrigatórios).

**Resposta `200`**

```json
{
  "user": { "id": 1, "name": "Susana Pedro", "email": "susana@exemplo.pt", "role": "user" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Erros:** `401 { "error": "Credenciais inválidas" }` — mesma mensagem para email
inexistente e password errada, para não permitir enumeração de contas.

### GET `/auth/me`

**Resposta `200`**

```json
{ "id": 1, "name": "Susana Pedro", "email": "susana@exemplo.pt",
  "role": "user", "created_at": "2026-05-06T10:12:03.114Z" }
```

**Erros:** `401 { "error": "Token de autenticação em falta" | "Token inválido" | "Token expirado" }`.

### POST `/auth/change-password`

**Corpo:** `current_password` (obrigatório), `new_password` (mín. 6 caracteres).

**Resposta `200`** `{ "message": "Password alterada com sucesso" }`
**Erros:** `400` nova password curta · `401` password actual incorrecta · `404` utilizador inexistente.

### POST `/auth/forgot-password`

**Corpo:** `email`.

**Resposta `200`** — sempre genérica, exista ou não a conta:

```json
{ "message": "Se existir uma conta com esse email, será enviado um link de recuperação." }
```

Fora de produção (`NODE_ENV !== 'production'`) a resposta inclui ainda
`token` e `dev_note`, para permitir a demonstração. Na base de dados guarda-se
apenas o **hash SHA-256** do token, com validade de **30 minutos**; um novo
pedido invalida o token anterior.

### POST `/auth/reset-password`

**Corpo:** `token` (o valor em claro), `new_password` (mín. 6 caracteres).

**Resposta `200`** `{ "message": "Password redefinida com sucesso" }` — o token é
consumido (apagado) após uso.
**Erros:** `400 { "error": "Token inválido ou expirado." }`.

---

# 2. Sistema — `/api/health`

### GET `/health` *(pública)*

```json
{ "status": "ok", "timestamp": "2026-05-06T10:12:03.114Z",
  "version": "1.0.0", "service": "IoT Rega API" }
```

---

# 3. Explorações (Farms) — `/api/farms`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/farms` | Lista as explorações do utilizador |
| GET | `/farms/:id` | Detalhe de uma exploração |
| POST | `/farms` | Cria exploração e associa o utilizador como `owner` |
| PUT | `/farms/:id` | Actualiza nome, descrição e localização |
| DELETE | `/farms/:id` | Elimina a exploração (cascata) |

### GET `/farms`

**Resposta `200`** — array; `plot_count` é a contagem de talhões, `latitude`/`longitude`
são extraídas da geografia PostGIS.

```json
[ { "id": 3, "name": "Quinta do Vale", "description": "Vinha do Douro",
    "location_geojson": "{\"type\":\"Point\",\"coordinates\":[-7.78,41.16]}",
    "plot_count": "4", "latitude": 41.16, "longitude": -7.78,
    "created_at": "2026-04-02T09:00:00.000Z" } ]
```

### GET `/farms/:id`

**Resposta `200`** objecto único · **`404`** `{ "error": "Exploração não encontrada" }`.

### POST `/farms`

| Campo | Tipo | Obrig. | Regra |
|-------|------|:------:|-------|
| `name` | string | sim | Não vazio |
| `latitude` | number | sim | −90 a 90 |
| `longitude` | number | sim | −180 a 180 |
| `description` | string | não | |

```json
{ "name": "Quinta do Vale", "description": "Vinha do Douro",
  "latitude": 41.16, "longitude": -7.78 }
```

**Resposta `201`** `{ "id": 3, "name": "...", "description": "...", "created_at": "..." }`

A criação corre numa **transação**: insere em `farm` e em `user_farm` com
`role = 'owner'`; qualquer falha faz `ROLLBACK`.

### PUT `/farms/:id`

**Corpo:** `name`, `latitude`, `longitude` obrigatórios; `description` opcional.

**Resposta `200`** `{ "id", "name", "description", "latitude", "longitude" }`
**Erros:** `400` campos em falta ou coordenadas não numéricas · `404` inexistente/sem acesso.

### DELETE `/farms/:id`

Só o utilizador com `role = 'owner'` pode eliminar. A eliminação é em cascata
(talhões → sensores → leituras → alertas → custos).

**Resposta `200`** `{ "message": "Exploração eliminada", "id": 3 }`
**Erros:** `404 { "error": "Não encontrado ou sem permissão" }`.

---

# 4. Talhões (Plots) — `/api/plots`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/plots?farm_id=X` | Lista talhões com geometria e nº de sensores |
| GET | `/plots/geojson?farm_id=X` | `FeatureCollection` pronta para o Leaflet |
| GET | `/plots/:id` | Detalhe de um talhão |
| POST | `/plots` | Cria talhão a partir de um polígono GeoJSON |
| PUT | `/plots/:id` | Actualização parcial |
| DELETE | `/plots/:id` | Elimina o talhão |

Valores aceites em `crop_type`: `vinha`, `olival`, `pomar`, `hortícolas`, `outro`.

### GET `/plots`

**Query:** `farm_id` (opcional — sem ele devolve os talhões de todas as
explorações do utilizador).

```json
[ { "id": 4, "farm_id": 3, "name": "Talhão Norte", "area": 2.5, "crop_type": "vinha",
    "geojson": { "type": "Polygon", "coordinates": [[[-7.78,41.16], "..." ]] },
    "position": { "type": "Point", "coordinates": [-7.781, 41.161] },
    "sensor_count": "3" } ]
```

### GET `/plots/geojson`

**Resposta `200`** — `FeatureCollection`; cada `Feature` traz em `properties`
`id`, `name`, `area`, `crop_type` e `farm_id`. Sem talhões devolve
`{ "type": "FeatureCollection", "features": [] }`.

### GET `/plots/:id`

**`404`** `{ "error": "Talhão não encontrado" }`.

### POST `/plots`

| Campo | Tipo | Obrig. | Nota |
|-------|------|:------:|------|
| `farm_id` | int | sim | |
| `name` | string | sim | |
| `geojson` | objecto | sim | Polígono GeoJSON (SRID 4326) |
| `area` | number | não | Hectares |
| `crop_type` | string | não | Omisso ⇒ `vinha` |
| `position` | objecto | não | Ponto GeoJSON; omisso ⇒ **centróide do polígono** |

```json
{ "farm_id": 3, "name": "Talhão Norte", "area": 2.5, "crop_type": "vinha",
  "geojson": { "type": "Polygon",
    "coordinates": [[[-7.78,41.16],[-7.77,41.16],[-7.77,41.17],[-7.78,41.17],[-7.78,41.16]]] } }
```

**Resposta `201`** com o talhão criado, incluindo `position` calculada.

### PUT `/plots/:id`

Actualização **parcial**: só os campos presentes no corpo são alterados
(`COALESCE` no SQL). A geometria e a posição só mudam se `geojson`/`position`
forem enviados.

**Erros:** `400` nome vazio, `crop_type` fora da lista, área não numérica ou
negativa · `404` inexistente/sem acesso.

### DELETE `/plots/:id`

**Resposta `200`** `{ "message": "Talhão eliminado" }` ·
**`404`** `{ "error": "Talhão não encontrado ou sem acesso à exploração." }`

---

# 5. Sensores — `/api/sensors`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/sensors?plot_id=X` | Lista sensores com a última leitura |
| GET | `/sensors/:id` | Detalhe de um sensor |
| POST | `/sensors` | Regista sensor |
| PUT | `/sensors/:id` | Actualização parcial |
| DELETE | `/sensors/:id` | Elimina sensor |

Tipos aceites: `temperature`, `humidity`, `soil_moisture`, `rainfall`, `wind_speed`.

### GET `/sensors`

```json
[ { "id": 7, "plot_id": 4, "name": "Humidade Solo A", "type": "soil_moisture",
    "unit": "%", "device_id": "esp32-01", "latitude": 41.161, "longitude": -7.781,
    "active": true, "plot_name": "Talhão Norte",
    "last_value": 32.4, "last_reading_at": "2026-05-06T10:05:00.000Z" } ]
```

`last_value`/`last_reading_at` vêm de subconsultas à última linha de
`sensor_reading`; são `null` num sensor sem leituras.

### POST `/sensors`

| Campo | Tipo | Obrig. | Nota |
|-------|------|:------:|------|
| `plot_id` | int | sim | |
| `type` | string | sim | Um dos 5 tipos |
| `name` | string | sim | |
| `unit` | string | não | Ex.: `%`, `°C`, `mm` |
| `device_id` | string | não | **Único** na base de dados |
| `latitude`, `longitude` | number | não | Posição exacta do sensor |

**Resposta `201`** com o registo criado · **`409`** `device_id` duplicado.

### PUT `/sensors/:id`

Actualização parcial de `name`, `unit`, `active`, `latitude`, `longitude`.
Usar `active: false` para desactivar um sensor sem apagar o histórico.

### DELETE `/sensors/:id`

**Resposta `200`** `{ "message": "Sensor eliminado" }`. As leituras associadas
são removidas em cascata.

---

# 6. Leituras — `/api/readings`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/readings?sensor_id=X` | Leituras em bruto ou agregadas |
| GET | `/readings/latest?plot_id=X` | Última leitura de cada sensor do talhão |
| GET | `/readings/stats?sensor_id=X` | Estatísticas do período |
| POST | `/readings` | Ingestão de uma leitura |
| POST | `/readings/bulk` | Ingestão em lote |

### GET `/readings`

| Query | Omissão | Descrição |
|-------|---------|-----------|
| `sensor_id` | — | **Obrigatório** |
| `from`, `to` | últimas 24 h | Timestamps ISO 8601 |
| `limit` | `200` | Máximo de linhas |
| `interval` | — | Se presente, agrega por janela (`1 hour`, `15 minutes`, …) |

**Sem `interval` — leituras em bruto (`200`)**

```json
[ { "time": "2026-05-06T10:05:00.000Z", "value": 32.4 } ]
```

**Com `interval` — série agregada (`200`)**

```json
[ { "bucket": "2026-05-06T10:00:00.000Z", "avg_value": 32.1,
    "min_value": 30.8, "max_value": 33.9, "reading_count": "12" } ]
```

**Erros:** `400 { "error": "sensor_id é obrigatório" }`.

### GET `/readings/latest`

**Query:** `plot_id` (obrigatório). Devolve uma linha por sensor do talhão
(`DISTINCT ON`), com `time`/`value` a `null` se ainda não houver leituras.

```json
[ { "sensor_id": 7, "name": "Humidade Solo A", "type": "soil_moisture",
    "unit": "%", "time": "2026-05-06T10:05:00.000Z", "value": 32.4 } ]
```

### GET `/readings/stats`

**Query:** `sensor_id`; `period` ∈ `24h` (omissão), `7d`, `30d`.

```json
{ "total_readings": 288, "avg_value": 31.7, "min_value": 27.2, "max_value": 38.4,
  "stddev_value": 2.41, "first_reading": "2026-05-05T10:05:00.000Z",
  "last_reading": "2026-05-06T10:05:00.000Z" }
```

### POST `/readings`

| Campo | Tipo | Obrig. | Nota |
|-------|------|:------:|------|
| `sensor_id` | int | sim | |
| `value` | number | sim | |
| `time` | ISO 8601 | não | Omisso ⇒ `NOW()` |

**Resposta `201`** `{ "message": "Leitura registada", "sensor_id": 7, "value": 32.4 }`
**Erros:** `400 { "error": "sensor_id e value são obrigatórios" }`.

### POST `/readings/bulk`

```json
{ "readings": [ { "sensor_id": 7, "value": 32.4, "time": "2026-05-06T10:05:00Z" },
                { "sensor_id": 8, "value": 21.7 } ] }
```

Inserção num único `INSERT` multi-valor com `ON CONFLICT DO NOTHING`
(idempotente para reenvios do gateway IoT).

**Resposta `201`** `{ "message": "2 leituras inseridas" }`
**Erros:** `400 { "error": "Array de leituras é obrigatório" }`.

---

# 7. Clima — `/api/weather`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/weather?plot_id=X` | Observações históricas guardadas |
| GET | `/weather/forecast?plot_id=X` | Previsão a 7 dias |
| POST | `/weather/refresh?plot_id=X` | Força actualização a partir da Open-Meteo |

Fonte: [Open-Meteo](https://open-meteo.com/), API pública sem chave de acesso,
actualizada de hora a hora por um *cron job* (`0 * * * *`) sobre todos os talhões.

### GET `/weather`

**Query:** `plot_id` (obrigatório), `from`, `to` (omissão: últimas 24 h). Máx. 200 linhas.

```json
[ { "plot_id": 4, "time": "2026-05-06T10:00:00.000Z", "temperature": 19.4,
    "humidity": 62, "rainfall": 0, "wind_speed": 11.2 } ]
```

**Erros:** `400 { "error": "plot_id é obrigatório" }`.

### GET `/weather/forecast`

Previsão diária a 7 dias para o talhão indicado.

### POST `/weather/refresh`

Vai buscar os dados à Open-Meteo usando o **centróide** da geometria do talhão.

**Resposta `200`** `{ "message": "Dados climáticos actualizados" }`
**Erros:** `404 { "error": "Plot não encontrado" }`.

---

# 8. Alertas — `/api/alerts`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/alerts?resolved=&limit=` | Lista alertas |
| GET | `/alerts/count` | Contagem por severidade (badge do frontend) |
| PATCH | `/alerts/:id/resolve` | Marca alerta como resolvido |

Os alertas são gerados automaticamente pelo `alertService`, que avalia as regras
activas a cada 5 minutos (*cron* `*/5 * * * *`) e a cada leitura ingerida por
MQTT. Não se cria um novo alerta enquanto existir um alerta por resolver para o
mesmo par sensor/regra.

### GET `/alerts`

**Query:** `resolved` (`true`/`false`, omissão `false`), `limit` (omissão `50`).

```json
[ { "id": 12, "sensor_id": 7, "rule_id": 2, "message": "Humidade do solo abaixo de 30%",
    "severity": "warning", "resolved": false, "created_at": "2026-05-06T10:05:12.000Z",
    "resolved_at": null, "sensor_type": "soil_moisture", "sensor_name": "Humidade Solo A",
    "rule_name": "Solo seco", "plot_name": "Talhão Norte" } ]
```

### GET `/alerts/count`

```json
[ { "severity": "warning", "total": 3 }, { "severity": "critical", "total": 1 } ]
```

### PATCH `/alerts/:id/resolve`

**Resposta `200`** com o alerta actualizado (`resolved: true`, `resolved_at` preenchido)
**Erros:** `404 { "error": "Alerta não encontrado" }`.

---

# 9. Regras de alerta — `/api/rules`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/rules` | Lista regras (ordenadas por tipo e limite) |
| POST | `/rules` | Cria regra |
| PUT | `/rules/:id` | Actualização parcial |
| DELETE | `/rules/:id` | Elimina regra |

Condições aceites: `>`, `<`, `>=`, `<=`, `=`.
Severidades: `info`, `warning`, `critical`.

### POST `/rules`

| Campo | Tipo | Obrig. | Nota |
|-------|------|:------:|------|
| `sensor_type` | string | sim | Tipo de sensor a que se aplica |
| `threshold` | number | sim | Valor-limite |
| `condition` | string | sim | Um dos 5 operadores |
| `name` | string | não | |
| `severity` | string | não | Omisso ⇒ `warning` |

```json
{ "name": "Solo seco", "sensor_type": "soil_moisture",
  "condition": "<", "threshold": 30, "severity": "warning" }
```

**Resposta `201`** com a regra criada.

### PUT `/rules/:id`

Actualização parcial de `name`, `threshold`, `condition`, `severity`, `active`.
`active: false` suspende a regra sem a apagar.
**Erros:** `404 { "error": "Regra não encontrada" }`.

### DELETE `/rules/:id`

**Resposta `200`** `{ "message": "Regra eliminada" }`.

---

# 10. Custos — `/api/costs`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/costs?plot_id=&year=` | Lista custos do utilizador |
| GET | `/costs/summary?farm_id=` | Total por mês e categoria |
| POST | `/costs` | Regista custo |
| PUT | `/costs/:id` | Actualização parcial |
| DELETE | `/costs/:id` | Elimina o registo |

Categorias: `water`, `energy`, `maintenance`, `fertilization`.

### GET `/costs`

**Query:** `plot_id`, `year` (ambos opcionais, combináveis).

```json
[ { "id": 21, "plot_id": 4, "description": "Consumo de água — Abril",
    "amount": 148.5, "date": "2026-04-30", "category": "water",
    "plot_name": "Talhão Norte" } ]
```

### GET `/costs/summary`

**Query:** `farm_id`.

```json
[ { "month": "2026-04", "category": "water", "total": 148.5, "records": "2" },
  { "month": "2026-04", "category": "energy", "total": 62.0, "records": "1" } ]
```

### POST `/costs`

| Campo | Tipo | Obrig. | Nota |
|-------|------|:------:|------|
| `plot_id` | int | sim | Validado contra `user_farm` |
| `amount` | number | sim | Tem de ser numérico |
| `date` | `YYYY-MM-DD` | sim | |
| `description` | string | não | |
| `category` | string | não | Omisso ⇒ `water` |

**Resposta `201`** com o registo criado.
**Erros:** `400` talhão/valor/data em falta ou valor não numérico ·
`404 { "error": "Talhão não encontrado ou sem acesso à exploração." }`.

### PUT `/costs/:id` · DELETE `/costs/:id`

Actualização parcial e eliminação, ambas restritas aos talhões das explorações
do utilizador.
**Erros:** `400` valor não numérico · `404 { "error": "Registo não encontrado ou sem acesso." }`.

---

# 11. Dashboard — `/api/dashboard`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/dashboard/summary?farm_id=X` | Todos os indicadores numa só chamada |
| GET | `/dashboard/chart?sensor_id=X&period=` | Série temporal agregada |

### GET `/dashboard/summary`

**Query:** `farm_id` (obrigatório). Executa **seis consultas em paralelo**
(`Promise.all`) e devolve um único objecto — evita seis chamadas do frontend
no arranque do dashboard.

```json
{
  "plots":  [ { "id": 4, "name": "Talhão Norte", "area": 2.5, "crop_type": "vinha" } ],
  "sensors": { "active": "5", "total": "6" },
  "alerts": [ { "severity": "warning", "total": 3 } ],
  "latestReadings": [ { "id": 7, "name": "Humidade Solo A", "type": "soil_moisture",
                        "unit": "%", "value": 32.4, "time": "2026-05-06T10:05:00.000Z" } ],
  "costThisMonth": 210.5,
  "weather": { "temperature": 19.4, "humidity": 62, "rainfall": 0,
               "wind_speed": 11.2, "time": "2026-05-06T10:00:00.000Z" }
}
```

`weather` é `null` se ainda não houver observações para a exploração.
**Erros:** `400 { "error": "farm_id é obrigatório" }`.

### GET `/dashboard/chart`

**Query:** `sensor_id`; `period` ∈ `24h` (omissão), `7d`, `30d`.

A granularidade da agregação adapta-se ao período:

| `period` | Janela consultada | Bucket |
|----------|-------------------|--------|
| `24h` | últimas 24 horas | 1 hora |
| `7d` | últimos 7 dias | 6 horas |
| `30d` | últimos 30 dias | 1 dia |

```json
[ { "bucket": "2026-05-06T09:00:00.000Z", "avg": "32.10", "min": "30.80", "max": "33.90" } ]
```

Ordenada ascendentemente por `bucket`, pronta a alimentar o gráfico.

---

# Notas de implementação

- **Autorização por exploração** — as consultas fazem `JOIN user_farm` com o
  `id` do utilizador do token, pelo que cada utilizador só acede aos dados das
  explorações a que pertence. As excepções conhecidas (sensores, alertas e
  regras) estão listadas em [`estado-implementacao.md`](estado-implementacao.md).
- **Recuperação de password** — a tabela `password_reset` guarda apenas o hash
  SHA-256 do token. Não existindo serviço de email configurado, o token é
  escrito no log do servidor e devolvido na resposta apenas fora de produção.
- **Dados geoespaciais** — `farm.location` é `geography(Point)`,
  `plot.geometry` é `geometry(Polygon, 4326)` e `plot.position`
  `geography(Point)`; a conversão para GeoJSON é feita no SQL com
  `ST_AsGeoJSON`, o que dispensa transformação no frontend (Leaflet).
- **Séries temporais** — `sensor_reading` foi desenhada como *hypertable*
  TimescaleDB; a agregação usa `date_bin`, compatível com PostgreSQL 14+ mesmo
  sem a extensão instalada.
- **Dados dos sensores** — o projecto usa dados simulados; o serviço MQTT
  existe em `src/services/mqttService.js` e está testado, mas a chamada
  `mqttService.connect()` está comentada em `src/app.js`.
- **Tarefas agendadas** — `node-cron`: actualização climática de hora a hora e
  avaliação de regras de alerta a cada 5 minutos.

# Documentos relacionados

| Documento | Conteúdo |
|-----------|----------|
| [`estado-implementacao.md`](estado-implementacao.md) | Lista de APIs e tabela de estado de implementação |
| [`testes-unitarios.md`](testes-unitarios.md) | Testes unitários (Jest) e resultados |
| [`testes-postman.md`](testes-postman.md) | Testes funcionais às APIs com Postman |
| [`../postman/`](../postman/) | Coleção e ambiente Postman |
