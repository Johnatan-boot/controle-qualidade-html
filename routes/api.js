const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const bcrypt = require('bcryptjs');

const router = express.Router();
router.use(requireAuth); // guarda de rotas: nenhuma rota abaixo funciona sem login válido

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function parseJsonColumn(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v; // mysql2 já entrega JSON parseado
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

// Converte strings vazias ou com espaços em null para evitar erros de data/coluna no MySQL
function cleanDate(v) {
  if (v === undefined || v === null) return null;
  const str = String(v).trim();
  return str === '' ? null : str;
}

function cleanText(v) {
  if (v === undefined || v === null) return null;
  const str = String(v).trim();
  return str === '' ? null : str;
}

async function registrarHistorico(tabela, registroId, acao, usuarioNome, descricao) {
  await pool.query(
    'INSERT INTO historico_alteracoes (tabela, registro_id, acao, usuario_nome, descricao) VALUES (?,?,?,?,?)',
    [tabela, String(registroId), acao, usuarioNome, descricao]
  );
}

// Deriva a categoria de um produto a partir do prefixo alfabético do código
// (SKU) — ex.: "CMP158X198X32ECUXFIRDES" -> "CMP", "BUP096X203X36..." -> "BUP".
function derivarCategoria(codigo) {
  if (!codigo) return null;
  const m = String(codigo).trim().match(/^[A-Za-zÀ-ÿ]+/);
  return m ? m[0].slice(0, 3).toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// mapeamento snake_case (banco) -> camelCase (front-end)
// ---------------------------------------------------------------------------
function mapProduto(p) {
  return { id: p.id, codigo: p.codigo, descricao: p.descricao, grupo: p.grupo, categoria: p.categoria, preco: Number(p.preco), fornecedor: p.fornecedor, familia: p.familia };
}
function mapDivergenciaProduto(l) {
  return {
    id: l.id, setor: l.setor, sku: l.sku, descricao: l.descricao, categoria: l.categoria, fornecedor: l.fornecedor,
    valorUnit: Number(l.valor_unit), qtd: l.qtd, codDiv: l.cod_divergencia, outroCodDiv: l.outro_cod_div,
    status: l.status, responsavel: l.responsavel, data: l.data, prazoCorrecao: l.prazo_correcao,
    dataConclusao: l.data_conclusao, obs: l.observacao, fotos: parseJsonColumn(l.fotos_json, []),
  };
}
function mapItemEstoque(it) {
  return {
    id: it.id, ordem: it.ordem, tipo: it.tipo, divergencia: it.divergencia, outroDesc: it.outro_desc,
    obs: it.observacao, status: it.status, dataConclusao: it.data_conclusao, fotos: parseJsonColumn(it.fotos_json, []),
  };
}
function mapItem5s(it) {
  return {
    id: it.id, ordem: it.ordem, senso: it.senso, desc: it.descricao, resp: it.resp, obs: it.observacao,
    acaoCorretiva: it.acao_corretiva, respNc: it.responsavel_nc, criticidade: it.criticidade,
    status: it.status, prazo: it.prazo, dataConclusao: it.data_conclusao,
  };
}
function mapRecebimento(l) {
  return {
    id: l.id, dataInspecao: l.data_inspecao, fornecedor: l.fornecedor, fornecedorOutro: l.fornecedor_outro,
    resultadoFornecedor: l.resultado_fornecedor, divergenciaFornecedor: parseJsonColumn(l.divergencia_fornecedor_json, {}),
    resultadoOperacional: l.resultado_operacional, divergenciaOperacional: parseJsonColumn(l.divergencia_operacional_json, {}),
    statusFinal: l.status_final, usuarioResponsavel: l.usuario_responsavel, dataFinalizacao: l.data_finalizacao,
  };
}
function mapUsuario(u) {
  return { id: u.id, nome: u.nome, email: u.email, login: u.login, perfil: u.perfil, setor: u.setor, ativo: !!u.ativo, ultimo: u.ultimo_acesso || 'Nunca' };
}

// ---------------------------------------------------------------------------
// PRODUTOS
// ---------------------------------------------------------------------------
router.get('/produtos', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM produtos ORDER BY descricao');
  res.json(rows.map(mapProduto));
}));

