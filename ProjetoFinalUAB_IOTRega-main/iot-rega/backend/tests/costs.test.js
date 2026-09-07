// Testes das rotas de custos.
// A base de dados é mockada — não é preciso PostgreSQL.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const costRoutes = require('../src/routes/costs');
const { buildApp } = require('./helpers/testApp');

const utilizador = { id: 7, role: 'user' };
const app = buildApp('/api/costs', costRoutes, utilizador);

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/costs', () => {
  it('lista os custos das explorações do utilizador', async () => {
    const rows = [{ id: 1, amount: '120.50', plot_name: 'Talhão Norte' }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/costs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual([utilizador.id]);
  });

  it('acumula os filtros de talhão e ano na ordem dos parâmetros', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/costs?plot_id=4&year=2026');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('c.plot_id = $2');
    expect(sql).toContain('EXTRACT(YEAR FROM c.date) = $3');
    expect(params).toEqual([utilizador.id, '4', '2026']);
  });
});

describe('GET /api/costs/summary', () => {
  it('agrupa por mês e categoria para a exploração pedida', async () => {
    query.mockResolvedValueOnce({ rows: [{ month: '2026-08', category: 'water', total: '300' }] });

    const res = await request(app).get('/api/costs/summary?farm_id=3');

    expect(res.status).toBe(200);
    expect(res.body[0].category).toBe('water');
    expect(query.mock.calls[0][1]).toEqual(['3', utilizador.id]);
  });
});

describe('POST /api/costs', () => {
  const custoValido = { plot_id: 4, amount: 120.5, date: '2026-08-28', description: 'Rega' };

  it('cria o registo depois de confirmar o acesso ao talhão', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 })  // userOwnsPlot
      .mockResolvedValueOnce({ rows: [{ id: 10, ...custoValido }] });      // INSERT

    const res = await request(app).post('/api/costs').send(custoValido);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);

    const insert = query.mock.calls[1];
    expect(insert[1]).toEqual([4, 'Rega', 120.5, '2026-08-28', 'water']);
  });

  it('rejeita custos de talhões a que o utilizador não tem acesso', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).post('/api/costs').send(custoValido);

    expect(res.status).toBe(404);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO cost_record'))).toBe(false);
  });

  it('exige talhão, valor numérico e data', async () => {
    const semTalhao = await request(app).post('/api/costs').send({ amount: 10, date: '2026-08-28' });
    expect(semTalhao.status).toBe(400);

    const valorInvalido = await request(app)
      .post('/api/costs')
      .send({ plot_id: 4, amount: 'muito', date: '2026-08-28' });
    expect(valorInvalido.status).toBe(400);
    expect(valorInvalido.body.error).toMatch(/numérico/);

    const semData = await request(app).post('/api/costs').send({ plot_id: 4, amount: 10 });
    expect(semData.status).toBe(400);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('PUT /api/costs/:id', () => {
  it('actualiza o registo do utilizador', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 10, amount: '90' }] });

    const res = await request(app).put('/api/costs/10').send({ amount: 90 });

    expect(res.status).toBe(200);

    const params = query.mock.calls[0][1];
    expect(params[1]).toBe(90);
    expect(params[4]).toBe('10');
    expect(params[5]).toBe(utilizador.id);
  });

  it('rejeita valores não numéricos', async () => {
    const res = await request(app).put('/api/costs/10').send({ amount: 'muito' });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o registo não é acessível', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/costs/99').send({ amount: 90 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/costs/:id', () => {
  it('elimina o registo', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 });

    const res = await request(app).delete('/api/costs/10');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Registo eliminado');
    expect(query.mock.calls[0][1]).toEqual(['10', utilizador.id]);
  });

  it('devolve 404 quando não há nada para eliminar', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).delete('/api/costs/99');

    expect(res.status).toBe(404);
  });
});
