// Testes das rotas de regras de alerta.
// A base de dados é mockada — não é preciso PostgreSQL.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const ruleRoutes = require('../src/routes/rules');
const { buildApp } = require('./helpers/testApp');

const app = buildApp('/api/rules', ruleRoutes, { id: 7, role: 'user' });

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/rules', () => {
  it('lista as regras existentes', async () => {
    const rows = [{ id: 1, sensor_type: 'temperature', condition: '>', threshold: 35 }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/rules');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });
});

describe('POST /api/rules', () => {
  it('cria a regra com severidade warning por omissão', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, severity: 'warning' }] });

    const res = await request(app)
      .post('/api/rules')
      .send({ sensor_type: 'temperature', threshold: 35, condition: '>' });

    expect(res.status).toBe(201);
    expect(query.mock.calls[0][1]).toEqual([null, 'temperature', 35, '>', 'warning']);
  });

  it('guarda o nome e a severidade indicados', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

    await request(app).post('/api/rules').send({
      name: 'Temperatura crítica',
      sensor_type: 'temperature',
      threshold: 35,
      condition: '>=',
      severity: 'critical',
    });

    expect(query.mock.calls[0][1]).toEqual([
      'Temperatura crítica', 'temperature', 35, '>=', 'critical',
    ]);
  });
});

describe('PUT /api/rules/:id', () => {
  it('actualiza apenas os campos enviados', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, threshold: 30 }] });

    const res = await request(app).put('/api/rules/1').send({ threshold: 30 });

    expect(res.status).toBe(200);

    const params = query.mock.calls[0][1];
    expect(params[1]).toBe(30);
    expect(params[5]).toBe('1');
  });

  it('devolve 404 para regra inexistente', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/rules/99').send({ threshold: 30 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Regra não encontrada');
  });
});

describe('DELETE /api/rules/:id', () => {
  it('elimina a regra', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/api/rules/1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Regra eliminada');
    expect(query.mock.calls[0][1]).toEqual(['1']);
  });
});
