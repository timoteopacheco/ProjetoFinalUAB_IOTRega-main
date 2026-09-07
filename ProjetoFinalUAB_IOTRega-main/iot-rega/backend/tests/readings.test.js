// Testes das rotas de leituras de sensores (séries temporais).
// A base de dados é mockada — não é preciso PostgreSQL/TimescaleDB.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const readingRoutes = require('../src/routes/readings');
const { buildApp } = require('./helpers/testApp');

const app = buildApp('/api/readings', readingRoutes, { id: 7, role: 'user' });

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/readings', () => {
  it('exige sensor_id', async () => {
    const res = await request(app).get('/api/readings');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sensor_id é obrigatório');
    expect(query).not.toHaveBeenCalled();
  });

  it('devolve leituras em bruto com o limite por omissão', async () => {
    const rows = [{ time: '2026-08-28T10:00:00Z', value: 21.4 }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/readings?sensor_id=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][0]).toContain('SELECT time, value');
    expect(query.mock.calls[0][1]).toEqual(['1', null, null, 200]);
  });

  it('respeita o intervalo temporal e o limite pedidos', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get(
      '/api/readings?sensor_id=1&from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z&limit=50'
    );

    expect(query.mock.calls[0][1]).toEqual([
      '1', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z', 50,
    ]);
  });

  it('agrega por buckets quando interval é indicado', async () => {
    query.mockResolvedValueOnce({ rows: [{ bucket: '2026-08-28T10:00:00Z', avg_value: 21 }] });

    const res = await request(app).get('/api/readings?sensor_id=1&interval=1 hour');

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][0]).toContain('date_bin');
    expect(query.mock.calls[0][1]).toEqual(['1 hour', '1', null, null, 200]);
  });
});

describe('GET /api/readings/latest', () => {
  it('exige plot_id', async () => {
    const res = await request(app).get('/api/readings/latest');

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('devolve a última leitura de cada sensor do talhão', async () => {
    const rows = [{ sensor_id: 1, value: 21.4 }, { sensor_id: 2, value: null }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/readings/latest?plot_id=4');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][0]).toContain('DISTINCT ON (s.id)');
    expect(query.mock.calls[0][1]).toEqual(['4']);
  });
});

describe('GET /api/readings/stats', () => {
  it('usa 24 horas por omissão', async () => {
    query.mockResolvedValueOnce({ rows: [{ total_readings: 10 }] });

    const res = await request(app).get('/api/readings/stats?sensor_id=1');

    expect(res.status).toBe(200);
    expect(res.body.total_readings).toBe(10);
    expect(query.mock.calls[0][1]).toEqual(['1', '24 hours']);
  });

  it('traduz o período pedido para um intervalo SQL', async () => {
    query.mockResolvedValue({ rows: [{}] });

    await request(app).get('/api/readings/stats?sensor_id=1&period=7d');
    expect(query.mock.calls[0][1][1]).toBe('7 days');

    await request(app).get('/api/readings/stats?sensor_id=1&period=30d');
    expect(query.mock.calls[1][1][1]).toBe('30 days');
  });

  it('cai para 24 horas quando o período é desconhecido', async () => {
    query.mockResolvedValueOnce({ rows: [{}] });

    await request(app).get('/api/readings/stats?sensor_id=1&period=1 ano');

    expect(query.mock.calls[0][1][1]).toBe('24 hours');
  });
});

describe('POST /api/readings', () => {
  it('regista uma leitura', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/readings')
      .send({ sensor_id: 1, value: 21.4, time: '2026-08-28T10:00:00Z' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Leitura registada', sensor_id: 1, value: 21.4 });
    expect(query.mock.calls[0][1]).toEqual(['2026-08-28T10:00:00Z', 1, 21.4]);
  });

  it('usa NOW() quando não é enviada a hora', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).post('/api/readings').send({ sensor_id: 1, value: 21.4 });

    expect(query.mock.calls[0][0]).toContain('COALESCE($1::timestamptz, NOW())');
    expect(query.mock.calls[0][1][0]).toBeNull();
  });

  it('aceita o valor zero como leitura válida', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/readings').send({ sensor_id: 1, value: 0 });

    expect(res.status).toBe(201);
  });

  it('rejeita pedidos sem sensor_id ou sem valor', async () => {
    const semValor = await request(app).post('/api/readings').send({ sensor_id: 1 });
    expect(semValor.status).toBe(400);

    const semSensor = await request(app).post('/api/readings').send({ value: 21.4 });
    expect(semSensor.status).toBe(400);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /api/readings/bulk', () => {
  it('insere várias leituras num só comando', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/readings/bulk').send({
      readings: [
        { sensor_id: 1, value: 20, time: '2026-08-28T10:00:00Z' },
        { sensor_id: 2, value: 30, time: '2026-08-28T10:00:00Z' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('2 leituras inseridas');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('($1, $2, $3),($4, $5, $6)');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toHaveLength(6);
    expect(params.slice(3)).toEqual(['2026-08-28T10:00:00Z', 2, 30]);
  });

  it('rejeita um corpo sem array de leituras', async () => {
    const semArray = await request(app).post('/api/readings/bulk').send({ readings: 'nada' });
    expect(semArray.status).toBe(400);

    const vazio = await request(app).post('/api/readings/bulk').send({ readings: [] });
    expect(vazio.status).toBe(400);

    expect(query).not.toHaveBeenCalled();
  });
});
