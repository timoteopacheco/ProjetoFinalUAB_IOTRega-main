// Testes do serviço MQTT: subscrição de tópicos e ingestão de leituras.
// O broker, a base de dados e o motor de alertas são mockados — não é
// preciso mosquitto nem PostgreSQL.

process.env.SIMULATE_SENSORS = 'false';   // o simulador não arranca nos testes
process.env.MQTT_BROKER = 'mqtt://broker-de-teste:1883';

jest.mock('mqtt');
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/services/alertService', () => ({ evaluateSensor: jest.fn() }));

const mqtt = require('mqtt');
const { query } = require('../src/config/database');
const alertService = require('../src/services/alertService');
const mqttService = require('../src/services/mqttService');

// Cliente MQTT falso: guarda os handlers registados para os podermos disparar.
const novoClient = (connected = true) => {
  const handlers = {};
  return {
    connected,
    handlers,
    on: jest.fn((evento, handler) => { handlers[evento] = handler; }),
    subscribe: jest.fn((topico, cb) => cb && cb(null)),
    publish: jest.fn(),
  };
};

const ligar = (connected = true) => {
  const client = novoClient(connected);
  mqtt.connect.mockReturnValueOnce(client);
  mqttService.connect();
  return client;
};

beforeEach(() => {
  query.mockReset();
  alertService.evaluateSensor.mockReset();
  mqtt.connect = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mqttService.stopSimulator();
  jest.restoreAllMocks();
});

describe('connect', () => {
  it('liga ao broker configurado e regista os handlers', () => {
    const client = ligar();

    expect(mqtt.connect).toHaveBeenCalledWith(
      'mqtt://broker-de-teste:1883',
      expect.objectContaining({ clientId: expect.any(String) })
    );
    expect(Object.keys(client.handlers)).toEqual(
      expect.arrayContaining(['connect', 'message', 'error', 'offline'])
    );
  });

  it('subscreve a árvore de tópicos iotrega ao ligar', () => {
    const client = ligar();

    client.handlers.connect();

    expect(client.subscribe).toHaveBeenCalledWith('iotrega/#', expect.any(Function));
  });

  it('não rebenta quando o broker devolve erro', () => {
    const client = ligar();

    expect(() => client.handlers.error(new Error('ECONNREFUSED'))).not.toThrow();
  });

  it('não rebenta quando a ligação falha logo no arranque', () => {
    mqtt.connect.mockImplementationOnce(() => { throw new Error('broker inacessível'); });

    expect(() => mqttService.connect()).not.toThrow();
  });
});

describe('ingestão de mensagens MQTT', () => {
  const publicar = async (client, payload) =>
    client.handlers.message('iotrega/1/2/esp32-01', Buffer.from(payload));

  it('grava a leitura e avalia as regras do sensor', async () => {
    const client = ligar();
    query
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })   // sensor encontrado
      .mockResolvedValueOnce({ rows: [] });            // INSERT

    await publicar(client, JSON.stringify({ device_id: 'esp32-01', value: 21.4 }));

    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sensor_reading'));
    expect(insert[1]).toEqual([null, 12, 21.4]);
    expect(alertService.evaluateSensor).toHaveBeenCalledWith(12, 21.4);
  });

  it('usa a hora enviada pelo dispositivo quando existe', async () => {
    const client = ligar();
    query
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })
      .mockResolvedValueOnce({ rows: [] });

    await publicar(client, JSON.stringify({
      device_id: 'esp32-01', value: 21.4, time: '2026-08-28T10:00:00Z',
    }));

    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sensor_reading'));
    expect(insert[1][0]).toBe('2026-08-28T10:00:00Z');
  });

  it('aceita o valor zero', async () => {
    const client = ligar();
    query
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })
      .mockResolvedValueOnce({ rows: [] });

    await publicar(client, JSON.stringify({ device_id: 'esp32-01', value: 0 }));

    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO sensor_reading'))).toBe(true);
  });

  it('ignora mensagens de dispositivos desconhecidos', async () => {
    const client = ligar();
    query.mockResolvedValueOnce({ rows: [] });   // sensor não existe ou inactivo

    await publicar(client, JSON.stringify({ device_id: 'intruso', value: 21.4 }));

    expect(query).toHaveBeenCalledTimes(1);
    expect(alertService.evaluateSensor).not.toHaveBeenCalled();
  });

  it('ignora mensagens sem device_id ou sem valor', async () => {
    const client = ligar();

    await publicar(client, JSON.stringify({ value: 21.4 }));
    await publicar(client, JSON.stringify({ device_id: 'esp32-01' }));

    expect(query).not.toHaveBeenCalled();
  });

  it('não rebenta com payloads que não são JSON', async () => {
    const client = ligar();

    await expect(publicar(client, 'isto-nao-e-json')).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('não rebenta quando a base de dados falha', async () => {
    const client = ligar();
    query.mockRejectedValueOnce(new Error('base de dados indisponível'));

    await expect(
      publicar(client, JSON.stringify({ device_id: 'esp32-01', value: 21.4 }))
    ).resolves.toBeUndefined();
  });
});

describe('publish', () => {
  it('serializa objectos antes de publicar', () => {
    const client = ligar(true);

    mqttService.publish('iotrega/1/2/esp32-01', { value: 21.4 });

    expect(client.publish).toHaveBeenCalledWith(
      'iotrega/1/2/esp32-01',
      JSON.stringify({ value: 21.4 })
    );
  });

  it('publica strings tal como são recebidas', () => {
    const client = ligar(true);

    mqttService.publish('iotrega/teste', 'ping');

    expect(client.publish).toHaveBeenCalledWith('iotrega/teste', 'ping');
  });

  it('não publica enquanto o cliente estiver desligado', () => {
    const client = ligar(false);

    mqttService.publish('iotrega/teste', 'ping');

    expect(client.publish).not.toHaveBeenCalled();
  });
});