router.post('/produtos', asyncHandler(async (req, res) => {
  const { codigo, descricao, grupo, categoria, preco, fornecedor, familia } = req.body || {};
  if (!codigo || !descricao) return res.status(400).json({ erro: 'Informe código (SKU) e descrição.' });
  const categoriaFinal = (categoria && String(categoria).trim()) || derivarCategoria(codigo);
  try {
    const [result] = await pool.query(
      'INSERT INTO produtos (codigo, descricao, grupo, categoria, preco, fornecedor, familia) VALUES (?,?,?,?,?,?,?)',
      [codigo, descricao, cleanText(grupo), categoriaFinal, preco || 0, cleanText(fornecedor), cleanText(familia)]
    );
    await registrarHistorico('produtos', result.insertId, 'CRIACAO', req.usuario.nome, `${req.usuario.nome} cadastrou o produto ${codigo} (${descricao}).`);
    const [rows] = await pool.query('SELECT * FROM produtos WHERE id = ?', [result.insertId]);
    res.status(201).json(mapProduto(rows[0]));
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um produto com esse código (SKU).' });
    throw e;
  }
}));

router.put('/produtos/:id', asyncHandler(async (req, res) => {
  const { descricao, grupo, categoria, preco, fornecedor, familia } = req.body || {};
  const [existentes] = await pool.query('SELECT codigo, categoria FROM produtos WHERE id = ?', [req.params.id]);
  if (!existentes[0]) return res.status(404).json({ erro: 'Produto não encontrado.' });
  const categoriaFinal = (categoria && String(categoria).trim())
    || existentes[0].categoria
    || derivarCategoria(existentes[0].codigo);
  await pool.query(
    'UPDATE produtos SET descricao=?, grupo=?, categoria=?, preco=?, fornecedor=?, familia=? WHERE id=?',
    [descricao, cleanText(grupo), categoriaFinal, preco || 0, cleanText(fornecedor), cleanText(familia), req.params.id]
  );
  await registrarHistorico('produtos', req.params.id, 'EDICAO', req.usuario.nome, `${req.usuario.nome} editou o produto (${descricao}).`);
  const [rows] = await pool.query('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
  res.json(mapProduto(rows[0]));
}));

router.delete('/produtos/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Produto não encontrado.' });
  await pool.query('DELETE FROM produtos WHERE id = ?', [req.params.id]);
  await registrarHistorico('produtos', req.params.id, 'EXCLUSAO', req.usuario.nome, `${req.usuario.nome} excluiu o produto ${rows[0].codigo}.`);
  res.json({ ok: true });
}));

// Reset da tabela de Cadastro de Produtos: exclui todos os produtos de uma vez.
// Restrito a GESTAO (mesmo padrão das outras exclusões em massa/irreversíveis
// deste arquivo) e sempre registrado no histórico de alterações.
router.delete('/produtos', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM produtos');
  const total = rows[0].total;
  await pool.query('DELETE FROM produtos');
  await registrarHistorico('produtos', 'todos', 'EXCLUSAO', req.usuario.nome, `${req.usuario.nome} excluiu todos os produtos cadastrados (${total} produto(s)).`);
  res.json({ ok: true, excluidos: total });
}));

router.post('/produtos/importar', asyncHandler(async (req, res) => {
  const linhas = Array.isArray(req.body) ? req.body : [];
  let criados = 0, atualizados = 0, ignorados = 0;
  for (const l of linhas) {
    if (!l || !l.codigo || !l.descricao) { ignorados++; continue; }
    const categoriaFinal = (l.categoria && String(l.categoria).trim()) || derivarCategoria(l.codigo);
    const [existentes] = await pool.query('SELECT id FROM produtos WHERE codigo = ?', [l.codigo]);
    if (existentes[0]) {
      await pool.query(
        'UPDATE produtos SET descricao=?, grupo=?, categoria=?, preco=?, fornecedor=?, familia=? WHERE id=?',
        [l.descricao, cleanText(l.grupo), categoriaFinal, l.preco || 0, cleanText(l.fornecedor), cleanText(l.familia), existentes[0].id]
      );
      atualizados++;
    } else {
      await pool.query(
        'INSERT INTO produtos (codigo, descricao, grupo, categoria, preco, fornecedor, familia) VALUES (?,?,?,?,?,?,?)',
        [l.codigo, l.descricao, cleanText(l.grupo), categoriaFinal, l.preco || 0, cleanText(l.fornecedor), cleanText(l.familia)]
      );
      criados++;
    }
  }
  await registrarHistorico('produtos', 'lote', 'EDICAO', req.usuario.nome, `${req.usuario.nome} importou uma planilha de produtos (${criados} criados, ${atualizados} atualizados, ${ignorados} ignorados).`);
  res.json({ criados, atualizados, ignorados });
}));

