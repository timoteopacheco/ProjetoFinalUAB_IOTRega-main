// Testes do serviço de clima (Open-Meteo). A API externa e a base de dados
// são mockadas — os testes não fazem chamadas de rede.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('axios');

const axios = require('axios');
const { query } = require('../src/config/database');
const weatherService = require('../src/services/weatherService');

beforeEach(() => {
  query.mockReset();
  axios.get.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('fetchForPlot', () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const validResponse = {
    data: {
      hourly: {
        time: [oneHourAgo.toISOString()],
        temperature_2m: [21.5],
        relativehumidity_2m: [64],
        precipitation: [0.2],
        windspeed_10m: [11],
      },
      daily: {
        time: ['2026-08-28'],
        temperature_2m_max: [29],
        temperature_2m_min: [17],
        precipitation_sum: [1.4],
        precipitation_probability_max: [40],
      },
    },
  };

  it('grava leituras horárias e previsão diária', async () => {
    axios.get.mockResolvedValueOnce(validResponse);
    query.mockResolvedValue({ rows: [] });

    const ok = await weatherService.fetchForPlot(1, 41.15, -8.62);

    expect(ok).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO weather_data'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO weather_forecast'))).toBe(true);
  });

  it('converte a probabilidade de chuva de percentagem para fracção', async () => {
    axios.get.mockResolvedValueOnce(validResponse);
    query.mockResolvedValue({ rows: [] });

    await weatherService.fetchForPlot(1, 41.15, -8.62);

    const forecast = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO weather_forecast'));
    expect(forecast[1][4]).toBeCloseTo(0.4);
  });

  it('pede as coordenadas certas à API', async () => {
    axios.get.mockResolvedValueOnce(validResponse);
    query.mockResolvedValue({ rows: [] });

    await weatherService.fetchForPlot(1, 41.15, -8.62);

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('open-meteo'),
      expect.objectContaining({
        params: expect.objectContaining({ latitude: 41.15, longitude: -8.62 }),
      })
    );
  });

  it('devolve false sem rebentar quando a API falha', async () => {
    axios.get.mockRejectedValueOnce(new Error('timeout'));

    const ok = await weatherService.fetchForPlot(1, 41.15, -8.62);

    expect(ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getForecast', () => {
  it('devolve a previsão do talhão pedido', async () => {
    const rows = [{ id: 1, plot_id: 3, temperature: 28, rainfall: 0, probability_rain: 0.1 }];
    query.mockResolvedValueOnce({ rows });

    const result = await weatherService.getForecast(3);

    expect(result).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual([3]);
  });
});
