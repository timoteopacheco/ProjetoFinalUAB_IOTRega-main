// src/routes/weather.js
const express = require('express');
const { query } = require('../config/database');
const weatherService = require('../services/weatherService');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// GET /api/weather?plot_id=X&from=&to=
router.get('/', asyncHandler(async (req, res) => {
  const { plot_id, from, to } = req.query;
  if (!plot_id) return res.status(400).json({ error: 'plot_id é obrigatório' });

  const result = await query(
    `SELECT * FROM weather_data
     WHERE plot_id = $1
       AND time >= COALESCE($2::timestamptz, NOW() - INTERVAL '24 hours')
       AND time <= COALESCE($3::timestamptz, NOW())
     ORDER BY time DESC LIMIT 200`,
    [plot_id, from || null, to || null]
  );
  res.json(result.rows);
}));

// GET /api/weather/forecast?plot_id=X
router.get('/forecast', asyncHandler(async (req, res) => {
  const { plot_id } = req.query;
  if (!plot_id) return res.status(400).json({ error: 'plot_id é obrigatório' });
  const forecast = await weatherService.getForecast(plot_id);
  res.json(forecast);
}));

// POST /api/weather/refresh?plot_id=X  — actualizar agora
router.post('/refresh', asyncHandler(async (req, res) => {
  const { plot_id } = req.query;
  const plotResult = await query(
    `SELECT id,
            ST_Y(ST_Centroid(geometry)) AS latitude,
            ST_X(ST_Centroid(geometry)) AS longitude
     FROM plot WHERE id = $1`, [plot_id]
  );
  if (!plotResult.rows.length) return res.status(404).json({ error: 'Plot não encontrado' });
  const p = plotResult.rows[0];
  await weatherService.fetchForPlot(p.id, p.latitude, p.longitude);
  res.json({ message: 'Dados climáticos actualizados' });
}));

module.exports = router;
