const mysql = require('mysql2/promise');

function buildConfig() {
  // Clever Cloud pode fornecer MYSQL_ADDON_URI; variáveis individuais têm prioridade.
  const uri = process.env.MYSQL_ADDON_URI || process.env.MYSQL_ADDON_URL;
  const base = uri ? { uri } : {
    host: process.env.MYSQL_ADDON_HOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQL_ADDON_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_ADDON_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_ADDON_DB || process.env.DB_NAME || 'qa_kingstar',
    port: Number(process.env.MYSQL_ADDON_PORT || process.env.DB_PORT || 3306),
  };
  return {
    ...base,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    dateStrings: true,
  };
}

const pool = mysql.createPool(buildConfig());
module.exports = pool;
