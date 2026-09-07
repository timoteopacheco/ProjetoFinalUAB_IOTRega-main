// Testes das rotas agregadas do dashboard.
// A base de dados é mockada — não é preciso PostgreSQL.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const dashRoutes = require('../src/routes/dashboard');
const { buildApp } = require('./helpers/testApp');

const app = buildApp('/api/dashboard', dashRoutes, { id: 7, role: 'user' });

// O endpoint /summary dispara seis queries em paralelo; a resposta de cada
// uma é escolhida pelo conteúdo do SQL.
const mockSummary = (overrides = {}) => {
  const respostas = {
    plots:    { rows: [{ id: 1, name: 'Talhão Norte', area: 2.5, crop_type: 'vinha' }] },
    sensors:  { rows: [{ active: '3', total: '4' }] },
    alerts:   { rows: [{ severity: 'warning', total: 2 }] },
    readings: { rows: [{ id: 1, name: 'Temp Norte', value: 21.4 }] },
    costs:    { rows: [{ month_total: '150.75' }] },
    weather:  { rows: [{ temperature: 22, humidity: 60 }] },
    ...overrides,
  };

  query.mockImplementation(async (sql) => {
    if (sql.includes('FROM plot WHERE farm_id'))    return respostas.plots;
    if (sql.includes('COUNT(*) FILTER'))            return respostas.sensors;
    if (sql.includes('FROM alert a'))               return respostas.alerts;
    if (sql.includes('DISTINCT ON (s.id)'))         return respostas.readings;
    if (sql.includes('FROM cost_record'))           return respostas.costs;
    if (sql.includes('FROM weather_data'))          return respostas.weather;
    throw new Error(`Query inesperada: ${sql}`);
  });

  return respostas;
};

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/dashboard/summary', () => {
  it('exige farm_id', async () => {
    const res = await request(app).get('/api/dashboard/summary');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('farm_id é obrigatório');
    expect(query).not.toHaveBeenCalled();
  });

  it('junta talhões, sensores, alertas, leituras, custos e clima numa só resposta', async () => {
    mockSummary();

    const res = await request(app).get('/api/dashboard/summary?farm_id=3');

    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(6);
    expect(res.body.plots).toHaveLength(1);
    expect(res.body.sensors).toEqual({ active: '3', total: '4' });
    expect(res.body.alerts).toEqual([{ severity: 'warning', total: 2 }]);
    expect(res.body.latestReadings).toHaveLength(1);
    expect(res.body.weather).toEqual({ temperature: 22, humidity: 60 });

    // todas as queries são filtradas pela mesma exploração
    query.mock.calls.forEach(([, params]) => expect(params).toEqual(['3']));
  });

  it('converte o total de custos do mês para número', async () => {
    mockSummary();

    const res = await request(app).get('/api/dashboard/summary?farm_id=3');

    expect(res.body.costThisMonth).toBe(150.75);
  });

  it('devolve zero e clima nulo quando não há dados', async () => {
    mockSummary({ costs: { rows: [] }, weather: { rows: [] } });

    const res = await request(app).get('/api/dashboard/summary?farm_id=3');

    expect(res.body.costThisMonth).toBe(0);
    expect(res.body.weather).toBeNull();
  });

  it('devolve 500 quando uma das queries falha', async () => {
    query.mockRejectedValue(new Error('base de dados indisponível'));

    const res = await request(app).get('/api/dashboard/summary?farm_id=3');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/dashboard/chart', () => {
  it('usa buckets de 1 hora nas últimas 24 horas por omissão', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/dashboard/chart?sensor_id=1');

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual(['1 hour', '1', '24 hours']);
  });

  it('ajusta bucket e janela ao período pedido', async () => {
    query.mockResolvedValue({ rows: [] });

    await request(app).get('/api/dashboard/chart?sensor_id=1&period=7d');
    expect(query.mock.calls[0][1]).toEqual(['6 hours', '1', '7 days']);

    await request(app).get('/api/dashboard/chart?sensor_id=1&period=30d');
    expect(query.mock.calls[1][1]).toEqual(['1 day', '1', '30 days']);
  });

  it('devolve as séries agregadas', async () => {
    const rows = [{ bucket: '2026-08-28T10:00:00Z', avg: '21.40', min: '20.10', max: '22.80' }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/dashboard/chart?sensor_id=1');

    expect(res.body).toEqual(rows);
  });
});
