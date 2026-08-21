// Cria os 3 usuários padrão e alguns dados de exemplo (produtos e uma divergência),
// só na primeira execução (se a tabela usuarios já tiver registros, não faz nada).
// Uso: node db/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const SENHA_PADRAO = {
  gestao: process.env.SEED_SENHA_GESTAO || 'KingStar@2026',
  admin: process.env.SEED_SENHA_ADMIN || 'KingStar@2026',
  operador: process.env.SEED_SENHA_OPERADOR || 'KingStar@2026',
};

async function main() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
  if (rows[0].total > 0) {
    console.log('Banco já contém usuários — seed ignorado (nada foi alterado).');
    await pool.end();
    return;
  }

  const usuarios = [
    { nome: 'Administrador Geral', email: 'gestao@kingstarcolchoes.com.br', login: 'gestao', perfil: 'GESTAO', setor: null, senha: SENHA_PADRAO.gestao },
    { nome: 'Admin CD', email: 'admin@kingstarcolchoes.com.br', login: 'admin', perfil: 'ADMINISTRADOR', setor: null, senha: SENHA_PADRAO.admin },
    { nome: 'Operador Recebimento', email: 'operador@kingstarcolchoes.com.br', login: 'operador', perfil: 'OPERADOR', setor: 'RECEBIMENTO', senha: SENHA_PADRAO.operador },
  ];
  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.senha, 10);
    await pool.query(
      'INSERT INTO usuarios (nome, email, login, senha_hash, perfil, setor, ativo, precisa_trocar_senha) VALUES (?,?,?,?,?,?,1,1)',
      [u.nome, u.email, u.login, hash, u.perfil, u.setor]
    );
  }

  const produtos = [
    ['BUP096X203X36AFDBOXPREMVELCHO', 'BOX SUEDE MARROM 069X188X25 INOV', 'BOX', 401.63, 'V-JOY MOVEIS E COLCH', 'LINHA PREMIUM'],
    ['CMP158X198X32ECUXFIRDES', 'BAU AF VELUDO AZUL COM CAVA 079X198X38 VJOY', 'BAÚ', 439.04, 'CRIAZZI', 'LINHA CASAL'],
    ['BXP138X188X26VJOYXKORBRCO', 'BOX KORANO BRANCO 138X188X26', 'BOX', 185.85, 'V-JOY MOVEIS E COLCH', 'LINHA KORANO'],
    ['ALM033X033X14CNZFOM', 'ALMOFADA DE PESCOCO 33X33X14 CINZA FOM', 'ACESSÓRIO', 20.50, 'CASA BASICA COMERCIO', 'LINHA CONFORTO'],
    ['BUE064X188X35AFITASUEDEXSUECIN', 'BAU ESPECIAL 064 X 188 X 35 AF ITABOX SUEDE', 'BAÚ', 647.54, 'ITABOX', 'LINHA ESPECIAL'],
  ];
  for (const p of produtos) {
    await pool.query(
      'INSERT INTO produtos (codigo, descricao, grupo, preco, fornecedor, familia) VALUES (?,?,?,?,?,?)',
      p
    );
  }

  await pool.query(
    `INSERT INTO divergencias_produtos
      (setor, sku, descricao, fornecedor, valor_unit, qtd, cod_divergencia, status, responsavel, data, prazo_correcao, fotos_json)
     VALUES (?,?,?,?,?,?,?,?,?,CURDATE(),DATE_ADD(CURDATE(), INTERVAL 5 DAY), JSON_ARRAY())`,
    ['RECEBIMENTO', 'BUE064X188X35AFITASUEDEXSUECIN', 'BAU ESPECIAL 064 X 188 X 35 AF ITABOX SUEDE', 'ITABOX', 647.54, 1, 'PESINHO SOLTO', 'PENDENTE', 'Administrador Geral']
  );

  console.log('Seed concluído com sucesso.');
  console.log(`Usuários criados: gestao / admin / operador — senha provisória: ${SENHA_PADRAO.gestao} (todos devem trocar no primeiro acesso).`);
  await pool.end();
}

main().catch(err => {
  console.error('Falha no seed:', err.message);
  process.exit(1);
});
