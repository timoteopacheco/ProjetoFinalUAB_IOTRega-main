// Constrói uma app Express mínima para testes, sem arrancar o servidor nem
// os cron jobs do src/app.js.
//
// O terceiro argumento (opcional) injecta um req.user, substituindo o
// middleware de autenticação nas rotas protegidas.

const express = require('express');
const { errorHandler } = require('../../src/middleware/errorHandler');

const buildApp = (mountPath, router, user) => {
  const app = express();
  app.use(express.json());
  if (user) {
    app.use((req, res, next) => {
      req.user = user;
      next();
    });
  }
  app.use(mountPath, router);
  app.use(errorHandler);
  return app;
};

module.exports = { buildApp };
