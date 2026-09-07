// Testes do handler global de erros e do wrapper asyncHandler.

const express = require('express');
const request = require('supertest');
const { errorHandler, asyncHandler } = require('../src/middleware/errorHandler');

// App de teste: o erro devolvido é controlado pelo corpo do pedido.
const buildErrorApp = () => {
  const app = express();
  app.use(express.json());

  app.post('/falha', asyncHandler(async (req) => {
    const err = new Error(req.body.message || 'boom');
    if (req.body.code)   err.code   = req.body.code;
    if (req.body.status) err.status = req.body.status;
    if (req.body.detail) err.detail = req.body.detail;
    throw err;
  }));

  app.post('/falha-sincrona', () => {
    const err = new Error('erro sincrono');
    err.statusCode = 418;
    throw err;
  });

  app.get('/ok', asyncHandler(async (req, res) => res.json({ ok: true })));

  app.use(errorHandler);
  return app;
};

const app = buildErrorApp();

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('errorHandler', () => {
  it('traduz violação de unicidade (23505) para 409', async () => {
    const res = await request(app)
      .post('/falha')
      .send({ code: '23505', detail: 'Key (email) already exists' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Registo duplicado');
    expect(res.body.detail).toBe('Key (email) already exists');
  });

  it('traduz chave estrangeira inválida (23503) para 400', async () => {
    const res = await request(app).post('/falha').send({ code: '23503' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Referência inválida');
  });

  it('traduz violação de check constraint (23514) para 400', async () => {
    const res = await request(app).post('/falha').send({ code: '23514' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Valor fora do intervalo permitido');
  });

  it('respeita o status definido no erro', async () => {
    const res = await request(app)
      .post('/falha')
      .send({ status: 403, message: 'Sem permissao' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Sem permissao');
  });

  it('aceita statusCode como alternativa a status', async () => {
    const res = await request(app).post('/falha-sincrona');

    expect(res.status).toBe(418);
    expect(res.body.error).toBe('erro sincrono');
  });

  it('devolve 500 para erros sem status', async () => {
    const res = await request(app).post('/falha').send({ message: 'rebentou' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('rebentou');
  });

  it('não expõe o stack trace fora de desenvolvimento', async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const res = await request(app).post('/falha').send({ message: 'rebentou' });
    expect(res.body.stack).toBeUndefined();

    process.env.NODE_ENV = anterior;
  });

  it('inclui o stack trace em desenvolvimento', async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const res = await request(app).post('/falha').send({ message: 'rebentou' });
    expect(res.body.stack).toEqual(expect.any(String));

    process.env.NODE_ENV = anterior;
  });
});

describe('asyncHandler', () => {
  it('encaminha rejeições em vez de deixar a promessa pendente', async () => {
    const res = await request(app).post('/falha').send({ message: 'assincrono' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('assincrono');
  });

  it('não interfere com respostas bem sucedidas', async () => {
    const res = await request(app).get('/ok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('chama next com o erro lançado', async () => {
    const next = jest.fn();
    const boom = new Error('falhou');

    await asyncHandler(async () => { throw boom; })({}, {}, next);

    expect(next).toHaveBeenCalledWith(boom);
  });

  it('não chama next quando o handler resolve', async () => {
    const next = jest.fn();

    await asyncHandler(async () => 'feito')({}, {}, next);

    expect(next).not.toHaveBeenCalled();
  });
});
