// Testes das rotas de alertas.
// A base de dados é mockada — não é preciso PostgreSQL.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const alertRoutes = require('../src/routes/alerts');
const { buildApp } = require('./helpers/testApp');

const app = buildApp('/api/alerts', alertRoutes, { id: 7, role: 'user' });

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/alerts', () => {
  it('lista por omissão apenas os alertas por resolver', async () => {
    const rows = [{ id: 1, severity: 'critical', resolved: false }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/alerts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual([false, 50]);
  });

  it('permite listar os alertas já resolvidos', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/alerts?resolved=true');

    expect(query.mock.calls[0][1][0]).toBe(true);
  });

  it('devolve todos os alertas quando resolved não é true nem false', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/alerts?resolved=todos');

    expect(query.mock.calls[0][1][0]).toBeNull();
  });

  it('respeita o limite pedido', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/alerts?limit=10');

    expect(query.mock.calls[0][1][1]).toBe(10);
  });
});

describe('PATCH /api/alerts/:id/resolve', () => {
  it('marca o alerta como resolvido', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, resolved: true }] });

    const res = await request(app).patch('/api/alerts/1/resolve');

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(query.mock.calls[0][0]).toContain('resolved_at = NOW()');
    expect(query.mock.calls[0][1]).toEqual(['1']);
  });

  it('devolve 404 para alerta inexistente', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch('/api/alerts/99/resolve');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Alerta não encontrado');
  });
});

describe('GET /api/alerts/count', () => {
  it('devolve a contagem de alertas activos por severidade', async () => {
    const rows = [{ severity: 'critical', total: 2 }, { severity: 'warning', total: 5 }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/alerts/count');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][0]).toContain('resolved = false');
  });
});
