# Testes às APIs com Postman

Complemento aos [testes unitários](testes-unitarios.md): enquanto o Jest testa
cada router isoladamente com a base de dados substituída por *mocks*, a coleção
Postman exercita a **API real, de ponta a ponta**, contra o servidor Express e a
base de dados PostgreSQL/PostGIS.

## 1. Ficheiros

| Ficheiro | Conteúdo |
|----------|----------|
| [`../postman/IoT-Rega.postman_collection.json`](../postman/IoT-Rega.postman_collection.json) | Coleção com 79 pedidos organizados em 12 pastas |
| [`../postman/IoT-Rega-Local.postman_environment.json`](../postman/IoT-Rega-Local.postman_environment.json) | Ambiente local (`base_url`, credenciais e variáveis de runtime) |

## 2. Pré-requisitos

1. Ficheiro **`.env`** na raiz de `iot-rega/` com, pelo menos, `DB_PASSWORD` e
   `JWT_SECRET` definidos (o `docker-compose.yml` exige `DB_PASSWORD`).

2. **Base de dados** — a imagem `timescale/timescaledb-ha:pg16` inclui PostGIS
   e TimescaleDB:

```bash
docker compose up -d db
```

```bash
npm run db:setup --prefix ProjetoFinalUAB_IOTRega-main/iot-rega/backend
```

3. **Backend** a correr em `http://localhost:3000`:

```bash
npm start --prefix ProjetoFinalUAB_IOTRega-main/iot-rega/backend
```

4. **Ligação à Internet** — apenas para o pedido `POST /weather/refresh`, que
   consulta a API pública Open-Meteo.

> **Nota.** A coleção foi escrita e validada sintacticamente, mas **não foi
> executada** no ambiente em que foi preparada (sem PostgreSQL nem servidor
> activos). Os resultados devem ser recolhidos na máquina onde o stack está a
> correr, seguindo as secções 3 e 4.

## 3. Como executar

### 3.1. Na aplicação Postman

1. **Import** → arrastar os dois ficheiros JSON da pasta `postman/`.
2. Seleccionar o ambiente **IoT Rega — Local** no canto superior direito.
3. Botão direito sobre a coleção **IoT Rega API** → **Run collection**.
4. Manter a ordem das pastas (01 → 12) e executar. O separador **Test Results**
   mostra o total de assertivas passadas/falhadas.

### 3.2. Linha de comandos (Newman)

Permite gerar um relatório HTML para anexar ao relatório:

```bash
npm install -g newman newman-reporter-htmlextra
```

```bash
newman run ProjetoFinalUAB_IOTRega-main/iot-rega/postman/IoT-Rega.postman_collection.json -e ProjetoFinalUAB_IOTRega-main/iot-rega/postman/IoT-Rega-Local.postman_environment.json -r cli,htmlextra --reporter-htmlextra-export ProjetoFinalUAB_IOTRega-main/iot-rega/docs/evidencias/newman-report.html
```

## 4. Evidências a recolher

| Evidência | Como obter |
|-----------|------------|
| Screenshot do Collection Runner com o sumário (pedidos e assertivas) | Postman → Run collection → captura do painel final |
| Screenshot de um pedido individual com o separador *Test Results* verde | Ex.: `POST /auth/login` ou `GET /dashboard/summary` |
| Relatório HTML completo | `docs/evidencias/newman-report.html` (comando acima) |
| Sumário de texto do Newman | Redireccionar o output: `newman run ... > docs/evidencias/newman-output.txt` |

## 5. Estrutura da coleção

A coleção segue o **ciclo de vida completo** de uma exploração: cria os dados de
que precisa, usa-os e elimina-os no fim, deixando a base de dados no estado
inicial. Pode por isso ser executada repetidamente (o email do utilizador é
gerado com `Date.now()` no *pre-request script*).

| Pasta | Pedidos | Cobertura |
|-------|--------:|-----------|
| 01 — Sistema | 2 | `GET /health` e handler 404 global |
| 02 — Autenticação | 17 | Registo, login, `/me`, alteração e recuperação de password, e respectivos casos de erro |
| 03 — Explorações | 7 | CRUD de `farms` + validação de coordenadas + isolamento 404 |
| 04 — Talhões | 7 | CRUD de `plots`, GeoJSON, centróide, validações de cultura e área |
| 05 — Sensores | 6 | CRUD de `sensors` + validação de tipo |
| 06 — Leituras | 10 | Ingestão simples e em lote, consulta bruta e agregada, `latest`, `stats` |
| 07 — Regras | 5 | CRUD de `rules` + validação de operador |
| 08 — Alertas | 3 | Listagem, contagem por severidade, resolução |
| 09 — Custos | 8 | CRUD de `costs`, resumo mensal, validação de propriedade do talhão |
| 10 — Clima | 6 | Refresh Open-Meteo, observações, previsão |
| 11 — Dashboard | 3 | Sumário agregado e série temporal do gráfico |
| 12 — Limpeza | 5 | Eliminação em cascata e confirmação de 404 |
| **Total** | **79** | **45 endpoints** |

