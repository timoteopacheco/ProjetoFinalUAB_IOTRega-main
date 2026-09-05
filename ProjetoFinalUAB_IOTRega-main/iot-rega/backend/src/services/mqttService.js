// src/services/mqttService.js
// Serviço MQTT: subscribe a tópicos IoT e ingestão de dados
// Inclui simulador quando não há hardware real disponível

const mqtt   = require('mqtt');
const { query } = require('../config/database');
require('dotenv').config();

// ============================================================
// Configuração
// ============================================================
const BROKER        = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const CLIENT_ID     = process.env.MQTT_CLIENT_ID || 'iotrega-backend';
const SIMULATE      = process.env.SIMULATE_SENSORS === 'true';
const SIM_INTERVAL  = parseInt(process.env.SIMULATE_INTERVAL_MS) || 10000;

// Tópico padrão: iotrega/<farm_id>/<plot_id>/<sensor_device_id>
const TOPIC_PATTERN = 'iotrega/#';

let client = null;

// ============================================================
// Utilitários de simulação
// ============================================================
// Gera valor realista para cada tipo de sensor
const simulateValue = (type) => {
  const ranges = {
    temperature:   { min: 10, max: 38, decimal: 1 },
    humidity:      { min: 30, max: 95, decimal: 1 },
    soil_moisture: { min: 10, max: 80, decimal: 1 },
    rainfall:      { min: 0,  max: 15, decimal: 2 },
    wind_speed:    { min: 0,  max: 40, decimal: 1 },
  };
  const r = ranges[type] || { min: 0, max: 100, decimal: 1 };
  const raw = r.min + Math.random() * (r.max - r.min);
  return parseFloat(raw.toFixed(r.decimal));
};

// ============================================================
// Processar mensagem MQTT recebida
// ============================================================
const processMessage = async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const { device_id, value, time } = data;

    if (!device_id || value === undefined) {
      console.warn('⚠️  Mensagem MQTT inválida:', data);
      return;
    }

    // Encontrar sensor pelo device_id
    const sensorResult = await query(
      'SELECT id FROM sensor WHERE device_id = $1 AND active = true',
      [device_id]
    );

    if (!sensorResult.rows.length) {
      console.warn(`⚠️  Sensor desconhecido: device_id=${device_id}`);
      return;
    }

    const sensor_id = sensorResult.rows[0].id;

    await query(
      `INSERT INTO sensor_reading (time, sensor_id, value)
       VALUES (COALESCE($1::timestamptz, NOW()), $2, $3)`,
      [time || null, sensor_id, value]
    );

    console.log(`📥 [MQTT] ${topic} → sensor ${sensor_id} = ${value}`);

    // Avaliar regras para este sensor (importação lazy para evitar circular)
    const alertService = require('./alertService');
    await alertService.evaluateSensor(sensor_id, value);

  } catch (err) {
    console.error('❌ Erro ao processar mensagem MQTT:', err.message);
  }
};

// ============================================================
// Simulador IoT (quando SIMULATE_SENSORS=true)
// ============================================================
let simulatorInterval = null;

const startSimulator = async () => {
  console.log(`🤖 Simulador IoT iniciado (intervalo: ${SIM_INTERVAL}ms)`);

  simulatorInterval = setInterval(async () => {
    try {
      // Buscar todos os sensores activos
      const sensors = await query(
        `SELECT s.id, s.type, s.device_id, p.farm_id, p.id AS plot_id
         FROM sensor s JOIN plot p ON p.id = s.plot_id
         WHERE s.active = true`
      );

      for (const sensor of sensors.rows) {
        const value = simulateValue(sensor.type);
        const payload = JSON.stringify({
          device_id: sensor.device_id || `sim-sensor-${sensor.id}`,
          value,
          time: new Date().toISOString(),
          simulated: true
        });

        const topic = `iotrega/${sensor.farm_id}/${sensor.plot_id}/${sensor.device_id || sensor.id}`;

        if (client && client.connected) {
          // Publicar via MQTT real
          client.publish(topic, payload);
        } else {
          // Processar directamente (sem broker)
          await processMessage(topic, Buffer.from(payload));
        }
      }
    } catch (err) {
      console.error('❌ Erro no simulador:', err.message);
    }
  }, SIM_INTERVAL);
};

const stopSimulator = () => {
  if (simulatorInterval) {
    clearInterval(simulatorInterval);
    simulatorInterval = null;
    console.log('🛑 Simulador IoT parado');
  }
};

// ============================================================
// Conexão MQTT
// ============================================================
const connect = () => {
  try {
    client = mqtt.connect(BROKER, {
      clientId: CLIENT_ID,
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    client.on('connect', () => {
      console.log(`📡 MQTT conectado: ${BROKER}`);
      client.subscribe(TOPIC_PATTERN, (err) => {
        if (err) console.error('❌ Erro ao subscrever:', err.message);
        else console.log(`📡 MQTT a escutar: ${TOPIC_PATTERN}`);
      });

      if (SIMULATE) startSimulator();
    });

    client.on('message', processMessage);

    client.on('error', (err) => {
      console.error('❌ Erro MQTT:', err.message);
      // Se não conseguir conectar ao broker, usa simulador directo
      if (SIMULATE && !simulatorInterval) {
        console.log('⚠️  Broker indisponível — modo simulação directa activado');
        startSimulator();
      }
    });

    client.on('offline', () => {
      console.warn('⚠️  MQTT offline');
    });

  } catch (err) {
    console.error('❌ Falha ao iniciar MQTT:', err.message);
    if (SIMULATE) {
      console.log('⚠️  A usar simulação directa (sem broker MQTT)');
      startSimulator();
    }
  }
};

// Publicar mensagem (usado para testes ou outros serviços)
const publish = (topic, payload) => {
  if (client && client.connected) {
    client.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
};

module.exports = { connect, publish, stopSimulator };
