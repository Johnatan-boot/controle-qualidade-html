const mysql = require('mysql2/promise');

// Aceita tanto as variáveis padrão da Clever Cloud (MYSQL_ADDON_*, injetadas
// automaticamente quando o add-on está conectado ao serviço no Render) quanto
// variáveis genéricas DB_* (caso você prefira configurar manualmente).
const HOST = process.env.MYSQL_ADDON_HOST || process.env.DB_HOST || 'localhost';
const USER = process.env.MYSQL_ADDON_USER || process.env.DB_USER || 'root';
const PASSWORD = process.env.MYSQL_ADDON_PASSWORD || process.env.DB_PASSWORD || '';
const DATABASE = process.env.MYSQL_ADDON_DB || process.env.DB_NAME || 'qa_kingstar';
const PORT = Number(process.env.MYSQL_ADDON_PORT || process.env.DB_PORT || 3306);

const pool = mysql.createPool({
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  port: PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // devolve DATE/DATETIME como string "YYYY-MM-DD[ HH:MM:SS]" em vez de objeto Date
});

module.exports = pool;
