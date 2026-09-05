// src/routes/farms.js
// CRUD de Explorações Agrícolas (Farms)

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/farms — listar todas as explorações do utilizador
router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT f.*, ST_AsGeoJSON(f.location) AS location_geojson,
            COUNT(DISTINCT p.id) AS plot_count, 
            ST_Y(f.location::geometry) AS latitude,
            ST_X(f.location::geometry) AS longitude
     FROM farm f
     JOIN user_farm uf ON uf.farm_id = f.id
     LEFT JOIN plot p ON p.farm_id = f.id
     WHERE uf.user_id = $1
     GROUP BY f.id
     ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
}));

// GET /api/farms/:id — detalhe de uma exploração
router.get('/:id',
  param('id').isInt(),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT f.*,
              ST_AsGeoJSON(f.location) AS location_geojson
       FROM farm f
       JOIN user_farm uf ON uf.farm_id = f.id
       WHERE f.id = $1 AND uf.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Exploração não encontrada' });
    }
    res.json(result.rows[0]);
  })
);

// POST /api/farms — criar nova exploração
router.post('/',
  body('name').notEmpty().trim(),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, latitude, longitude } = req.body;

    // Inserir farm e associar utilizador (transação)
    const client = await require('../config/database').pool.connect();
    try {
      await client.query('BEGIN');

      const farmResult = await client.query(
        `INSERT INTO farm (name, description, location)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
         RETURNING id, name, description, created_at`,
        [name, description || null, longitude, latitude]
      );
      const farm = farmResult.rows[0];

      await client.query(
        `INSERT INTO user_farm (user_id, farm_id, role) VALUES ($1, $2, 'owner')`,
        [req.user.id, farm.id]
      );

      await client.query('COMMIT');
      res.status(201).json(farm);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// PUT /api/farms/:id — actualizar exploração
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const {
    name,
    description,
    latitude,
    longitude,
  } = req.body;

  if (!name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'Nome, latitude e longitude são obrigatórios.',
    });
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: 'Latitude e longitude devem ser números válidos.',
    });
  }

  const result = await query(
    `
    UPDATE farm f
    SET
      name = $1,
      description = $2,
      location = ST_SetSRID(
        ST_MakePoint(
          $4::double precision,
          $3::double precision
        ),
        4326
      )::geography
    WHERE f.id = $5
      AND EXISTS (
        SELECT 1
        FROM user_farm uf
        WHERE uf.farm_id = f.id
          AND uf.user_id = $6
      )
    RETURNING
      f.id,
      f.name,
      f.description,
      ST_Y(f.location::geometry) AS latitude,
      ST_X(f.location::geometry) AS longitude
    `,
    [
      name,
      description || null,
      lat,
      lng,
      id,
      req.user.id,
    ]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: 'Exploração não encontrada.',
    });
  }

  res.json(result.rows[0]);
}));

// DELETE /api/farms/:id
router.delete('/:id',
  param('id').isInt(),
  asyncHandler(async (req, res) => {
    const result = await query(
      `DELETE FROM farm WHERE id = $1
         AND id IN (SELECT farm_id FROM user_farm WHERE user_id = $2 AND role = 'owner')
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Não encontrado ou sem permissão' });
    res.json({ message: 'Exploração eliminada', id: result.rows[0].id });
  })
);

module.exports = router;
