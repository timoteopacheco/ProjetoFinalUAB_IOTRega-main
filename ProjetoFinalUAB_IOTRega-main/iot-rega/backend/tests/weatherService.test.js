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

  it('ignora leituras horárias fora da janela das últimas 24 horas', async () => {
    const agora = new Date();
    const antiga = new Date(agora.getTime() - 48 * 60 * 60 * 1000);
    const futura = new Date(agora.getTime() + 6 * 60 * 60 * 1000);
    const recente = new Date(agora.getTime() - 60 * 60 * 1000);

    axios.get.mockResolvedValueOnce({
      data: {
        hourly: {
          time: [antiga.toISOString(), recente.toISOString(), futura.toISOString()],
          temperature_2m: [15, 21.5, 26],
          relativehumidity_2m: [80, 64, 50],
          precipitation: [3, 0.2, 0],
          windspeed_10m: [5, 11, 14],
        },
        daily: {
          time: [], temperature_2m_max: [], temperature_2m_min: [],
          precipitation_sum: [], precipitation_probability_max: [],
        },
      },
    });
    query.mockResolvedValue({ rows: [] });

    await weatherService.fetchForPlot(1, 41.15, -8.62);

    const inserts = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO weather_data'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][2]).toBe(21.5);
  });

  it('trata a probabilidade de chuva em falta como zero', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        hourly: {
          time: [], temperature_2m: [], relativehumidity_2m: [],
          precipitation: [], windspeed_10m: [],
        },
        daily: {
          time: ['2026-08-29'],
          temperature_2m_max: [29],
          temperature_2m_min: [17],
          precipitation_sum: [0],
          precipitation_probability_max: [null],
        },
      },
    });
    query.mockResolvedValue({ rows: [] });

    await weatherService.fetchForPlot(1, 41.15, -8.62);

    const forecast = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO weather_forecast'));
    expect(forecast[1][4]).toBe(0);
  });
});

describe('fetchAllPlots', () => {
  it('actualiza o clima de cada talhão com coordenadas', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM plot p')) {
        return { rows: [
          { id: 1, latitude: 41.15, longitude: -8.62 },
          { id: 2, latitude: 40.20, longitude: -8.41 },
        ] };
      }
      return { rows: [] };
    });
    axios.get.mockResolvedValue({
      data: {
        hourly: { time: [], temperature_2m: [], relativehumidity_2m: [], precipitation: [], windspeed_10m: [] },
        daily:  { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], precipitation_probability_max: [] },
      },
    });

    await weatherService.fetchAllPlots();

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get.mock.calls.map(([, config]) => config.params.latitude)).toEqual([41.15, 40.20]);
  });

  it('não deixa escapar erros da base de dados', async () => {
    query.mockRejectedValueOnce(new Error('base de dados indisponível'));

    await expect(weatherService.fetchAllPlots()).resolves.toBeUndefined();
    expect(axios.get).not.toHaveBeenCalled();
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

  it('limita a previsão a 7 dias a partir de hoje', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await weatherService.getForecast(3);

    expect(query.mock.calls[0][0]).toContain('forecast_time >= CURRENT_DATE');
    expect(query.mock.calls[0][0]).toContain('LIMIT 7');
  });
});
