// src/config/db-setup.js
// Aplica db/schema.sql à base de dados configurada em .env
// Uso: npm run db:setup   (a base de dados já tem de existir)

const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

async function main() {
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('A aplicar db/schema.sql...');
  await pool.query(sql);
  console.log('✅ Schema aplicado com sucesso.');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Erro ao aplicar schema:', err.message);
  process.exit(1);
});
