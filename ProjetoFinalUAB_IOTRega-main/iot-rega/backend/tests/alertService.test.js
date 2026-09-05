// Testes do motor de regras de alerta.
// A base de dados é substituída por um mock — não é preciso PostgreSQL.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const { query } = require('../src/config/database');
const { evaluateCondition, evaluateSensor } = require('../src/services/alertService');

describe('evaluateCondition', () => {
  it('avalia correctamente cada operador', () => {
    expect(evaluateCondition(30, '>', 25)).toBe(true);
    expect(evaluateCondition(20, '>', 25)).toBe(false);
    expect(evaluateCondition(15, '<', 20)).toBe(true);
    expect(evaluateCondition(25, '>=', 25)).toBe(true);
    expect(evaluateCondition(25, '<=', 25)).toBe(true);
    expect(evaluateCondition(25, '=', 25)).toBe(true);
  });

  it('devolve false para operadores desconhecidos', () => {
    expect(evaluateCondition(30, '!=', 25)).toBe(false);
    expect(evaluateCondition(30, undefined, 25)).toBe(false);
  });
});

describe('evaluateSensor', () => {
  beforeEach(() => {
    query.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('cria um alerta quando a regra é violada e não existe alerta activo', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ type: 'temperature' }] })            // tipo do sensor
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'Temperatura crítica', condition: '>', threshold: 35, severity: 'critical' }] })
      .mockResolvedValueOnce({ rows: [] })                                   // sem alerta activo
      .mockResolvedValueOnce({ rows: [] });                                  // INSERT

    await evaluateSensor(1, 40);

    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO alert'));
    expect(insert).toBeDefined();
    expect(insert[1]).toEqual(
      expect.arrayContaining([1, 7, expect.any(String), 40, 'critical'])
    );
  });

  it('não duplica o alerta se já existir um por resolver', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ type: 'temperature' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, condition: '>', threshold: 35, severity: 'critical' }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });                        // alerta já existe

    await evaluateSensor(1, 40);

    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO alert'))).toBe(false);
  });

  it('não cria alerta quando o valor está dentro do limite', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ type: 'temperature' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, condition: '>', threshold: 35, severity: 'critical' }] });

    await evaluateSensor(1, 20);

    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO alert'))).toBe(false);
  });

  it('termina silenciosamente se o sensor não existir', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await evaluateSensor(999, 40);

    expect(query).toHaveBeenCalledTimes(1);
  });
});