// ---------------------------------------------------------------------------
// DIVERGÊNCIAS DE PRODUTOS
// ---------------------------------------------------------------------------
router.get('/divergencias-produtos', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM divergencias_produtos ORDER BY id DESC');
  res.json(rows.map(mapDivergenciaProduto));
}));

async function resolverCategoriaDivergencia(d) {
  if (d.categoria && String(d.categoria).trim()) return String(d.categoria).trim();
  if (d.sku) {
    const [prod] = await pool.query('SELECT categoria FROM produtos WHERE codigo = ?', [d.sku]);
    if (prod[0] && prod[0].categoria) return prod[0].categoria;
  }
  return derivarCategoria(d.sku);
}

router.post('/divergencias-produtos', asyncHandler(async (req, res) => {
  const d = req.body || {};
  const categoria = await resolverCategoriaDivergencia(d);
  const [result] = await pool.query(
    `INSERT INTO divergencias_produtos
      (setor, sku, descricao, categoria, fornecedor, valor_unit, qtd, cod_divergencia, outro_cod_div, status, responsavel, data, prazo_correcao, observacao, fotos_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON))`,
    [
      cleanText(d.setor),
      cleanText(d.sku),
      cleanText(d.descricao),
      categoria,
      cleanText(d.fornecedor),
      d.valorUnit || 0,
      d.qtd || 1,
      cleanText(d.codDiv),
      cleanText(d.outroCodDiv),
      d.status || 'PENDENTE',
      cleanText(d.responsavel),
      cleanDate(d.data),
      cleanDate(d.prazoCorrecao),
      cleanText(d.obs),
      JSON.stringify(d.fotos || [])
    ]
  );
  await registrarHistorico('divergencias_produtos', result.insertId, 'CRIACAO', req.usuario.nome, `${req.usuario.nome} registrou a divergência nº ${result.insertId} (${d.sku}, setor ${d.setor}).`);
  const [rows] = await pool.query('SELECT * FROM divergencias_produtos WHERE id = ?', [result.insertId]);
  res.status(201).json(mapDivergenciaProduto(rows[0]));
}));

router.put('/divergencias-produtos/:id', asyncHandler(async (req, res) => {
  const d = req.body || {};

  const [existentes] = await pool.query(
    'SELECT * FROM divergencias_produtos WHERE id = ?',
    [req.params.id]
  );

  if (!existentes[0]) {
    return res.status(404).json({
      erro: 'Divergência não encontrada.'
    });
  }

  const atual = existentes[0];
  const categoria = await resolverCategoriaDivergencia(d);

  await pool.query(
    `UPDATE divergencias_produtos SET
      setor=?,
      sku=?,
      descricao=?,
      categoria=?,
      fornecedor=?,
      valor_unit=?,
      qtd=?,
      cod_divergencia=?,
      outro_cod_div=?,
      status=?,
      responsavel=?,
      data=?,
      prazo_correcao=?,
      data_conclusao=?,
      observacao=?,
      fotos_json=CAST(? AS JSON)
    WHERE id=?`,
    [
      d.setor !== undefined ? cleanText(d.setor) : atual.setor,
      d.sku !== undefined ? cleanText(d.sku) : atual.sku,
      d.descricao !== undefined ? cleanText(d.descricao) : atual.descricao,
      categoria ?? atual.categoria,
      d.fornecedor !== undefined ? cleanText(d.fornecedor) : atual.fornecedor,
      d.valorUnit !== undefined ? d.valorUnit : atual.valor_unit,
      d.qtd !== undefined ? d.qtd : atual.qtd,
      d.codDiv !== undefined ? cleanText(d.codDiv) : atual.cod_divergencia,
      d.outroCodDiv !== undefined ? cleanText(d.outroCodDiv) : atual.outro_cod_div,
      d.status !== undefined ? d.status : atual.status,
      d.responsavel !== undefined ? cleanText(d.responsavel) : atual.responsavel,
      d.data !== undefined ? cleanDate(d.data) : atual.data,
      d.prazoCorrecao !== undefined ? cleanDate(d.prazoCorrecao) : atual.prazo_correcao,
      d.dataConclusao !== undefined ? cleanDate(d.dataConclusao) : atual.data_conclusao,
      d.obs !== undefined ? cleanText(d.obs) : atual.observacao,
      JSON.stringify(
        d.fotos !== undefined
          ? d.fotos
          : parseJsonColumn(atual.fotos_json, [])
      ),
      req.params.id
    ]
  );

  await registrarHistorico(
    'divergencias_produtos',
    req.params.id,
    'EDICAO',
    req.usuario.nome,
    `${req.usuario.nome} editou a divergência nº ${req.params.id}.`
  );

  const [rows] = await pool.query(
    'SELECT * FROM divergencias_produtos WHERE id = ?',
    [req.params.id]
  );

  res.json(mapDivergenciaProduto(rows[0]));
}));

