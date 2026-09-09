# APIs Desenvolvidas e Estado de Implementação

Projecto: **IoT Rega** — plataforma de apoio à decisão na gestão de rega vitivinícola
Backend: Node.js 18 + Express 4 · PostgreSQL 15 + PostGIS · JWT · MQTT · Open-Meteo

---

## 1. Lista das APIs desenvolvidas

O backend expõe uma API REST organizada em **11 módulos funcionais**, com um
total de **45 endpoints**. Cada módulo corresponde a um router em
`backend/src/routes/`.

| # | API (módulo) | Prefixo | Endpoints | Autenticação | Ficheiro |
|---|--------------|---------|----------:|--------------|----------|
| 1 | **Autenticação** | `/api/auth` | 6 | Pública (4) / JWT (2) | `routes/auth.js` |
| 2 | **Sistema / Health** | `/api/health` | 1 | Pública | `src/app.js` |
| 3 | **Explorações (Farms)** | `/api/farms` | 5 | JWT | `routes/farms.js` |
| 4 | **Talhões (Plots)** | `/api/plots` | 6 | JWT | `routes/plots.js` |
| 5 | **Sensores** | `/api/sensors` | 5 | JWT | `routes/sensors.js` |
| 6 | **Leituras** | `/api/readings` | 5 | JWT | `routes/readings.js` |
| 7 | **Clima** | `/api/weather` | 3 | JWT | `routes/weather.js` |
| 8 | **Alertas** | `/api/alerts` | 3 | JWT | `routes/alerts.js` |
| 9 | **Regras de alerta** | `/api/rules` | 4 | JWT | `routes/rules.js` |
| 10 | **Custos** | `/api/costs` | 5 | JWT | `routes/costs.js` |
| 11 | **Dashboard** | `/api/dashboard` | 2 | JWT | `routes/dashboard.js` |
| | **Total** | | **45** | | |

### Serviços de suporte (não expostos directamente como REST)

| Serviço | Ficheiro | Função |
|---------|----------|--------|
| `mqttService` | `services/mqttService.js` | Subscrição de tópicos MQTT, ingestão de leituras de sensores e simulador IoT |
| `weatherService` | `services/weatherService.js` | Integração com a API pública Open-Meteo (observações e previsão a 7 dias) |
| `alertService` | `services/alertService.js` | Avaliação de regras sobre as leituras e geração de alertas |

---

## 2. Tabela do estado de implementação dos endpoints

**Legenda:** ✅ Implementado · ⚠️ Implementado com limitação · ❌ Não implementado

### 2.1. Autenticação — `/api/auth`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| POST | `/auth/register` | Registo de utilizador, devolve JWT | ✅ | ✅ | ✅ |
| POST | `/auth/login` | Autenticação, devolve JWT | ✅ | ✅ | ✅ |
| GET | `/auth/me` | Dados do utilizador autenticado | ✅ | ✅ | ✅ |
| POST | `/auth/change-password` | Alteração de password | ✅ | ✅ | ✅ |
| POST | `/auth/forgot-password` | Geração de token de recuperação | ⚠️ | ✅ | ✅ |
| POST | `/auth/reset-password` | Redefinição da password por token | ✅ | ✅ | ✅ |

> ⚠️ `forgot-password`: o token é gerado e persistido (apenas o hash SHA-256), mas
> **não existe serviço de email configurado**. O token é escrito no log do servidor e
> devolvido na resposta apenas fora de produção, para permitir a demonstração.

### 2.2. Sistema — `/api/health`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/health` | Estado, versão e timestamp do serviço | ✅ | ❌ | ✅ |

> Definido directamente em `src/app.js`; não coberto pelos testes unitários
> (que montam routers isolados), mas validado na coleção Postman.

### 2.3. Explorações — `/api/farms`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/farms` | Lista explorações do utilizador, com contagem de talhões | ✅ | ✅ | ✅ |
| GET | `/farms/:id` | Detalhe de uma exploração | ✅ | ✅ | ✅ |
| POST | `/farms` | Cria exploração (transação: `farm` + `user_farm` como `owner`) | ✅ | ✅ | ✅ |
| PUT | `/farms/:id` | Actualiza nome, descrição e localização | ✅ | ✅ | ✅ |
| DELETE | `/farms/:id` | Elimina exploração (só o `owner`) | ✅ | ✅ | ✅ |

