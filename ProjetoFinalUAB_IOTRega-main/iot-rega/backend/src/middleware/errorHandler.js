// src/middleware/errorHandler.js

const errorHandler = (err, req, res, next) => {
  console.error('❌ Erro:', err.message);

  // Erro de validação da base de dados (constraint violation)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Registo duplicado', detail: err.detail });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referência inválida', detail: err.detail });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Valor fora do intervalo permitido', detail: err.detail });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Wrapper para async route handlers (evita try/catch repetitivo)
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