### Encadeamento por variáveis

Cada pedido guarda em variáveis de coleção os identificadores que os seguintes
consomem, sem qualquer valor fixo no meio da coleção:

```
register → token, user_id
POST /farms → farm_id
POST /plots (usa farm_id) → plot_id
POST /sensors (usa plot_id) → sensor_id
POST /readings (usa sensor_id)
POST /rules → rule_id
GET /alerts → alert_id
POST /costs (usa plot_id) → cost_id
forgot-password → reset_token
```

## 6. Assertivas

São **198 assertivas** distribuídas pelos 79 pedidos, mais um **teste global**
aplicado a todos os pedidos (tempo de resposta abaixo de 3 000 ms) — **277
verificações** por execução completa.

Cada pedido valida, conforme aplicável:

| Tipo de verificação | Exemplo |
|---------------------|---------|
| **Código de estado** | `pm.response.to.have.status(201)` |
| **Estrutura da resposta** | `GET /dashboard/summary` devolve as seis secções esperadas |
| **Valores de negócio** | O centróide calculado pelo PostGIS corresponde ao centro do polígono enviado |
| **Coerência de dados** | `min ≤ avg ≤ max` nas estatísticas; leituras ordenadas por `time` descendente |
| **Segurança** | O registo e o `/me` nunca devolvem o campo `password` |
| **Não-enumeração de contas** | `login` com email inexistente e com password errada devolvem a **mesma** mensagem |
| **Isolamento entre utilizadores** | Recurso de outrem devolve `404`, não `403` |
| **Validação de entrada** | Latitude 999, `crop_type` inválido, área negativa, valor de custo não numérico |
| **Actualização parcial** | `PUT /plots/:id` sem `geojson` preserva a geometria existente |
| **Desempenho** | Todos os pedidos abaixo de 3 000 ms |

### Exemplos de assertivas escritas

```javascript
// POST /plots — o backend calcula o centróide quando position é omitido
pm.test('Position calculada a partir do centroide', function () {
    const b = pm.response.json();
    pm.expect(b.position.type).to.eql('Point');
    pm.expect(b.position.coordinates[0]).to.be.closeTo(-7.775, 0.01);
    pm.expect(b.position.coordinates[1]).to.be.closeTo(41.165, 0.01);
});
```

```javascript
// POST /auth/login — mensagem genérica impede enumeração de contas
pm.test('Mesma mensagem que password errada', function () {
    pm.expect(pm.response.json().error).to.eql('Credenciais inválidas');
});
```

```javascript
// GET /readings — leituras ordenadas por tempo descendente
pm.test('Ordenadas por time descendente', function () {
    const b = pm.response.json();
    for (let i = 1; i < b.length; i++) {
        pm.expect(new Date(b[i - 1].time).getTime())
          .to.be.at.least(new Date(b[i].time).getTime());
    }
});
```

## 7. Notas sobre pedidos condicionais

Dois pedidos adaptam as assertivas ao estado da base de dados, para que a
coleção passe tanto numa base vazia como numa base com histórico:

- **`PATCH /alerts/:id/resolve`** — se `GET /alerts` devolveu alertas por
  resolver, valida `200` e `resolved: true`; caso contrário usa um id
  inexistente e valida o caminho `404`.
- **`GET /weather`** — as verificações sobre os campos meteorológicos só correm
  se houver observações guardadas para o talhão.

## 8. Relação com os testes unitários

| | Testes unitários (Jest) | Testes funcionais (Postman) |
|---|---|---|
| Alvo | Routers, middleware e serviços isolados | API HTTP completa |
| Base de dados | *Mock* (`jest.mock`) | PostgreSQL/PostGIS real |
| Verifica o SQL emitido | Sim | Não (verifica o efeito) |
| Verifica PostGIS, cascatas e índices | Não | Sim |
| Verifica integração Open-Meteo | *Mock* do axios | Chamada real |
| Nº de verificações | 168 testes | 198 assertivas (+79 globais) |
| Execução | `npm test` (~11 s, sem infra-estrutura) | Postman/Newman (requer stack a correr) |

As duas camadas são complementares: os testes unitários apanham regressões na
lógica e nas queries sem depender de infra-estrutura; os testes Postman
confirmam que a integração real — Express, PostGIS, séries temporais e API
externa — funciona como documentado em [`api.md`](api.md).
