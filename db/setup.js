// Aplica o schema.sql no banco configurado nas variáveis de ambiente.
// Uso manual: node db/setup.js
// Também é chamado automaticamente pelo server.js a cada boot (ver aplicarSchema
// abaixo) — assim, mesmo que alguém esqueça de rodar esse comando manualmente
// depois de um deploy, ou crie a tabela errada na mão, o servidor corrige o
// schema sozinho antes de aceitar requisições.
// Pode ser executado quantas vezes quiser — todos os comandos usam
// CREATE TABLE IF NOT EXISTS / ON DUPLICATE KEY UPDATE, então não apaga dados existentes.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const HOST = process.env.MYSQL_ADDON_HOST || process.env.DB_HOST || 'localhost';
const USER = process.env.MYSQL_ADDON_USER || process.env.DB_USER || 'root';
const PASSWORD = process.env.MYSQL_ADDON_PASSWORD || process.env.DB_PASSWORD || '';
const DATABASE = process.env.MYSQL_ADDON_DB || process.env.DB_NAME || 'qa_kingstar';
const PORT = Number(process.env.MYSQL_ADDON_PORT || process.env.DB_PORT || 3306);

async function aplicarSchema() {
  const connection = await mysql.createConnection({
    host: HOST, user: USER, password: PASSWORD, database: DATABASE, port: PORT,
    multipleStatements: true,
  });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

module.exports = { aplicarSchema };

// Só executa como script de linha de comando (node db/setup.js); quando
// importado pelo server.js via require, apenas expõe aplicarSchema().
if (require.main === module) {
  (async () => {
    try {
      console.log(`Aplicando schema em ${USER}@${HOST}:${PORT}/${DATABASE} ...`);
      await aplicarSchema();
      console.log('Schema aplicado com sucesso.');
    } catch (err) {
      console.error('Falha ao aplicar o schema:', err.message);
      process.exit(1);
    }
  })();
}
