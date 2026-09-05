// src/routes/alerts.js
const express = require('express');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// GET /api/alerts?resolved=false&limit=50
router.get('/', asyncHandler(async (req, res) => {
  const { resolved = 'false', limit = 50 } = req.query;
  const result = await query(
    `SELECT a.*, s.type AS sensor_type, s.name AS sensor_name,
            r.name AS rule_name, p.name AS plot_name
     FROM alert a
     LEFT JOIN sensor s ON s.id = a.sensor_id
     LEFT JOIN rule r ON r.id = a.rule_id
     LEFT JOIN plot p ON p.id = s.plot_id
     WHERE ($1::boolean IS NULL OR a.resolved = $1)
     ORDER BY a.created_at DESC LIMIT $2`,
    [resolved === 'true' ? true : resolved === 'false' ? false : null, parseInt(limit)]
  );
  res.json(result.rows);
}));

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE alert SET resolved = true, resolved_at = NOW()
     WHERE id = $1 RETURNING *`, [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Alerta não encontrado' });
  res.json(result.rows[0]);
}));

// GET /api/alerts/count — badge para o frontend
router.get('/count', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT severity, COUNT(*)::int AS total
     FROM alert WHERE resolved = false
     GROUP BY severity`
  );
  res.json(result.rows);
}));

module.exports = router;
