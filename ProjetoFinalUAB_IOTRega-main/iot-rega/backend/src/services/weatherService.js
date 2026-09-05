// src/services/weatherService.js
// Integração com Open-Meteo API (gratuita, sem chave)
// Docs: https://open-meteo.com/en/docs

const axios  = require('axios');
const { query } = require('../config/database');

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

// ============================================================
// Buscar dados climáticos para um plot específico
// ============================================================
const fetchForPlot = async (plot_id, latitude, longitude) => {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        latitude,
        longitude,
        hourly: 'temperature_2m,relativehumidity_2m,precipitation,windspeed_10m',
        daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        forecast_days: 7,
        timezone: 'Europe/Lisbon',
      },
      timeout: 10000,
    });

    const { hourly, daily } = response.data;

    // --- Inserir dados horários actuais (últimas 24h)
    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);

    for (let i = 0; i < hourly.time.length; i++) {
      const t = new Date(hourly.time[i]);
      if (t < yesterday || t > now) continue;

      await query(
        `INSERT INTO weather_data (plot_id, time, temperature, humidity, rainfall, wind_speed)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [
          plot_id,
          hourly.time[i],
          hourly.temperature_2m[i],
          hourly.relativehumidity_2m[i],
          hourly.precipitation[i],
          hourly.windspeed_10m[i],
        ]
      );
    }

    // --- Inserir previsão diária (7 dias)
    for (let i = 0; i < daily.time.length; i++) {
      await query(
        `INSERT INTO weather_forecast
           (plot_id, forecast_time, temperature, rainfall, probability_rain)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [
          plot_id,
          daily.time[i],
          daily.temperature_2m_max[i],
          daily.precipitation_sum[i],
          (daily.precipitation_probability_max[i] || 0) / 100,
        ]
      );
    }

    console.log(`☁️  Dados climáticos actualizados para plot ${plot_id}`);
    return true;

  } catch (err) {
    console.error(`❌ Erro ao buscar clima para plot ${plot_id}:`, err.message);
    return false;
  }
};

// ============================================================
// Buscar dados para todos os plots com localização definida
// ============================================================
const fetchAllPlots = async () => {
  try {
    // Usa a posição definida no talhão; se não existir, cai no centróide do polígono.
    const result = await query(
      `SELECT p.id,
              ST_Y(COALESCE(p.position::geometry, ST_Centroid(p.geometry))) AS latitude,
              ST_X(COALESCE(p.position::geometry, ST_Centroid(p.geometry))) AS longitude
       FROM plot p
       WHERE p.position IS NOT NULL OR p.geometry IS NOT NULL`
    );

    for (const plot of result.rows) {
      await fetchForPlot(plot.id, plot.latitude, plot.longitude);
      // Pequena pausa para não sobrecarregar a API
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    console.error('❌ Erro em fetchAllPlots:', err.message);
  }
};

// ============================================================
// Obter previsão actual para um plot
// ============================================================
const getForecast = async (plot_id) => {
  const result = await query(
    `SELECT DISTINCT ON (forecast_time::date)
            id,
            plot_id,
            forecast_time,
            temperature,
            rainfall,
            probability_rain
     FROM weather_forecast
     WHERE plot_id = $1
       AND forecast_time >= CURRENT_DATE
     ORDER BY forecast_time::date ASC, forecast_time DESC
     LIMIT 7`,
    [plot_id]
  );

  return result.rows;
};

module.exports = { fetchForPlot, fetchAllPlots, getForecast };