### 2.4. Talhões — `/api/plots`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/plots?farm_id=` | Lista talhões com geometria GeoJSON e nº de sensores | ✅ | ✅ | ✅ |
| GET | `/plots/geojson?farm_id=` | `FeatureCollection` pronta para o Leaflet | ✅ | ✅ | ✅ |
| GET | `/plots/:id` | Detalhe de um talhão | ✅ | ✅ | ✅ |
| POST | `/plots` | Cria talhão a partir de polígono GeoJSON | ✅ | ✅ | ✅ |
| PUT | `/plots/:id` | Actualiza nome, área, cultura, geometria e posição | ✅ | ✅ | ✅ |
| DELETE | `/plots/:id` | Elimina talhão | ✅ | ✅ | ✅ |

### 2.5. Sensores — `/api/sensors`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/sensors?plot_id=` | Lista sensores com última leitura | ✅ | ✅ | ✅ |
| GET | `/sensors/:id` | Detalhe de um sensor | ✅ | ✅ | ✅ |
| POST | `/sensors` | Regista sensor | ✅ | ✅ | ✅ |
| PUT | `/sensors/:id` | Actualiza sensor | ⚠️ | ✅ | ✅ |
| DELETE | `/sensors/:id` | Elimina sensor | ⚠️ | ✅ | ✅ |

> ⚠️ `PUT`/`DELETE /sensors/:id` não fazem `JOIN user_farm`: ao contrário das
> restantes rotas, não validam que o sensor pertence a uma exploração do
> utilizador autenticado. Limitação conhecida, a corrigir.

### 2.6. Leituras — `/api/readings`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/readings?sensor_id=` | Leituras em bruto ou agregadas por `interval` | ✅ | ✅ | ✅ |
| GET | `/readings/latest?plot_id=` | Última leitura de cada sensor do talhão | ✅ | ✅ | ✅ |
| GET | `/readings/stats?sensor_id=` | Contagem, média, mín., máx. e desvio-padrão | ✅ | ✅ | ✅ |
| POST | `/readings` | Ingestão manual de uma leitura | ✅ | ✅ | ✅ |
| POST | `/readings/bulk` | Ingestão em lote | ✅ | ✅ | ✅ |

### 2.7. Clima — `/api/weather`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/weather?plot_id=` | Observações históricas guardadas | ✅ | ✅ | ✅ |
| GET | `/weather/forecast?plot_id=` | Previsão a 7 dias | ✅ | ✅ | ✅ |
| POST | `/weather/refresh?plot_id=` | Força actualização a partir da Open-Meteo | ✅ | ✅ | ✅ |

### 2.8. Alertas — `/api/alerts`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/alerts?resolved=&limit=` | Lista alertas com sensor, regra e talhão | ⚠️ | ✅ | ✅ |
| GET | `/alerts/count` | Contagem de alertas por severidade | ⚠️ | ✅ | ✅ |
| PATCH | `/alerts/:id/resolve` | Marca alerta como resolvido | ⚠️ | ✅ | ✅ |

> ⚠️ As rotas de alertas exigem JWT mas **não filtram por exploração** — devolvem
> alertas de todas as explorações. Aceitável no protótipo (instalação
> mono-organização), a rever antes de utilização multi-cliente.

### 2.9. Regras de alerta — `/api/rules`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/rules` | Lista regras | ⚠️ | ✅ | ✅ |
| POST | `/rules` | Cria regra (tipo, condição, limite, severidade) | ⚠️ | ✅ | ✅ |
| PUT | `/rules/:id` | Actualiza regra, incluindo activar/desactivar | ⚠️ | ✅ | ✅ |
| DELETE | `/rules/:id` | Elimina regra | ⚠️ | ✅ | ✅ |

> ⚠️ Mesma limitação dos alertas: as regras são globais, não estão associadas a
> uma exploração.

