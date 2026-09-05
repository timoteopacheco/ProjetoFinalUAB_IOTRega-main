// src/routes/plots.js
// CRUD de Talhões com suporte GeoJSON (PostGIS)

const express = require('express');
const { body, param } = require('express-validator');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

const VALID_CROP_TYPES = ['vinha', 'olival', 'pomar', 'hortícolas', 'outro'];

// GET /api/plots?farm_id=X
router.get('/', asyncHandler(async (req, res) => {
  const { farm_id } = req.query;

  let sql = `
    SELECT p.*,
           ST_AsGeoJSON(p.geometry)::json AS geojson,
           ST_AsGeoJSON(p.position)::json AS position,
           COUNT(DISTINCT s.id) AS sensor_count
    FROM plot p
    JOIN farm f ON f.id = p.farm_id
    JOIN user_farm uf ON uf.farm_id = f.id
    LEFT JOIN sensor s ON s.plot_id = p.id
    WHERE uf.user_id = $1
  `;
  const params = [req.user.id];

  if (farm_id) {
    sql += ` AND p.farm_id = $2`;
    params.push(farm_id);
  }

  sql += ` GROUP BY p.id ORDER BY p.name`;

  const result = await query(sql, params);
  res.json(result.rows);
}));

// GET /api/plots/geojson?farm_id=X  (FeatureCollection para Leaflet)
router.get('/geojson', asyncHandler(async (req, res) => {
  const { farm_id } = req.query;
  const params = [req.user.id];
  let farmFilter = '';
  if (farm_id) { farmFilter = 'AND p.farm_id = $2'; params.push(farm_id); }

  const result = await query(
    `SELECT json_build_object(
       'type', 'FeatureCollection',
       'features', json_agg(
         json_build_object(
           'type', 'Feature',
           'geometry', ST_AsGeoJSON(p.geometry)::json,
           'properties', json_build_object(
             'id', p.id, 'name', p.name,
             'area', p.area, 'crop_type', p.crop_type,
             'farm_id', p.farm_id
           )
         )
       )
     ) AS geojson
     FROM plot p
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE uf.user_id = $1 ${farmFilter}`,
    params
  );

  res.json(result.rows[0]?.geojson || { type: 'FeatureCollection', features: [] });
}));

// GET /api/plots/:id
router.get('/:id', param('id').isInt(), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT p.*, ST_AsGeoJSON(p.geometry)::json AS geojson
     FROM plot p
     JOIN user_farm uf ON uf.farm_id = p.farm_id
     WHERE p.id = $1 AND uf.user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Talhão não encontrado' });
  res.json(result.rows[0]);
}));

// POST /api/plots
router.post('/',
  body('farm_id').isInt(),
  body('name').notEmpty().trim(),
  body('geojson').notEmpty(), // GeoJSON polygon do Leaflet
  asyncHandler(async (req, res) => {
    const { farm_id, name, area, crop_type, geojson, position } = req.body;

    // Sem posição explícita, usa-se o centróide do polígono do talhão.
    const result = await query(
      `INSERT INTO plot (farm_id, name, area, crop_type, geometry, position)
       VALUES ($1, $2, $3, $4,
               ST_SetSRID(ST_GeomFromGeoJSON($5), 4326),
               COALESCE(
                 ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)::geography,
                 ST_SetSRID(ST_Centroid(ST_GeomFromGeoJSON($5)), 4326)::geography
               ))
       RETURNING id, farm_id, name, area, crop_type, created_at,
                 ST_AsGeoJSON(position)::json AS position`,
      [farm_id, name, area || null, crop_type || 'vinha',
       JSON.stringify(geojson), position ? JSON.stringify(position) : null]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /api/plots/:id
// Actualiza um talhão. A geometria e a posição só são alteradas se vierem
// no corpo do pedido; caso contrário mantêm-se os valores existentes.
router.put('/:id', param('id').isInt(), asyncHandler(async (req, res) => {
  const { name, area, crop_type, geojson, position } = req.body;

  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'O nome do talhão é obrigatório.' });
  }

  if (crop_type && !VALID_CROP_TYPES.includes(crop_type)) {
    return res.status(400).json({ error: 'Tipo de cultura inválido.' });
  }

  let parsedArea = null;
  if (area !== undefined && area !== null && area !== '') {
    parsedArea = Number(area);
    if (Number.isNaN(parsedArea) || parsedArea < 0) {
      return res.status(400).json({ error: 'A área deve ser um número positivo.' });
    }
  }

  const result = await query(
    `UPDATE plot p SET
       name      = COALESCE($1, p.name),
       area      = COALESCE($2, p.area),
       crop_type = COALESCE($3, p.crop_type),
       geometry  = CASE WHEN $4::text IS NOT NULL
                   THEN ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)
                   ELSE p.geometry END,
       position  = CASE WHEN $5::text IS NOT NULL
                   THEN ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)::geography
                   ELSE p.position END
     FROM farm f
     JOIN user_farm uf ON uf.farm_id = f.id
     WHERE p.id = $6
       AND p.farm_id = f.id
       AND uf.user_id = $7
     RETURNING p.id, p.farm_id, p.name, p.area, p.crop_type,
               ST_AsGeoJSON(p.geometry)::json AS geojson,
               ST_AsGeoJSON(p.position)::json AS position`,
    [
      name !== undefined ? String(name).trim() : null,
      parsedArea,
      crop_type || null,
      geojson ? JSON.stringify(geojson) : null,
      position ? JSON.stringify(position) : null,
      req.params.id,
      req.user.id,
    ]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Talhão não encontrado ou sem acesso à exploração.' });
  }
  res.json(result.rows[0]);
}));

// DELETE /api/plots/:id
router.delete(
  '/:id',
  param('id').isInt(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await query(
      `
      DELETE FROM plot p
      USING farm f
      JOIN user_farm uf
        ON uf.farm_id = f.id
      WHERE p.id = $1
        AND p.farm_id = f.id
        AND uf.user_id = $2
      RETURNING p.id
      `,
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Talhão não encontrado ou sem acesso à exploração.'
      });
    }

    res.json({
      message: 'Talhão eliminado'
      
    });
  })
);

module.exports = router;
