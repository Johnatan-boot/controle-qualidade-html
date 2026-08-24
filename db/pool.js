const mysql = require('mysql2/promise');

function buildConfig() {
  // Clever Cloud normalmente fornece as variáveis MYSQL_ADDON_*.
  // Se elas existirem, elas têm prioridade sobre uma URI genérica.
  const hasIndividualConfig = Boolean(
    process.env.MYSQL_ADDON_HOST ||
    process.env.MYSQL_ADDON_USER ||
    process.env.MYSQL_ADDON_DB
  );

  const uri = process.env.MYSQL_ADDON_URI || process.env.MYSQL_ADDON_URL;

  const base = !hasIndividualConfig && uri
    ? { uri }
    : {
        host: process.env.MYSQL_ADDON_HOST || process.env.DB_HOST || 'localhost',
        user: process.env.MYSQL_ADDON_USER || process.env.DB_USER || 'root',
        password: process.env.MYSQL_ADDON_PASSWORD || process.env.DB_PASSWORD || '',
        database: process.env.MYSQL_ADDON_DB || process.env.DB_NAME || 'qa_kingstar',
        port: Number(process.env.MYSQL_ADDON_PORT || process.env.DB_PORT || 3306),
      };

  // A Clever Cloud deste projeto limita o usuário MySQL a 5 conexões.
  // O valor padrão anterior era 10, o que permitia que o pool ultrapassasse
  // o limite do banco e provocasse ER_USER_LIMIT_REACHED.
  const configuredLimit = Number(process.env.DB_CONNECTION_LIMIT || 2);
  const connectionLimit = Math.max(1, Math.min(configuredLimit, 4));

  return {
    ...base,
    waitForConnections: true,
    connectionLimit,
    // Mantemos uma fila limitada para evitar acumular requisições indefinidamente
    // quando o banco estiver momentaneamente ocupado.
    queueLimit: Number(process.env.DB_QUEUE_LIMIT || 20),
    maxIdle: connectionLimit,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    dateStrings: true,
  };
}

const config = buildConfig();
const pool = mysql.createPool(config);

// Diagnóstico simples no boot, sem expor senha ou credenciais.
console.log(`Pool MySQL configurado com limite de ${config.connectionLimit} conexão(ões).`);

module.exports = pool;
