// src/app.js
// Ponto de entrada da aplicação IoT Rega Backend

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const morgan   = require('morgan');
const cron     = require('node-cron');

// Rotas
const authRoutes     = require('./routes/auth');
const farmRoutes     = require('./routes/farms');
const plotRoutes     = require('./routes/plots');
const sensorRoutes   = require('./routes/sensors');
const readingRoutes  = require('./routes/readings');
const weatherRoutes  = require('./routes/weather');
const alertRoutes    = require('./routes/alerts');
const ruleRoutes     = require('./routes/rules');
const costRoutes     = require('./routes/costs');
const dashRoutes     = require('./routes/dashboard');

// Serviços
//const mqttService      = require('./services/mqttService');
const weatherService   = require('./services/weatherService');
const alertService     = require('./services/alertService');

// Middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate }  = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE GLOBAL
// ============================================================
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ============================================================
// ROTAS PÚBLICAS (sem autenticação)
// ============================================================
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'IoT Rega API'
  });
});

// ============================================================
// ROTAS PROTEGIDAS (requerem JWT)
// ============================================================
app.use('/api/farms',    authenticate, farmRoutes);
app.use('/api/plots',    authenticate, plotRoutes);
app.use('/api/sensors',  authenticate, sensorRoutes);
app.use('/api/readings', authenticate, readingRoutes);
app.use('/api/weather',  authenticate, weatherRoutes);
app.use('/api/alerts',   authenticate, alertRoutes);
app.use('/api/rules',    authenticate, ruleRoutes);
app.use('/api/costs',    authenticate, costRoutes);
app.use('/api/dashboard',authenticate, dashRoutes);

// ============================================================
// ERRO 404
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ============================================================
// HANDLER DE ERROS GLOBAL
// ============================================================
app.use(errorHandler);

// ============================================================
// ARRANQUE DO SERVIDOR
// ============================================================
app.listen(PORT, async () => {
  console.log(`\n🌿 IoT Rega Backend`);
  console.log(`🚀 Servidor a correr em http://localhost:${PORT}`);
  console.log(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}\n`);

  // Iniciar serviço MQTT
  //mqttService.connect();

  // Cron: buscar dados climáticos a cada hora
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Cron: A actualizar dados climáticos...');
    await weatherService.fetchAllPlots();
  });

  // Cron: avaliar regras de alerta a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    await alertService.evaluateAllRules();
  });
});

module.exports = app;
