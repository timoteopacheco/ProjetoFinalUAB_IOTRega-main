// src/routes/sensors.js
// CRUD de Sensores IoT

const express = require('express');
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const SENSOR_TYPES = ['humidity','temperature','soil_moisture','rainfall','wind_speed'];

// GET /api/sensors?plot_id=X
router.get('/', asyncHandler(async (req, res) => {
  const { plot_id } = req.query;
  const params = [req.user.id];
  let filter = '';
  if (plot_id) { filter = 'AND s.plot_id = $2'; params.push(plot_id); }

  const result = await query(
    `SELECT s.*,
            p.name AS plot_name,
            (SELECT value FROM sensor_reading
             WHERE sensor_id = s.id ORDER BY time DESC LIMIT 1) AS last_value,
            (SELECT time FROM sensor_reading
             WHERE sensor_id = s.id ORDER BY time DESC LIMIT 1) AS last_reading_at
     FROM sensor s
     JOIN plot p ON p.id = s.plot_id
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE uf.user_id = $1 ${filter}
     ORDER BY s.type, s.name`,
    params
  );
  res.json(result.rows);
}));

// GET /api/sensors/:id
router.get('/:id', param('id').isInt(), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT s.*, p.name AS plot_name
     FROM sensor s
     JOIN plot p ON p.id = s.plot_id
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE s.id = $1 AND uf.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Sensor não encontrado' });
  res.json(result.rows[0]);
}));

// POST /api/sensors
router.post('/',
  body('plot_id').isInt(),
  body('type').isIn(SENSOR_TYPES),
  body('name').notEmpty().trim(),
  asyncHandler(async (req, res) => {
    const { plot_id, name, type, unit, device_id, latitude, longitude } = req.body;

    const result = await query(
      `INSERT INTO sensor (plot_id, name, type, unit, device_id, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [plot_id, name, type, unit || null, device_id || null,
       latitude || null, longitude || null]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /api/sensors/:id
router.put('/:id', param('id').isInt(), asyncHandler(async (req, res) => {
  const { name, unit, active, latitude, longitude } = req.body;

  const result = await query(
    `UPDATE sensor SET
       name      = COALESCE($1, name),
       unit      = COALESCE($2, unit),
       active    = COALESCE($3, active),
       latitude  = COALESCE($4, latitude),
       longitude = COALESCE($5, longitude)
     WHERE id = $6 RETURNING *`,
    [name, unit, active, latitude, longitude, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Sensor não encontrado' });
  res.json(result.rows[0]);
}));

// DELETE /api/sensors/:id
router.delete('/:id', param('id').isInt(), asyncHandler(async (req, res) => {
  await query('DELETE FROM sensor WHERE id = $1', [req.params.id]);
  res.json({ message: 'Sensor eliminado' });
}));

module.exports = router;
