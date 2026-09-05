// src/routes/readings.js
// Leituras de sensores (TimescaleDB time-series)

const express = require('express');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/readings?sensor_id=X&from=ISO&to=ISO&limit=100
router.get('/', asyncHandler(async (req, res) => {
  const { sensor_id, from, to, limit = 200, interval } = req.query;

  if (!sensor_id) return res.status(400).json({ error: 'sensor_id é obrigatório' });

  // Se interval definido, usa time_bucket do TimescaleDB para agregar
  if (interval) {
    const result = await query(
      `SELECT date_bin($1::interval, time, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
              AVG(value) AS avg_value,
              MIN(value) AS min_value,
              MAX(value) AS max_value,
              COUNT(*) AS reading_count
       FROM sensor_reading
       WHERE sensor_id = $2
         AND time >= COALESCE($3::timestamptz, NOW() - INTERVAL '24 hours')
         AND time <= COALESCE($4::timestamptz, NOW())
       GROUP BY bucket
       ORDER BY bucket DESC
       LIMIT $5`,
      [interval, sensor_id, from || null, to || null, parseInt(limit)]
    );
    return res.json(result.rows);
  }

  // Leituras em bruto
  const result = await query(
    `SELECT time, value
     FROM sensor_reading
     WHERE sensor_id = $1
       AND time >= COALESCE($2::timestamptz, NOW() - INTERVAL '24 hours')
       AND time <= COALESCE($3::timestamptz, NOW())
     ORDER BY time DESC
     LIMIT $4`,
    [sensor_id, from || null, to || null, parseInt(limit)]
  );

  res.json(result.rows);
}));

// GET /api/readings/latest?plot_id=X  — última leitura de cada sensor de um talhão
router.get('/latest', asyncHandler(async (req, res) => {
  const { plot_id } = req.query;
  if (!plot_id) return res.status(400).json({ error: 'plot_id é obrigatório' });

  const result = await query(
    `SELECT DISTINCT ON (s.id)
            s.id AS sensor_id, s.name, s.type, s.unit,
            sr.time, sr.value
     FROM sensor s
     LEFT JOIN sensor_reading sr ON sr.sensor_id = s.id
     WHERE s.plot_id = $1
     ORDER BY s.id, sr.time DESC NULLS LAST`,
    [plot_id]
  );
  res.json(result.rows);
}));

// GET /api/readings/stats?sensor_id=X&period=24h|7d|30d
router.get('/stats', asyncHandler(async (req, res) => {
  const { sensor_id, period = '24h' } = req.query;
  const periodMap = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
  const interval = periodMap[period] || '24 hours';

  const result = await query(
    `SELECT
       COUNT(*)::int AS total_readings,
       AVG(value)    AS avg_value,
       MIN(value)    AS min_value,
       MAX(value)    AS max_value,
       STDDEV(value) AS stddev_value,
       MIN(time)     AS first_reading,
       MAX(time)     AS last_reading
     FROM sensor_reading
     WHERE sensor_id = $1
       AND time >= NOW() - $2::interval`,
    [sensor_id, interval]
  );
  res.json(result.rows[0]);
}));

// POST /api/readings — ingestão manual (ou via webhook)
router.post('/', asyncHandler(async (req, res) => {
  const { sensor_id, value, time } = req.body;

  if (!sensor_id || value === undefined) {
    return res.status(400).json({ error: 'sensor_id e value são obrigatórios' });
  }

  await query(
    `INSERT INTO sensor_reading (time, sensor_id, value)
     VALUES (COALESCE($1::timestamptz, NOW()), $2, $3)`,
    [time || null, sensor_id, value]
  );

  res.status(201).json({ message: 'Leitura registada', sensor_id, value });
}));

// POST /api/readings/bulk — ingestão em lote
router.post('/bulk', asyncHandler(async (req, res) => {
  const { readings } = req.body; // [{sensor_id, value, time}, ...]

  if (!Array.isArray(readings) || !readings.length) {
    return res.status(400).json({ error: 'Array de leituras é obrigatório' });
  }

  // Construir INSERT em lote
  const values = [];
  const params = [];
  readings.forEach((r, i) => {
    const base = i * 3;
    params.push(r.time || new Date(), r.sensor_id, r.value);
    values.push(`($${base+1}, $${base+2}, $${base+3})`);
  });

  await query(
    `INSERT INTO sensor_reading (time, sensor_id, value) VALUES ${values.join(',')}
     ON CONFLICT DO NOTHING`,
    params
  );

  res.status(201).json({ message: `${readings.length} leituras inseridas` });
}));

module.exports = router;
