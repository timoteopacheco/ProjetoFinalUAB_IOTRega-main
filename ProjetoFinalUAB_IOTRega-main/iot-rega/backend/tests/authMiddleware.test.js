// Testes do middleware de autenticação JWT e da verificação de administrador.

process.env.JWT_SECRET = 'segredo_de_teste';

const express = require('express');
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const { authenticate, requireAdmin } = require('../src/middleware/auth');

const app = express();
app.get('/protegido', authenticate, (req, res) => res.json({ user: req.user }));
app.get('/admin', authenticate, requireAdmin, (req, res) => res.json({ ok: true }));

const tokenFor = (payload, options = { expiresIn: '1h' }) =>
  jwt.sign(payload, process.env.JWT_SECRET, options);

describe('authenticate', () => {
  it('rejeita pedidos sem cabeçalho Authorization', async () => {
    const res = await request(app).get('/protegido');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token de autenticação em falta');
  });

  it('rejeita cabeçalhos que não usem o esquema Bearer', async () => {
    const res = await request(app)
      .get('/protegido')
      .set('Authorization', `Basic ${tokenFor({ id: 1 })}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token de autenticação em falta');
  });

  it('rejeita um token adulterado', async () => {
    const res = await request(app)
      .get('/protegido')
      .set('Authorization', 'Bearer nao-e-um-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token inválido');
  });

  it('rejeita um token assinado com outro segredo', async () => {
    const alheio = jwt.sign({ id: 1 }, 'outro_segredo');

    const res = await request(app).get('/protegido').set('Authorization', `Bearer ${alheio}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token inválido');
  });

  it('distingue token expirado de token inválido', async () => {
    const expirado = tokenFor({ id: 1 }, { expiresIn: '-1s' });

    const res = await request(app).get('/protegido').set('Authorization', `Bearer ${expirado}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expirado');
  });

  it('deixa passar um token válido e preenche req.user', async () => {
    const res = await request(app)
      .get('/protegido')
      .set('Authorization', `Bearer ${tokenFor({ id: 42, role: 'user' })}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 42, role: 'user' });
  });
});

describe('requireAdmin', () => {
  it('permite o acesso a administradores', async () => {
    const res = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${tokenFor({ id: 1, role: 'admin' })}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('bloqueia utilizadores sem papel de administrador', async () => {
    const res = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${tokenFor({ id: 1, role: 'user' })}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Acesso restrito a administradores');
  });

  it('bloqueia tokens sem papel definido', async () => {
    const res = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${tokenFor({ id: 1 })}`);

    expect(res.status).toBe(403);
  });
});
