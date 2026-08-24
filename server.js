require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { aplicarSchema } = require('./db/setup');
const { garantirSeed } = require('./db/seed');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const pool = require('./db/pool');

// Rede de segurança de último recurso: se algum erro escapar de tudo (ex.: um
// bug num código que roda fora de uma rota Express), registra no log em vez
// de deixar o processo cair silenciosamente e tirar o sistema do ar para
// todo mundo. As rotas em si já são protegidas individualmente por
// asyncHandler (ver middleware/asyncHandler.js) — isto é só o último cinto de
// segurança.
process.on('unhandledRejection', (err) => {
  console.error('Erro não tratado (unhandledRejection):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Erro não tratado (uncaughtException):', err);
});

async function shutdown(signal) {
  console.log(`Recebido ${signal}; encerrando pool MySQL...`);
  try { await pool.end(); } catch (err) { console.error('Erro ao encerrar pool:', err.message); }
  process.exit(0);
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' })); // fotos em base64 podem deixar o payload grande
app.use(cookieParser());

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check não exige autenticação e ajuda o Render a distinguir aplicação
// no ar de aplicação conectada corretamente ao banco.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    console.error('Health check do banco falhou:', err.message);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'check-list.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes); // guarda de rotas aplicada dentro de routes/api.js (requireAuth em todas)

// tratamento de erro genérico (evita vazar stack trace para o cliente em produção)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// Garante que as tabelas existem ANTES de aceitar qualquer requisição — evita
// o erro "Table '...' doesn't exist" quando alguém esquece de rodar
// "node db/setup.js" manualmente depois de um deploy, ou quando o banco é
// recriado do zero. Como todo comando do schema.sql usa "CREATE TABLE IF NOT
// EXISTS", rodar isso a cada boot é seguro e nunca apaga dados existentes.
aplicarSchema()
  .then(async () => {
    console.log('Schema do banco verificado/aplicado com sucesso.');
    await garantirSeed();
    console.log('Seed inicial verificado com sucesso.');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Não foi possível aplicar o schema do banco na inicialização:', err.message);
    console.error('Verifique as credenciais/conexão do MySQL nas variáveis de ambiente (DB_* ou MYSQL_ADDON_*).');
    process.exit(1);
  });
