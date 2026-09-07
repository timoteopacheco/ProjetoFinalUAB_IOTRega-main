// Testes das rotas de clima. A base de dados e o serviço Open-Meteo são
// mockados — os testes não fazem chamadas de rede.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/services/weatherService', () => ({
  getForecast: jest.fn(),
  fetchForPlot: jest.fn(),
}));

const request = require('supertest');
const { query } = require('../src/config/database');
const weatherService = require('../src/services/weatherService');
const weatherRoutes = require('../src/routes/weather');
const { buildApp } = require('./helpers/testApp');

const app = buildApp('/api/weather', weatherRoutes, { id: 7, role: 'user' });

beforeEach(() => {
  query.mockReset();
  weatherService.getForecast.mockReset();
  weatherService.fetchForPlot.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/weather', () => {
  it('exige plot_id', async () => {
    const res = await request(app).get('/api/weather');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('plot_id é obrigatório');
    expect(query).not.toHaveBeenCalled();
  });

  it('devolve as últimas 24 horas por omissão', async () => {
    const rows = [{ time: '2026-08-28T10:00:00Z', temperature: 22 }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(app).get('/api/weather?plot_id=4');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual(['4', null, null]);
  });

  it('respeita o intervalo temporal pedido', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/weather?plot_id=4&from=2026-08-01&to=2026-08-02');

    expect(query.mock.calls[0][1]).toEqual(['4', '2026-08-01', '2026-08-02']);
  });
});

describe('GET /api/weather/forecast', () => {
  it('exige plot_id', async () => {
    const res = await request(app).get('/api/weather/forecast');

    expect(res.status).toBe(400);
    expect(weatherService.getForecast).not.toHaveBeenCalled();
  });

  it('delega a previsão no weatherService', async () => {
    const previsao = [{ forecast_time: '2026-08-29', temperature: 29, probability_rain: 0.4 }];
    weatherService.getForecast.mockResolvedValueOnce(previsao);

    const res = await request(app).get('/api/weather/forecast?plot_id=4');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(previsao);
    expect(weatherService.getForecast).toHaveBeenCalledWith('4');
  });
});

describe('POST /api/weather/refresh', () => {
  it('devolve 404 quando o talhão não existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/weather/refresh?plot_id=99');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Plot não encontrado');
    expect(weatherService.fetchForPlot).not.toHaveBeenCalled();
  });

  it('actualiza o clima com o centróide do talhão', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 4, latitude: 41.15, longitude: -8.62 }] });
    weatherService.fetchForPlot.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/weather/refresh?plot_id=4');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Dados climáticos actualizados');
    expect(weatherService.fetchForPlot).toHaveBeenCalledWith(4, 41.15, -8.62);
  });
});
