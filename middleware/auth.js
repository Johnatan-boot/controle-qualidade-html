const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado. Defina essa variável de ambiente antes de iniciar o servidor.');
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.qa_token;
  if (!token) return res.status(401).json({ erro: 'Não autenticado. Faça login novamente.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (e) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}

function requireRole(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: 'Você não tem permissão para realizar esta ação.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