### 2.10. Custos — `/api/costs`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/costs?plot_id=&year=` | Lista custos do utilizador | ✅ | ✅ | ✅ |
| GET | `/costs/summary?farm_id=` | Total por mês e categoria | ✅ | ✅ | ✅ |
| POST | `/costs` | Regista custo (valida propriedade do talhão) | ✅ | ✅ | ✅ |
| PUT | `/costs/:id` | Actualiza registo | ✅ | ✅ | ✅ |
| DELETE | `/costs/:id` | Elimina registo | ✅ | ✅ | ✅ |

### 2.11. Dashboard — `/api/dashboard`

| Método | Endpoint | Descrição | Estado | Testes unitários | Postman |
|--------|----------|-----------|:------:|:----------------:|:-------:|
| GET | `/dashboard/summary?farm_id=` | Talhões, sensores, alertas, custo do mês, clima e últimas leituras numa só chamada | ✅ | ✅ | ✅ |
| GET | `/dashboard/chart?sensor_id=&period=` | Série temporal agregada para gráfico | ✅ | ✅ | ✅ |

---

## 3. Resumo quantitativo

| Estado | Endpoints | % |
|--------|----------:|--:|
| ✅ Implementado e sem limitações | 35 | 77,8 % |
| ⚠️ Implementado com limitação documentada | 10 | 22,2 % |
| ❌ Não implementado | 0 | 0 % |
| **Total de endpoints expostos** | **45** | **100 %** |

| Cobertura de testes | Endpoints | % |
|---------------------|----------:|--:|
| Com testes unitários (Jest + Supertest) | 44 | 97,8 % |
| Com testes funcionais (Postman) | 45 | 100 % |

---

## 4. Funcionalidades previstas ainda não implementadas

Endpoints planeados no modelo de dados ou nos objectivos do projecto que **não
existem** na versão actual da API:

| Funcionalidade prevista | Endpoint esperado | Estado | Observação |
|-------------------------|-------------------|:------:|------------|
| Gestão de sistemas de rega | `/api/irrigation` (CRUD) | ❌ | A tabela `irrigation_system` existe em `db/schema.sql` (tipo `drip`/`sprinkler`/`surface`, capacidade, estado) mas não tem router associado |
| Comando de actuadores de rega | `POST /api/irrigation/:id/command` | ❌ | `mqttService.publish()` está implementado e testado, mas não é exposto por nenhuma rota REST |
| Gestão de membros da exploração | `/api/farms/:id/users` | ❌ | A tabela `user_farm` suporta os papéis `owner`/`member`, mas a associação só é criada automaticamente ao criar a exploração |
| Administração de utilizadores | `/api/users` | ❌ | O middleware `requireAdmin` está implementado e testado, mas não é aplicado a nenhuma rota |
| Envio de email de recuperação | — | ❌ | Sem serviço SMTP configurado; ver nota em `forgot-password` |

### Estado do pipeline IoT (MQTT)

| Componente | Estado | Observação |
|------------|:------:|------------|
| `mqttService.connect()` — subscrição de tópicos | ⚠️ | Implementado e testado (14 testes), mas **desactivado** em `src/app.js` (linha comentada) |
| Ingestão de leituras via MQTT | ⚠️ | Idem — funcional, desligado no arranque |
| Simulador de sensores (`SIMULATE_SENSORS=true`) | ✅ | Implementado e testado (6 testes); é a fonte de dados usada na demonstração |
| Publicação MQTT (`publish`) | ⚠️ | Implementada e testada, sem consumidor na API |

Na versão actual o protótipo usa **dados simulados/estáticos**; a activação do
MQTT em produção resume-se a descomentar `mqttService.connect()` em
`src/app.js` e configurar `MQTT_BROKER_URL`.

---

## 5. Documentos relacionados

| Documento | Conteúdo |
|-----------|----------|
| [`api.md`](api.md) | Documentação detalhada de cada endpoint (parâmetros, corpo, respostas, códigos de estado) |
| [`testes-unitarios.md`](testes-unitarios.md) | Evidências e resultados dos testes unitários (Jest) |
| [`testes-postman.md`](testes-postman.md) | Testes funcionais às APIs com Postman/Newman |
| [`../postman/`](../postman/) | Coleção e ambiente Postman prontos a importar |
