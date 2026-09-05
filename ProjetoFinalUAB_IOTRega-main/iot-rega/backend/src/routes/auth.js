// src/routes/auth.js
// Autenticação: registo e login

const express  = require('express');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validade do token de recuperação de password
const RESET_TOKEN_TTL_MIN = 30;

// ------------------------------------------------------------
// POST /api/auth/register
// ------------------------------------------------------------
router.post('/register',
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO app_user (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at`,
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ user, token });
  })
);

// ------------------------------------------------------------
// POST /api/auth/login
// ------------------------------------------------------------
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await query(
      'SELECT * FROM app_user WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token
    });
  })
);

// ------------------------------------------------------------
// GET /api/auth/me  (utilizador autenticado)
// ------------------------------------------------------------
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, name, email, role, created_at FROM app_user WHERE id = $1',
    [req.user.id]
  );
  res.json(result.rows[0]);
}));

// ------------------------------------------------------------
// POST /api/auth/change-password  (utilizador autenticado)
// ------------------------------------------------------------
router.post('/change-password',
  authenticate,
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 6 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'A nova password deve ter pelo menos 6 caracteres.' });
    }

    const { current_password, new_password } = req.body;

    const result = await query('SELECT password FROM app_user WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    const valid = await bcrypt.compare(current_password, result.rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: 'A password actual está incorrecta.' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await query('UPDATE app_user SET password = $1 WHERE id = $2', [hashed, req.user.id]);

    res.json({ message: 'Password alterada com sucesso' });
  })
);

// ------------------------------------------------------------
// POST /api/auth/forgot-password
// Gera um token de recuperação com validade limitada.
//
// NOTA: não existe serviço de email configurado neste projecto. O token é
// escrito no log do servidor e, apenas fora de produção, devolvido na
// resposta para permitir a demonstração. Em produção teria de ser enviado
// por email — devolvê-lo aqui permitiria a qualquer pessoa tomar conta de
// uma conta conhecendo apenas o endereço.
// ------------------------------------------------------------
router.post('/forgot-password',
  body('email').isEmail().normalizeEmail(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const { email } = req.body;
    const result = await query('SELECT id FROM app_user WHERE email = $1', [email]);

    // Resposta genérica: não revela se o email existe (evita enumeração de contas)
    const genericResponse = {
      message: 'Se existir uma conta com esse email, será enviado um link de recuperação.'
    };

    if (result.rows.length === 0) {
      return res.json(genericResponse);
    }

    const userId = result.rows[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await query('DELETE FROM password_reset WHERE user_id = $1', [userId]);
    await query(
      `INSERT INTO password_reset (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
      [userId, tokenHash, String(RESET_TOKEN_TTL_MIN)]
    );

    console.log(`🔑 Token de recuperação para ${email}: ${token} (válido ${RESET_TOKEN_TTL_MIN} min)`);

    if (process.env.NODE_ENV === 'production') {
      return res.json(genericResponse);
    }
    res.json({ ...genericResponse, token, dev_note: 'Token devolvido apenas fora de produção.' });
  })
);

// ------------------------------------------------------------
// POST /api/auth/reset-password
// ------------------------------------------------------------
router.post('/reset-password',
  body('token').notEmpty(),
  body('new_password').isLength({ min: 6 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'A nova password deve ter pelo menos 6 caracteres.' });
    }

    const { token, new_password } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await query(
      `SELECT user_id FROM password_reset
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido ou expirado.' });
    }

    const userId = result.rows[0].user_id;
    const hashed = await bcrypt.hash(new_password, 10);

    await query('UPDATE app_user SET password = $1 WHERE id = $2', [hashed, userId]);
    await query('DELETE FROM password_reset WHERE user_id = $1', [userId]);

    res.json({ message: 'Password redefinida com sucesso' });
  })
);

module.exports = router;
