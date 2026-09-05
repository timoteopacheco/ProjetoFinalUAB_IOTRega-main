// src/services/alertService.js
// Avaliação de regras e criação de alertas

const { query } = require('../config/database');

// ============================================================
// Avaliar um sensor específico contra todas as regras activas
// ============================================================
const evaluateSensor = async (sensor_id, value) => {
  try {
    // Buscar tipo do sensor
    const sensorResult = await query(
      'SELECT type FROM sensor WHERE id = $1',
      [sensor_id]
    );
    if (!sensorResult.rows.length) return;

    const { type } = sensorResult.rows[0];

    // Buscar regras activas para este tipo de sensor
    const rules = await query(
      'SELECT * FROM rule WHERE sensor_type = $1 AND active = true',
      [type]
    );

    for (const rule of rules.rows) {
      const triggered = evaluateCondition(value, rule.condition, rule.threshold);

      if (triggered) {
        // Verificar se já existe alerta não resolvido para este sensor+regra
        const existingAlert = await query(
          `SELECT id FROM alert
           WHERE sensor_id = $1 AND rule_id = $2 AND resolved = false
           LIMIT 1`,
          [sensor_id, rule.id]
        );

        if (!existingAlert.rows.length) {
          await query(
            `INSERT INTO alert (sensor_id, rule_id, message, value, severity)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sensor_id,
              rule.id,
              `${rule.name || type}: valor ${value} ${rule.condition} ${rule.threshold} (${rule.unit || ''})`,
              value,
              rule.severity || 'warning'
            ]
          );
          console.log(`🚨 Alerta criado: sensor ${sensor_id}, valor ${value}, regra ${rule.id}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Erro ao avaliar sensor:', err.message);
  }
};

// ============================================================
// Avaliar todas as regras para todas as últimas leituras
// (chamado pelo cron a cada 5 min)
// ============================================================
const evaluateAllRules = async () => {
  try {
    const latestReadings = await query(
      `SELECT DISTINCT ON (sr.sensor_id)
              sr.sensor_id, sr.value, s.type
       FROM sensor_reading sr
       JOIN sensor s ON s.id = sr.sensor_id
       WHERE s.active = true
       ORDER BY sr.sensor_id, sr.time DESC`
    );

    for (const row of latestReadings.rows) {
      await evaluateSensor(row.sensor_id, row.value);
    }
  } catch (err) {
    console.error('❌ Erro em evaluateAllRules:', err.message);
  }
};

// ============================================================
// Utilitário: avaliar condição
// ============================================================
const evaluateCondition = (value, condition, threshold) => {
  switch (condition) {
    case '>':  return value > threshold;
    case '<':  return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '=':  return value === threshold;
    default:   return false;
  }
};

module.exports = { evaluateSensor, evaluateAllRules, evaluateCondition };