router.delete('/divergencias-produtos/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM divergencias_produtos WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Divergência não encontrada.' });
  await pool.query('DELETE FROM divergencias_produtos WHERE id = ?', [req.params.id]);
  await registrarHistorico('divergencias_produtos', req.params.id, 'EXCLUSAO', req.usuario.nome, `${req.usuario.nome} excluiu a divergência nº ${req.params.id} (${rows[0].sku}, setor ${rows[0].setor}).`);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// INSPEÇÃO DE ESTOQUE
// ---------------------------------------------------------------------------
router.get('/inspecoes-estoque', asyncHandler(async (req, res) => {
  const [inspecoes] = await pool.query('SELECT * FROM inspecoes_estoque ORDER BY id DESC');
  // Ordenação feita aqui no Node (em vez de "ORDER BY" no SQL) de propósito: o
  // MySQL do plano usado em produção tem um sort_buffer_size muito pequeno, e
  // mesmo com o índice em (inspecao_id, ordem), o otimizador nem sempre escolhe
  // usá-lo para ordenar um SELECT * sem WHERE/LIMIT — preferindo um filesort que
  // estoura o buffer (ER_OUT_OF_SORTMEMORY) por causa das colunas grandes
  // (observacao, fotos_json). Ordenar no JS elimina esse risco por completo.
  const [itens] = await pool.query('SELECT * FROM inspecoes_estoque_itens');
  itens.sort((a, b) => a.inspecao_id - b.inspecao_id || a.ordem - b.ordem);
  const porInspecao = {};
  itens.forEach(it => { (porInspecao[it.inspecao_id] ||= []).push(mapItemEstoque(it)); });
  res.json(inspecoes.map(i => ({ id: i.id, data: i.data, responsavel: i.responsavel, divergencias: porInspecao[i.id] || [] })));
}));

