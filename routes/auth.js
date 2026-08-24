const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  // 'secure' deve ficar true em produção atrás de HTTPS — controlado por COOKIE_SECURE no .env
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 8 * 60 * 60 * 1000, // 8 horas
};

async function registrarLogAcesso(usuarioNome, login, sucesso) {
  try {
    await pool.query(
      'INSERT INTO log_acessos (usuario_nome, login, sucesso) VALUES (?,?,?)',
      [usuarioNome, login, sucesso ? 1 : 0]
    );
  } catch (e) {
    console.error('Falha ao registrar log de acesso:', e.message);
  }
}

// IMPORTANTE: esta é a ÚNICA rota de autenticação que fica fora da guarda de
// login — todas as demais rotas de /api/* exigem token válido (ver server.js).

router.post('/registrar', asyncHandler(async (req, res) => {
  const { nome, email, login, senha, setor } = req.body || {};
  const nomeN = String(nome || '').trim();
  const emailN = String(email || '').trim().toLowerCase();
  const loginN = String(login || '').trim().toLowerCase();
  const setorN = String(setor || '').trim() || null;

  if (!nomeN || !emailN || !loginN || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, e-mail, usuário e senha.' });
  }
  if (nomeN.length < 3) return res.status(400).json({ erro: 'Informe um nome válido.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailN)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  if (!/^[a-z0-9._-]{3,60}$/.test(loginN)) {
    return res.status(400).json({ erro: 'O usuário deve ter 3 a 60 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.' });
  }
  if (String(senha).length < 8) {
    return res.status(400).json({ erro: 'A senha deve ter ao menos 8 caracteres.' });
  }

  const [existentes] = await pool.query(
    'SELECT id, login, email FROM usuarios WHERE login = ? OR LOWER(email) = ? LIMIT 1',
    [loginN, emailN]
  );
  if (existentes[0]) {
    const campo = existentes[0].login === loginN ? 'usuário' : 'e-mail';
    return res.status(409).json({ erro: `Este ${campo} já está cadastrado.` });
  }

  const senhaHash = await bcrypt.hash(String(senha), 10);
  const [result] = await pool.query(
    `INSERT INTO usuarios
      (nome, email, login, senha_hash, perfil, setor, ativo, precisa_trocar_senha)
     VALUES (?, ?, ?, ?, 'OPERADOR', ?, 1, 0)`,
    [nomeN, emailN, loginN, senhaHash, setorN]
  );

  res.status(201).json({
    ok: true,
    mensagem: 'Cadastro realizado. Agora você já pode entrar no sistema.',
    usuario: { id: result.insertId, nome: nomeN, email: emailN, login: loginN, perfil: 'OPERADOR', setor: setorN }
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) return res.status(400).json({ erro: 'Informe usuário e senha.' });

  const loginNormalizado = String(login).trim().toLowerCase();
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE login = ?', [loginNormalizado]);
  const usuario = rows[0];

  // Guarda extra: além de não existir ou estar inativo, um usuário sem hash de
  // senha cadastrado (ex.: inserido manualmente direto no banco, sem passar
  // pelo fluxo de cadastro/seed) também deve ser tratado como inválido — nunca
  // chamar bcrypt.compare com um hash ausente, isso derrubava o servidor.
  if (!usuario || !usuario.ativo || !usuario.senha_hash) {
    await registrarLogAcesso(usuario ? usuario.nome : loginNormalizado, loginNormalizado, false);
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
  }
  const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaOk) {
    await registrarLogAcesso(usuario.nome, loginNormalizado, false);
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
  }

  await pool.query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [usuario.id]);
  await registrarLogAcesso(usuario.nome, loginNormalizado, true);

  const payload = { id: usuario.id, nome: usuario.nome, login: usuario.login, perfil: usuario.perfil, setor: usuario.setor };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  res.cookie('qa_token', token, COOKIE_OPTS);
  res.json({ usuario: { ...payload, precisaTrocarSenha: !!usuario.precisa_trocar_senha } });
}));

router.post('/logout', (req, res) => {
  res.clearCookie('qa_token', { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: req.usuario });
});

router.post('/trocar-senha', requireAuth, asyncHandler(async (req, res) => {
  const { senhaAtual, novaSenha } = req.body || {};
  if (!senhaAtual || !novaSenha) return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  if (novaSenha.length < 8) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 8 caracteres.' });

  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.usuario.id]);
  const usuario = rows[0];
  if (!usuario || !usuario.senha_hash || !(await bcrypt.compare(senhaAtual, usuario.senha_hash))) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }
  const novoHash = await bcrypt.hash(novaSenha, 10);
  await pool.query('UPDATE usuarios SET senha_hash = ?, precisa_trocar_senha = 0 WHERE id = ?', [novoHash, usuario.id]);
  res.json({ ok: true });
}));

module.exports = router;
