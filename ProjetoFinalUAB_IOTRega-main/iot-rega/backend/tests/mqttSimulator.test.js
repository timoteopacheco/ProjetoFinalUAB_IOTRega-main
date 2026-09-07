// Testes do simulador IoT do serviço MQTT (SIMULATE_SENSORS=true).
// As variáveis de ambiente são lidas no carregamento do módulo, por isso este
// ficheiro está separado do mqttService.test.js.

process.env.SIMULATE_SENSORS = 'true';
process.env.SIMULATE_INTERVAL_MS = '1000';

jest.mock('mqtt');
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/services/alertService', () => ({ evaluateSensor: jest.fn() }));

const mqtt = require('mqtt');
const { query } = require('../src/config/database');
const alertService = require('../src/services/alertService');
const mqttService = require('../src/services/mqttService');

const SENSORES = [
  { id: 1, type: 'temperature', device_id: 'esp32-01', farm_id: 3, plot_id: 4 },
  { id: 2, type: 'soil_moisture', device_id: null, farm_id: 3, plot_id: 4 },
];

const novoClient = (connected) => {
  const handlers = {};
  return {
    connected,
    handlers,
    on: jest.fn((evento, handler) => { handlers[evento] = handler; }),
    subscribe: jest.fn((topico, cb) => cb && cb(null)),
    publish: jest.fn(),
  };
};

// Liga e arranca o simulador através do evento indicado ('connect' ou 'error').
const arrancarSimulador = (connected, evento = 'connect') => {
  const client = novoClient(connected);
  mqtt.connect.mockReturnValueOnce(client);
  mqttService.connect();
  client.handlers[evento](new Error('broker indisponível'));
  return client;
};

beforeEach(() => {
  jest.useFakeTimers();
  query.mockReset();
  alertService.evaluateSensor.mockReset();
  mqtt.connect = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mqttService.stopSimulator();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('simulador IoT', () => {
  it('publica uma leitura por sensor activo em cada ciclo', async () => {
    query.mockResolvedValue({ rows: SENSORES });
    const client = arrancarSimulador(true);

    await jest.advanceTimersByTimeAsync(1000);

    expect(client.publish).toHaveBeenCalledTimes(2);
    const [topico, payload] = client.publish.mock.calls[0];
    expect(topico).toBe('iotrega/3/4/esp32-01');
    expect(JSON.parse(payload)).toMatchObject({ device_id: 'esp32-01', simulated: true });
  });

  it('gera valores dentro do intervalo realista de cada tipo de sensor', async () => {
    query.mockResolvedValue({ rows: SENSORES });
    const client = arrancarSimulador(true);

    await jest.advanceTimersByTimeAsync(3000);   // três ciclos

    const valores = client.publish.mock.calls.map(([topico, payload]) => ({
      topico,
      value: JSON.parse(payload).value,
    }));
    expect(valores.length).toBeGreaterThanOrEqual(6);

    valores
      .filter((v) => v.topico.endsWith('esp32-01'))
      .forEach((v) => {
        expect(v.value).toBeGreaterThanOrEqual(10);   // temperature: 10–38 °C
        expect(v.value).toBeLessThanOrEqual(38);
      });
  });

  it('usa um device_id sintético quando o sensor não tem um definido', async () => {
    query.mockResolvedValue({ rows: [SENSORES[1]] });
    const client = arrancarSimulador(true);

    await jest.advanceTimersByTimeAsync(1000);

    const [topico, payload] = client.publish.mock.calls[0];
    expect(topico).toBe('iotrega/3/4/2');
    expect(JSON.parse(payload).device_id).toBe('sim-sensor-2');
  });

  it('grava directamente na base de dados quando não há broker', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM sensor s JOIN plot p')) return { rows: [SENSORES[0]] };
      if (sql.includes('SELECT id FROM sensor'))     return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
    const client = arrancarSimulador(false, 'error');

    await jest.advanceTimersByTimeAsync(1000);

    expect(client.publish).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO sensor_reading'))).toBe(true);
    expect(alertService.evaluateSensor).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('continua a correr quando um ciclo falha', async () => {
    query.mockRejectedValueOnce(new Error('base de dados indisponível'));
    query.mockResolvedValue({ rows: SENSORES });
    const client = arrancarSimulador(true);

    await jest.advanceTimersByTimeAsync(1000);   // ciclo com erro
    expect(client.publish).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);   // ciclo seguinte recupera
    expect(client.publish).toHaveBeenCalledTimes(2);
  });

  it('stopSimulator trava os ciclos seguintes', async () => {
    query.mockResolvedValue({ rows: SENSORES });
    const client = arrancarSimulador(true);

    await jest.advanceTimersByTimeAsync(1000);
    mqttService.stopSimulator();
    await jest.advanceTimersByTimeAsync(5000);

    expect(client.publish).toHaveBeenCalledTimes(2);
  });
});