router.post('/inspecoes-estoque', asyncHandler(async (req, res) => {
  const { data, responsavel, divergencias } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO inspecoes_estoque (data, responsavel) VALUES (?,?)', [cleanDate(data), cleanText(responsavel)]);
    const inspecaoId = result.insertId;
    let ordem = 1;
    for (const d of (divergencias || [])) {
      await conn.query(
        `INSERT INTO inspecoes_estoque_itens (inspecao_id, ordem, tipo, divergencia, outro_desc, observacao, status, fotos_json)
         VALUES (?,?,?,?,?,?,?,CAST(? AS JSON))`,
        [inspecaoId, ordem++, cleanText(d.tipo), cleanText(d.divergencia), cleanText(d.outroDesc), cleanText(d.obs), d.status || 'PENDENTE', JSON.stringify(d.fotos || [])]
      );
    }
    await conn.commit();
    await registrarHistorico('inspecoes_estoque', inspecaoId, 'CRIACAO', req.usuario.nome, `${req.usuario.nome} registrou a inspeção de estoque nº ${inspecaoId}.`);
    res.status(201).json({ id: inspecaoId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.put('/inspecoes-estoque/itens/:itemId', asyncHandler(async (req, res) => {
  const { status, obs, dataConclusao } = req.body || {};
  const [existentes] = await pool.query('SELECT * FROM inspecoes_estoque_itens WHERE id = ?', [req.params.itemId]);
  if (!existentes[0]) return res.status(404).json({ erro: 'Item de inspeção não encontrado.' });
  await pool.query(
    'UPDATE inspecoes_estoque_itens SET status=?, observacao=?, data_conclusao=? WHERE id=?',
    [status || null, cleanText(obs), cleanDate(dataConclusao), req.params.itemId]
  );
  await registrarHistorico('inspecoes_estoque', existentes[0].inspecao_id, 'EDICAO', req.usuario.nome, `${req.usuario.nome} atualizou uma pendência da inspeção de estoque nº ${existentes[0].inspecao_id}.`);
  const [rows] = await pool.query('SELECT * FROM inspecoes_estoque_itens WHERE id = ?', [req.params.itemId]);
  res.json(mapItemEstoque(rows[0]));
}));

router.delete('/inspecoes-estoque/:id', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM inspecoes_estoque WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Inspeção não encontrada.' });
  await pool.query('DELETE FROM inspecoes_estoque WHERE id = ?', [req.params.id]);
  await registrarHistorico('inspecoes_estoque', req.params.id, 'EXCLUSAO', req.usuario.nome, `${req.usuario.nome} excluiu a inspeção de estoque nº ${req.params.id}.`);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// CHECK LIST 5S
// ---------------------------------------------------------------------------
router.get('/checklists-5s', asyncHandler(async (req, res) => {
  const [checklists] = await pool.query('SELECT * FROM checklists_5s ORDER BY id DESC');
  // Mesmo motivo do endpoint /inspecoes-estoque acima: ordenar no Node em vez de
  // no SQL evita depender do otimizador escolher o índice (inspecao/checklist_id,
  // ordem) para o ORDER BY, e elimina de vez o risco de ER_OUT_OF_SORTMEMORY.
  const [itens] = await pool.query('SELECT * FROM checklists_5s_itens');
  itens.sort((a, b) => a.checklist_id - b.checklist_id || a.ordem - b.ordem);
  const porChecklist = {};
  itens.forEach(it => { (porChecklist[it.checklist_id] ||= []).push(mapItem5s(it)); });
  res.json(checklists.map(c => ({
    id: c.id, setor: c.setor, turno: c.turno, responsavel: c.responsavel, data: c.data,
    conformidade: Number(c.conformidade), anexos: parseJsonColumn(c.anexos_json, []), itens: porChecklist[c.id] || [],
  })));
}));

router.post('/checklists-5s', asyncHandler(async (req, res) => {
  const { setor, turno, responsavel, data, conformidade, anexos, itens } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO checklists_5s (setor, turno, responsavel, data, conformidade, anexos_json) VALUES (?,?,?,?,?,CAST(? AS JSON))',
      [cleanText(setor), cleanText(turno), cleanText(responsavel), cleanDate(data), conformidade || 0, JSON.stringify(anexos || [])]
    );
    const checklistId = result.insertId;
    let ordem = 1;
    for (const it of (itens || [])) {
      await conn.query(
        `INSERT INTO checklists_5s_itens (checklist_id, ordem, senso, descricao, resp, observacao, acao_corretiva, responsavel_nc, criticidade, status, prazo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          checklistId,
          ordem++,
          cleanText(it.senso),
          cleanText(it.desc),
          cleanText(it.resp),
          cleanText(it.obs),
          cleanText(it.acaoCorretiva),
          cleanText(it.respNc),
          cleanText(it.criticidade),
          cleanText(it.status),
          cleanDate(it.prazo)
        ]
      );
    }
    await conn.commit();
    await registrarHistorico('checklists_5s', checklistId, 'CRIACAO', req.usuario.nome, `${req.usuario.nome} registrou o checklist 5S nº ${checklistId} (${setor}).`);
    res.status(201).json({ id: checklistId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.put('/checklists-5s/itens/:itemId', asyncHandler(async (req, res) => {
  const { status, obs, acaoCorretiva, respNc, criticidade, prazo, dataConclusao } = req.body || {};
  const [existentes] = await pool.query('SELECT * FROM checklists_5s_itens WHERE id = ?', [req.params.itemId]);
  if (!existentes[0]) return res.status(404).json({ erro: 'Item do checklist não encontrado.' });
  await pool.query(
    'UPDATE checklists_5s_itens SET status=?, observacao=?, acao_corretiva=?, responsavel_nc=?, criticidade=?, prazo=?, data_conclusao=? WHERE id=?',
    [
      cleanText(status),
      cleanText(obs),
      cleanText(acaoCorretiva),
      cleanText(respNc),
      cleanText(criticidade),
      cleanDate(prazo),
      cleanDate(dataConclusao),
      req.params.itemId
    ]
  );
  await registrarHistorico('checklists_5s', existentes[0].checklist_id, 'EDICAO', req.usuario.nome, `${req.usuario.nome} atualizou uma pendência do checklist 5S nº ${existentes[0].checklist_id}.`);
  const [rows] = await pool.query('SELECT * FROM checklists_5s_itens WHERE id = ?', [req.params.itemId]);
  res.json(mapItem5s(rows[0]));
}));

router.delete('/checklists-5s/:id', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM checklists_5s WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Checklist não encontrado.' });
  await pool.query('DELETE FROM checklists_5s WHERE id = ?', [req.params.id]);
  await registrarHistorico('checklists_5s', req.params.id, 'EXCLUSAO', req.usuario.nome, `${req.usuario.nome} excluiu o checklist 5S nº ${req.params.id} (${rows[0].setor}).`);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// INSPEÇÃO DE RECEBIMENTO
// ---------------------------------------------------------------------------
router.get('/inspecoes-recebimento', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM inspecoes_recebimento ORDER BY criado_em DESC');
  res.json(rows.map(mapRecebimento));
}));

async function proximoIdRecebimento(conn) {
  await conn.query('UPDATE contadores SET valor = valor + 1 WHERE nome = ?', ['inspecao_recebimento']);
  const [rows] = await conn.query('SELECT valor FROM contadores WHERE nome = ?', ['inspecao_recebimento']);
  return `INS-${String(rows[0].valor).padStart(6, '0')}`;
}

router.post('/inspecoes-recebimento', asyncHandler(async (req, res) => {
  const d = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = await proximoIdRecebimento(conn);
    await conn.query(
      `INSERT INTO inspecoes_recebimento
        (id, data_inspecao, fornecedor, fornecedor_outro, resultado_fornecedor, divergencia_fornecedor_json,
         resultado_operacional, divergencia_operacional_json, status_final, usuario_responsavel, data_finalizacao)
        VALUES (?,?,?,?,?,CAST(? AS JSON),?,CAST(? AS JSON),?,?,NOW())`,
      [
        id,
        cleanDate(d.dataInspecao),
        cleanText(d.fornecedor),
        cleanText(d.fornecedorOutro),
        cleanText(d.resultadoFornecedor),
        JSON.stringify(d.divergenciaFornecedor || {}),
        cleanText(d.resultadoOperacional),
        JSON.stringify(d.divergenciaOperacional || {}),
        cleanText(d.statusFinal),
        req.usuario.nome
      ]
    );
    await conn.commit();
    await registrarHistorico('inspecoes_recebimento', id, 'CRIACAO', req.usuario.nome, `${req.usuario.nome} finalizou a inspeção de recebimento ${id} (fornecedor ${d.fornecedor}) — status ${d.statusFinal}.`);
    const [rows] = await pool.query('SELECT * FROM inspecoes_recebimento WHERE id = ?', [id]);
    res.status(201).json(mapRecebimento(rows[0]));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.put('/inspecoes-recebimento/:id', asyncHandler(async (req, res) => {
  const d = req.body || {};
  await pool.query(
    `UPDATE inspecoes_recebimento SET data_inspecao=?, fornecedor=?, fornecedor_outro=?, resultado_fornecedor=?,
      divergencia_fornecedor_json=CAST(? AS JSON), resultado_operacional=?, divergencia_operacional_json=CAST(? AS JSON),
      status_final=?, usuario_responsavel=? WHERE id=?`,
    [
      cleanDate(d.dataInspecao),
      cleanText(d.fornecedor),
      cleanText(d.fornecedorOutro),
      cleanText(d.resultadoFornecedor),
      JSON.stringify(d.divergenciaFornecedor || {}),
      cleanText(d.resultadoOperacional),
      JSON.stringify(d.divergenciaOperacional || {}),
      cleanText(d.statusFinal),
      req.usuario.nome,
      req.params.id
    ]
  );
  await registrarHistorico('inspecoes_recebimento', req.params.id, 'EDICAO', req.usuario.nome, `${req.usuario.nome} editou a inspeção de recebimento ${req.params.id}.`);
  const [rows] = await pool.query('SELECT * FROM inspecoes_recebimento WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Inspeção não encontrada.' });
  res.json(mapRecebimento(rows[0]));
}));

router.delete('/inspecoes-recebimento/:id', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM inspecoes_recebimento WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Inspeção não encontrada.' });
  await pool.query('DELETE FROM inspecoes_recebimento WHERE id = ?', [req.params.id]);
  const fornecedorNome = rows[0].fornecedor === 'OUTROS' ? rows[0].fornecedor_outro : rows[0].fornecedor;
  await registrarHistorico('inspecoes_recebimento', req.params.id, 'EXCLUSAO', req.usuario.nome, `${req.usuario.nome} excluiu a inspeção de recebimento ${req.params.id} (fornecedor ${fornecedorNome}).`);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// HISTÓRICO
// ---------------------------------------------------------------------------
router.get('/historico', asyncHandler(async (req, res) => {
  const { tabela, registroId } = req.query;
  let sql = 'SELECT * FROM historico_alteracoes';
  const params = [];
  const cond = [];
  if (tabela) { cond.push('tabela = ?'); params.push(tabela); }
  if (registroId) { cond.push('registro_id = ?'); params.push(String(registroId)); }
  if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
  sql += ' ORDER BY data_hora DESC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  res.json(rows.map(h => ({
    id: h.id, tabela: h.tabela, registroId: h.registro_id, acao: h.acao,
    usuarioNome: h.usuario_nome, descricao: h.descricao, dataHora: h.data_hora,
  })));
}));

// ---------------------------------------------------------------------------
// LOG DE ACESSOS (somente Gestão)
// ---------------------------------------------------------------------------
router.get('/log-acessos', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM log_acessos ORDER BY data_hora DESC LIMIT 200');
  res.json(rows.map(l => ({ nome: l.usuario_nome, login: l.login, dataHora: l.data_hora, sucesso: !!l.sucesso })));
}));

// ---------------------------------------------------------------------------
// USUÁRIOS (somente Gestão)
// ---------------------------------------------------------------------------
router.get('/usuarios', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM usuarios ORDER BY nome');
  res.json(rows.map(mapUsuario));
}));

router.post('/usuarios', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const { nome, email, login, senha, perfil, setor } = req.body || {};
  if (!nome || !email || !login || !senha) return res.status(400).json({ erro: 'Preencha nome, e-mail, login e senha.' });
  if (senha.length < 8) return res.status(400).json({ erro: 'A senha deve ter ao menos 8 caracteres.' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (nome, email, login, senha_hash, perfil, setor, ativo, precisa_trocar_senha) VALUES (?,?,?,?,?,?,1,1)',
      [cleanText(nome), cleanText(email), String(login).trim().toLowerCase(), hash, cleanText(perfil), cleanText(setor)]
    );
    await registrarHistorico('usuarios', result.insertId, 'CRIACAO', req.usuario.nome, `${req.usuario.nome} criou o usuário ${nome} (${login}).`);
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [result.insertId]);
    res.status(201).json(mapUsuario(rows[0]));
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    throw e;
  }
}));

router.put('/usuarios/:id', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const { nome, email, perfil, setor, novaSenha } = req.body || {};
  if (novaSenha && novaSenha.length < 8) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 8 caracteres.' });
  if (novaSenha) {
    const hash = await bcrypt.hash(novaSenha, 10);
    await pool.query('UPDATE usuarios SET nome=?, email=?, perfil=?, setor=?, senha_hash=?, precisa_trocar_senha=1 WHERE id=?',
      [cleanText(nome), cleanText(email), cleanText(perfil), cleanText(setor), hash, req.params.id]);
  } else {
    await pool.query('UPDATE usuarios SET nome=?, email=?, perfil=?, setor=? WHERE id=?',
      [cleanText(nome), cleanText(email), cleanText(perfil), cleanText(setor), req.params.id]);
  }
  await registrarHistorico('usuarios', req.params.id, 'EDICAO', req.usuario.nome, `${req.usuario.nome} editou o usuário ${nome}.`);
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  res.json(mapUsuario(rows[0]));
}));

router.put('/usuarios/:id/ativo', requireRole('GESTAO'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const novoAtivo = rows[0].ativo ? 0 : 1;
  await pool.query('UPDATE usuarios SET ativo=? WHERE id=?', [novoAtivo, req.params.id]);
  await registrarHistorico('usuarios', req.params.id, 'EDICAO', req.usuario.nome, `${req.usuario.nome} ${novoAtivo ? 'reativou' : 'inativou'} o usuário ${rows[0].nome}.`);
  const [atualizado] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
  res.json(mapUsuario(atualizado[0]));
}));

module.exports = router;