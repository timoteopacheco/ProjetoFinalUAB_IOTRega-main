// src/config/database.js
// Configuração da ligação PostgreSQL com pool de conexões

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'iotrega',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max:      20,               // máximo de conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Testar ligação no arranque
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao ligar à base de dados:', err.message);
    return;
  }
  console.log('✅ Ligação à base de dados estabelecida');
  release();
});

// Helper para queries mais limpas
const query = (text, params) => pool.query(text, params);

// Helper para transações
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, transaction };
