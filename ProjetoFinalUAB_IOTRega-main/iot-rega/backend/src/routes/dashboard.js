// src/routes/dashboard.js
// Dados agregados para o dashboard principal

const express = require('express');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// GET /api/dashboard/summary?farm_id=X
// Retorna tudo o que o dashboard precisa numa só chamada
router.get('/summary', asyncHandler(async (req, res) => {
  const { farm_id } = req.query;
  if (!farm_id) return res.status(400).json({ error: 'farm_id é obrigatório' });

  const [
    plots,
    sensors,
    alerts,
    recentReadings,
    costSummary,
    weatherLatest,
  ] = await Promise.all([

    // Talhões da exploração
    query(`SELECT id, name, area, crop_type FROM plot WHERE farm_id = $1`, [farm_id]),

    // Contagem de sensores activos
    query(
      `SELECT COUNT(*) FILTER (WHERE s.active) AS active,
              COUNT(*) AS total
       FROM sensor s JOIN plot p ON p.id = s.plot_id
       WHERE p.farm_id = $1`, [farm_id]
    ),

    // Alertas não resolvidos
    query(
      `SELECT a.severity, COUNT(*)::int AS total
       FROM alert a
       JOIN sensor s ON s.id = a.sensor_id
       JOIN plot p ON p.id = s.plot_id
       WHERE p.farm_id = $1 AND a.resolved = false
       GROUP BY a.severity`, [farm_id]
    ),

    // Últimas leituras por sensor
    query(
      `SELECT DISTINCT ON (s.id)
              s.id, s.name, s.type, s.unit,
              sr.value, sr.time
       FROM sensor s
       JOIN plot p ON p.id = s.plot_id
       LEFT JOIN sensor_reading sr ON sr.sensor_id = s.id
       WHERE p.farm_id = $1 AND s.active = true
       ORDER BY s.id, sr.time DESC NULLS LAST`, [farm_id]
    ),

    // Custo total do mês actual
    query(
      `SELECT COALESCE(SUM(c.amount), 0) AS month_total
       FROM cost_record c
       JOIN plot p ON p.id = c.plot_id
       WHERE p.farm_id = $1
         AND DATE_TRUNC('month', c.date) = DATE_TRUNC('month', CURRENT_DATE)`,
      [farm_id]
    ),

    // Clima mais recente (primeiro talhão com dados)
    query(
      `SELECT wd.temperature, wd.humidity, wd.rainfall, wd.wind_speed, wd.time
       FROM weather_data wd
       JOIN plot p ON p.id = wd.plot_id
       WHERE p.farm_id = $1
       ORDER BY wd.time DESC LIMIT 1`, [farm_id]
    ),
  ]);

  res.json({
    plots:          plots.rows,
    sensors:        sensors.rows[0],
    alerts:         alerts.rows,
    latestReadings: recentReadings.rows,
    costThisMonth:  parseFloat(costSummary.rows[0]?.month_total || 0),
    weather:        weatherLatest.rows[0] || null,
  });
}));

// GET /api/dashboard/chart?sensor_id=X&period=24h|7d|30d
router.get('/chart', asyncHandler(async (req, res) => {
  const { sensor_id, period = '24h' } = req.query;
  const bucketMap = { '24h': '1 hour', '7d': '6 hours', '30d': '1 day' };
  const rangeMap  = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

  const result = await query(
    `SELECT
       date_bin($1::interval, time, TIMESTAMPTZ '2000-01-01 00:00:00+00') AS bucket,
       AVG(value)::numeric(10,2)       AS avg,
       MIN(value)::numeric(10,2)       AS min,
       MAX(value)::numeric(10,2)       AS max
     FROM sensor_reading
     WHERE sensor_id = $2
       AND time >= NOW() - $3::interval
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [bucketMap[period], sensor_id, rangeMap[period]]
  );

  res.json(result.rows);
}));

module.exports = router;
