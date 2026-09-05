// Constrói uma app Express mínima para testes, sem arrancar o servidor nem
// os cron jobs do src/app.js.

const express = require('express');
const { errorHandler } = require('../../src/middleware/errorHandler');

const buildApp = (mountPath, router) => {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  app.use(errorHandler);
  return app;
};

module.exports = { buildApp };
