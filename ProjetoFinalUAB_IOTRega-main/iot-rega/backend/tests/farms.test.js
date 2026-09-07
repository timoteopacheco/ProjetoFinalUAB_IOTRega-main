// Testes das rotas de explorações agrícolas.
// A base de dados é mockada — não é preciso PostgreSQL nem PostGIS.

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const request = require('supertest');
const { query, pool } = require('../src/config/database');
const farmRoutes = require('../src/routes/farms');
const { buildApp } = require('./helpers/testApp');

const utilizador = { id: 7, role: 'user' };
const app = buildApp('/api/farms', farmRoutes, utilizador);

// Cliente de transação usado pelo POST /api/farms
const novoClient = (farm = { id: 3, name: 'Quinta do Vale' }) => ({
  query: jest.fn(async (sql) => {
    if (sql.includes('INSERT INTO farm')) return { rows: [farm] };
    return { rows: [] };
  }),
  release: jest.fn(),
});

beforeEach(() => {
  query.mockReset();
  pool.connect.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/farms', () => {
  it('lista apenas as explorações do utilizador autenticado', async () => {
    const rows = [{ id: 1, name: 'Quinta do Vale', plot_count: '2' }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/farms');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual([utilizador.id]);
  });
});

describe('GET /api/farms/:id', () => {
  it('devolve a exploração pedida', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Quinta do Vale' }] });

    const res = await request(app).get('/api/farms/1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Quinta do Vale');
    expect(query.mock.calls[0][1]).toEqual(['1', utilizador.id]);
  });

  it('devolve 404 para exploração de outro utilizador', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/farms/99');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Exploração não encontrada');
  });
});

describe('POST /api/farms', () => {
  it('cria a exploração e associa o utilizador como owner na mesma transação', async () => {
    const client = novoClient();
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post('/api/farms')
      .send({ name: 'Quinta do Vale', description: 'Vinha', latitude: 41.15, longitude: -8.62 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 3, name: 'Quinta do Vale' });

    const sqls = client.query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(sqls.some((sql) => sql.includes('INSERT INTO user_farm'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('grava a longitude antes da latitude, como exige ST_MakePoint', async () => {
    const client = novoClient();
    pool.connect.mockResolvedValueOnce(client);

    await request(app)
      .post('/api/farms')
      .send({ name: 'Quinta do Vale', latitude: 41.15, longitude: -8.62 });

    const insert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO farm'));
    expect(insert[1]).toEqual(['Quinta do Vale', null, -8.62, 41.15]);
  });

  it('rejeita coordenadas fora do intervalo válido', async () => {
    const res = await request(app)
      .post('/api/farms')
      .send({ name: 'Quinta', latitude: 120, longitude: -8.62 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.any(Array));
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejeita exploração sem nome', async () => {
    const res = await request(app)
      .post('/api/farms')
      .send({ name: '', latitude: 41.15, longitude: -8.62 });

    expect(res.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('faz ROLLBACK e liberta o cliente quando o INSERT falha', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.includes('INSERT INTO farm')) throw new Error('falha no INSERT');
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(client);

    const res = await request(app)
      .post('/api/farms')
      .send({ name: 'Quinta', latitude: 41.15, longitude: -8.62 });

    expect(res.status).toBe(500);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });
});

describe('PUT /api/farms/:id', () => {
  it('actualiza os dados da exploração', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Quinta Nova', latitude: 41.2, longitude: -8.5 }],
    });

    const res = await request(app)
      .put('/api/farms/1')
      .send({ name: 'Quinta Nova', latitude: 41.2, longitude: -8.5 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Quinta Nova');
    expect(query.mock.calls[0][1]).toEqual(['Quinta Nova', null, 41.2, -8.5, '1', utilizador.id]);
  });

  it('exige nome, latitude e longitude', async () => {
    const res = await request(app).put('/api/farms/1').send({ name: 'Quinta Nova' });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejeita coordenadas não numéricas', async () => {
    const res = await request(app)
      .put('/api/farms/1')
      .send({ name: 'Quinta', latitude: 'norte', longitude: -8.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/números válidos/);
    expect(query).not.toHaveBeenCalled();
  });

  it('devolve 404 quando a exploração não é do utilizador', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/farms/99')
      .send({ name: 'Quinta', latitude: 41.2, longitude: -8.5 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/farms/:id', () => {
  it('elimina a exploração do owner', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app).delete('/api/farms/1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Exploração eliminada', id: 1 });
  });

  it('devolve 404 a quem não é owner', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/api/farms/1');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/sem permissão/);
  });
});
