// Testes das rotas de sensores IoT.
// A base de dados é mockada — não é preciso PostgreSQL.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const sensorRoutes = require('../src/routes/sensors');
const { buildApp } = require('./helpers/testApp');

const utilizador = { id: 7, role: 'user' };
const app = buildApp('/api/sensors', sensorRoutes, utilizador);

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/sensors', () => {
  it('lista os sensores das explorações do utilizador', async () => {
    const rows = [{ id: 1, name: 'Temp Norte', type: 'temperature', last_value: 21.4 }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/sensors');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual([utilizador.id]);
    expect(query.mock.calls[0][0]).not.toContain('s.plot_id = $2');
  });

  it('filtra por talhão quando plot_id é indicado', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/sensors?plot_id=4');

    expect(query.mock.calls[0][0]).toContain('s.plot_id = $2');
    expect(query.mock.calls[0][1]).toEqual([utilizador.id, '4']);
  });
});

describe('GET /api/sensors/:id', () => {
  it('devolve o sensor pedido', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Temp Norte' }] });

    const res = await request(app).get('/api/sensors/1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Temp Norte');
    expect(query.mock.calls[0][1]).toEqual(['1', utilizador.id]);
  });

  it('devolve 404 para sensor de outro utilizador', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/sensors/99');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Sensor não encontrado');
  });
});

describe('POST /api/sensors', () => {
  it('cria o sensor com os campos opcionais a null', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 9, name: 'Humidade Sul' }] });

    const res = await request(app)
      .post('/api/sensors')
      .send({ plot_id: 4, name: 'Humidade Sul', type: 'humidity' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(9);
    expect(query.mock.calls[0][1]).toEqual([4, 'Humidade Sul', 'humidity', null, null, null, null]);
  });

  it('guarda unidade, device_id e coordenadas quando fornecidos', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 9 }] });

    await request(app).post('/api/sensors').send({
      plot_id: 4,
      name: 'Temp Norte',
      type: 'temperature',
      unit: '°C',
      device_id: 'esp32-01',
      latitude: 41.15,
      longitude: -8.62,
    });

    expect(query.mock.calls[0][1]).toEqual([
      4, 'Temp Norte', 'temperature', '°C', 'esp32-01', 41.15, -8.62,
    ]);
  });
});

describe('PUT /api/sensors/:id', () => {
  it('actualiza apenas os campos enviados (COALESCE mantém os restantes)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Temp Norte', active: false }] });

    const res = await request(app).put('/api/sensors/1').send({ active: false });

    expect(res.status).toBe(200);

    const params = query.mock.calls[0][1];
    expect(params[0]).toBeUndefined();  // name não enviado
    expect(params[2]).toBe(false);      // active
    expect(params[5]).toBe('1');
  });

  it('devolve 404 quando o sensor não existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/sensors/99').send({ name: 'X' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/sensors/:id', () => {
  it('elimina o sensor', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/api/sensors/1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Sensor eliminado');
    expect(query.mock.calls[0][1]).toEqual(['1']);
  });
});
