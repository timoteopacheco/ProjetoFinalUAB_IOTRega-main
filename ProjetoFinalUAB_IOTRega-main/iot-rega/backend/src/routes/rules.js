// src/routes/rules.js
const express = require('express');
const { body } = require('express-validator');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM rule ORDER BY sensor_type, threshold');
  res.json(result.rows);
}));

router.post('/',
  body('sensor_type').notEmpty(),
  body('threshold').isFloat(),
  body('condition').isIn(['>','<','=','>=','<=']),
  asyncHandler(async (req, res) => {
    const { name, sensor_type, threshold, condition, severity } = req.body;
    const result = await query(
      `INSERT INTO rule (name, sensor_type, threshold, condition, severity)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name || null, sensor_type, threshold, condition, severity || 'warning']
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, threshold, condition, severity, active } = req.body;
  const result = await query(
    `UPDATE rule SET
       name      = COALESCE($1, name),
       threshold = COALESCE($2, threshold),
       condition = COALESCE($3, condition),
       severity  = COALESCE($4, severity),
       active    = COALESCE($5, active)
     WHERE id = $6 RETURNING *`,
    [name, threshold, condition, severity, active, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Regra não encontrada' });
  res.json(result.rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await query('DELETE FROM rule WHERE id = $1', [req.params.id]);
  res.json({ message: 'Regra eliminada' });
}));

module.exports = router;
