// Testes das rotas de talhões (CRUD + GeoJSON).
// A base de dados é mockada — não é preciso PostgreSQL nem PostGIS.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const { query } = require('../src/config/database');
const plotRoutes = require('../src/routes/plots');
const { buildApp } = require('./helpers/testApp');

const utilizador = { id: 7, role: 'user' };
const app = buildApp('/api/plots', plotRoutes, utilizador);

const poligono = {
  type: 'Polygon',
  coordinates: [[[-8.62, 41.15], [-8.61, 41.15], [-8.61, 41.16], [-8.62, 41.15]]],
};

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/plots', () => {
  it('lista os talhões de todas as explorações do utilizador', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Talhão Norte' }] });

    const res = await request(app).get('/api/plots');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(query.mock.calls[0][1]).toEqual([utilizador.id]);
    expect(query.mock.calls[0][0]).not.toContain('p.farm_id = $2');
  });

  it('filtra por exploração quando farm_id é indicado', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/plots?farm_id=3');

    expect(query.mock.calls[0][0]).toContain('p.farm_id = $2');
    expect(query.mock.calls[0][1]).toEqual([utilizador.id, '3']);
  });
});

describe('GET /api/plots/geojson', () => {
  it('devolve a FeatureCollection construída pelo PostGIS', async () => {
    const geojson = { type: 'FeatureCollection', features: [{ type: 'Feature' }] };
    query.mockResolvedValueOnce({ rows: [{ geojson }] });

    const res = await request(app).get('/api/plots/geojson');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(geojson);
  });

  it('devolve uma FeatureCollection vazia quando não há talhões', async () => {
    query.mockResolvedValueOnce({ rows: [{ geojson: null }] });

    const res = await request(app).get('/api/plots/geojson');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('aceita o filtro por exploração', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/plots/geojson?farm_id=3');

    expect(query.mock.calls[0][0]).toContain('AND p.farm_id = $2');
    expect(query.mock.calls[0][1]).toEqual([utilizador.id, '3']);
  });
});

describe('GET /api/plots/:id', () => {
  it('devolve o talhão pedido', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Talhão Norte' }] });

    const res = await request(app).get('/api/plots/1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('devolve 404 para talhão sem acesso', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/plots/99');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Talhão não encontrado');
  });
});

describe('POST /api/plots', () => {
  it('cria o talhão com a geometria recebida', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'Talhão Novo' }] });

    const res = await request(app)
      .post('/api/plots')
      .send({ farm_id: 3, name: 'Talhão Novo', area: 1.5, geojson: poligono });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);

    const params = query.mock.calls[0][1];
    expect(params[0]).toBe(3);
    expect(params[1]).toBe('Talhão Novo');
    expect(JSON.parse(params[4])).toEqual(poligono);
  });

  it('assume vinha quando não é indicada a cultura', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await request(app)
      .post('/api/plots')
      .send({ farm_id: 3, name: 'Talhão Novo', geojson: poligono });

    const params = query.mock.calls[0][1];
    expect(params[3]).toBe('vinha');
    expect(params[2]).toBeNull();
  });

  it('deixa a posição a null para o centróide ser calculado no PostGIS', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await request(app)
      .post('/api/plots')
      .send({ farm_id: 3, name: 'Talhão Novo', geojson: poligono });

    expect(query.mock.calls[0][0]).toContain('ST_Centroid');
    expect(query.mock.calls[0][1][5]).toBeNull();
  });
});

describe('PUT /api/plots/:id', () => {
  it('actualiza o talhão e mantém a geometria quando não é enviada', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Talhão Sul' }] });

    const res = await request(app).put('/api/plots/1').send({ name: 'Talhão Sul' });

    expect(res.status).toBe(200);

    const params = query.mock.calls[0][1];
    expect(params[0]).toBe('Talhão Sul');
    expect(params[3]).toBeNull();   // geojson
    expect(params[4]).toBeNull();   // position
    expect(params[5]).toBe('1');
    expect(params[6]).toBe(utilizador.id);
  });

  it('rejeita nome vazio', async () => {
    const res = await request(app).put('/api/plots/1').send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('O nome do talhão é obrigatório.');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejeita tipo de cultura fora da lista permitida', async () => {
    const res = await request(app).put('/api/plots/1').send({ crop_type: 'bananeira' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Tipo de cultura inválido.');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejeita área negativa ou não numérica', async () => {
    const negativa = await request(app).put('/api/plots/1').send({ area: -2 });
    expect(negativa.status).toBe(400);

    const texto = await request(app).put('/api/plots/1').send({ area: 'muita' });
    expect(texto.status).toBe(400);

    expect(query).not.toHaveBeenCalled();
  });

  it('devolve 404 quando o talhão não pertence ao utilizador', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/plots/99').send({ name: 'Talhão Sul' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/plots/:id', () => {
  it('elimina o talhão', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

    const res = await request(app).delete('/api/plots/1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Talhão eliminado');
    expect(query.mock.calls[0][1]).toEqual(['1', utilizador.id]);
  });

  it('devolve 404 quando não há nada para eliminar', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app).delete('/api/plots/99');

    expect(res.status).toBe(404);
  });
});
