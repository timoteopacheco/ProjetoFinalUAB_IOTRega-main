// src/routes/costs.js
const express = require('express');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// GET /api/costs?plot_id=X&year=2024
router.get('/', asyncHandler(async (req, res) => {
  const { plot_id, year } = req.query;
  const params = [req.user.id];
  let filter = '';
  if (plot_id) { filter += ` AND c.plot_id = $${params.length+1}`; params.push(plot_id); }
  if (year)    { filter += ` AND EXTRACT(YEAR FROM c.date) = $${params.length+1}`; params.push(year); }

  const result = await query(
    `SELECT c.*, p.name AS plot_name
     FROM cost_record c
     JOIN plot p ON p.id = c.plot_id
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE uf.user_id = $1 ${filter}
     ORDER BY c.date DESC`, params
  );
  res.json(result.rows);
}));

// GET /api/costs/summary?farm_id=X  — resumo por categoria/mês
router.get('/summary', asyncHandler(async (req, res) => {
  const { farm_id } = req.query;
  const result = await query(
    `SELECT
       TO_CHAR(c.date,'YYYY-MM') AS month,
       c.category,
       SUM(c.amount) AS total,
       COUNT(*) AS records
     FROM cost_record c
     JOIN plot p ON p.id = c.plot_id
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE p.farm_id = $1 AND uf.user_id = $2
     GROUP BY month, c.category
     ORDER BY month DESC`, [farm_id, req.user.id]
  );
  res.json(result.rows);
}));

// Confirma que o talhão pertence a uma exploração do utilizador autenticado
const userOwnsPlot = async (plotId, userId) => {
  const result = await query(
    `SELECT 1 FROM plot p
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE p.id = $1 AND uf.user_id = $2`,
    [plotId, userId]
  );
  return result.rowCount > 0;
};

router.post('/', asyncHandler(async (req, res) => {
  const { plot_id, description, amount, date, category } = req.body;

  if (!plot_id) {
    return res.status(400).json({ error: 'É necessário indicar o talhão.' });
  }
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount)) {
    return res.status(400).json({ error: 'O valor do custo tem de ser numérico.' });
  }
  if (!date) {
    return res.status(400).json({ error: 'É necessário indicar a data.' });
  }
  if (!(await userOwnsPlot(plot_id, req.user.id))) {
    return res.status(404).json({ error: 'Talhão não encontrado ou sem acesso à exploração.' });
  }

  const result = await query(
    `INSERT INTO cost_record (plot_id, description, amount, date, category)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [plot_id, description || null, parsedAmount, date, category || 'water']
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /api/costs/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { description, amount, date, category } = req.body;

  let parsedAmount = null;
  if (amount !== undefined && amount !== null && amount !== '') {
    parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      return res.status(400).json({ error: 'O valor do custo tem de ser numérico.' });
    }
  }

  const result = await query(
    `UPDATE cost_record c SET
       description = COALESCE($1, c.description),
       amount      = COALESCE($2, c.amount),
       date        = COALESCE($3::date, c.date),
       category    = COALESCE($4, c.category)
     FROM plot p
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE c.id = $5 AND p.id = c.plot_id AND uf.user_id = $6
     RETURNING c.*`,
    [description ?? null, parsedAmount, date || null, category || null,
     req.params.id, req.user.id]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Registo não encontrado ou sem acesso.' });
  }
  res.json(result.rows[0]);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query(
    `DELETE FROM cost_record c
     USING plot p, user_farm uf
     WHERE c.id = $1
       AND p.id = c.plot_id
       AND uf.farm_id = p.farm_id
       AND uf.user_id = $2
     RETURNING c.id`,
    [req.params.id, req.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Registo não encontrado ou sem acesso.' });
  }
  res.json({ message: 'Registo eliminado' });
}));

module.exports = router;
