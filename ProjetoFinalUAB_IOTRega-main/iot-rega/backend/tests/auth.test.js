// Testes das rotas de autenticação (registo, login, alteração e recuperação
// de password). A base de dados é mockada — não é preciso PostgreSQL.

process.env.JWT_SECRET = 'segredo_de_teste';

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../src/config/database');
const authRoutes = require('../src/routes/auth');
const { buildApp } = require('./helpers/testApp');

const app = buildApp('/api/auth', authRoutes);

const tokenFor = (user) => jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('POST /api/auth/register', () => {
  it('cria o utilizador e devolve um token', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Ana', email: 'ana@exemplo.pt', role: 'user' }],
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@exemplo.pt', password: 'segura123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('ana@exemplo.pt');

    // a password tem de ser guardada com hash, nunca em claro
    const inserted = query.mock.calls[0][1];
    expect(inserted[2]).not.toBe('segura123');
    expect(await bcrypt.compare('segura123', inserted[2])).toBe(true);
  });

  it('rejeita passwords com menos de 6 caracteres', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@exemplo.pt', password: '123' });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  it('devolve token com credenciais válidas', async () => {
    const hash = await bcrypt.hash('admin123', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Admin', email: 'admin@iotrega.pt', password: hash, role: 'admin' }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@iotrega.pt', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    // a resposta nunca deve incluir o hash da password
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejeita password errada', async () => {
    const hash = await bcrypt.hash('admin123', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'admin@iotrega.pt', password: hash, role: 'admin' }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@iotrega.pt', password: 'errada' });

    expect(res.status).toBe(401);
  });

  it('rejeita utilizador inexistente', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@exemplo.pt', password: 'seja-o-que-for' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('exige token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejeita token expirado', async () => {
    const expired = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expirado');
  });
});

describe('POST /api/auth/change-password', () => {
  it('altera a password com a password actual correcta', async () => {
    const hash = await bcrypt.hash('antiga123', 10);
    query
      .mockResolvedValueOnce({ rows: [{ password: hash }] })  // SELECT
      .mockResolvedValueOnce({ rows: [] });                    // UPDATE

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenFor({ id: 1 })}`)
      .send({ current_password: 'antiga123', new_password: 'nova12345' });

    expect(res.status).toBe(200);

    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE app_user'));
    expect(await bcrypt.compare('nova12345', update[1][0])).toBe(true);
  });

  it('rejeita quando a password actual está errada', async () => {
    const hash = await bcrypt.hash('antiga123', 10);
    query.mockResolvedValueOnce({ rows: [{ password: hash }] });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokenFor({ id: 1 })}`)
      .send({ current_password: 'errada', new_password: 'nova12345' });

    expect(res.status).toBe(401);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE app_user'))).toBe(false);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('não revela se o email existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'desconhecido@exemplo.pt' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Se existir uma conta/);
    expect(res.body.token).toBeUndefined();
  });

  it('guarda apenas o hash do token, nunca o token em claro', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // SELECT utilizador
      .mockResolvedValueOnce({ rows: [] })            // DELETE tokens antigos
      .mockResolvedValueOnce({ rows: [] });           // INSERT

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'admin@iotrega.pt' });

    expect(res.status).toBe(200);

    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO password_reset'));
    expect(insert[1][1]).toHaveLength(64);          // SHA-256 em hexadecimal
    expect(insert[1][1]).not.toBe(res.body.token);  // guardado != token devolvido
  });
});

describe('POST /api/auth/reset-password', () => {
  it('rejeita token inválido ou expirado', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalido', new_password: 'nova12345' });

    expect(res.status).toBe(400);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE app_user'))).toBe(false);
  });

  it('redefine a password e invalida o token usado', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 1 }] })  // token válido
      .mockResolvedValueOnce({ rows: [] })                 // UPDATE password
      .mockResolvedValueOnce({ rows: [] });                // DELETE token

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), new_password: 'nova12345' });

    expect(res.status).toBe(200);
    expect(query.mock.calls.some(([sql]) => sql.includes('DELETE FROM password_reset'))).toBe(true);
  });
});
