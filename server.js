const path = require("path");
const express = require("express");
const mysql = require("mysql2"); // Usaremos mysql2 para melhor performance e suporte a Promises

const app = express();

// Middleware para interpretar JSON nas requisições (essencial para a API)
app.use(express.json());

// Servir arquivos estáticos (front-end na pasta 'public')
app.use(express.static(path.join(__dirname, 'public')));

// Configuração da Conexão com o MySQL
// O Render / Clever Cloud fornecem variáveis de ambiente (process.env). 
// Caso rode localmente, usamos valores padrão.
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "qa_kingstar",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testando a conexão
db.getConnection((err, connection) => {
  if (err) {
    console.error("Erro ao conectar ao MySQL:", err.message);
  } else {
    console.log("Conectado ao MySQL com sucesso!");
    connection.release();
  }
});

// ==================== ROTAS DE PÁGINAS (FRONT-END) ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'check-list.html'));
});

// ==================== ROTAS DA API (CRUD DE DIVERGÊNCIAS) ====================

// Listar todas as divergências
app.get('/api/divergencias', (req, res) => {
  db.query("SELECT * FROM divergencias ORDER BY id DESC", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao buscar divergências" });
    }
    res.json(results);
  });
});

// Criar nova divergência
app.post('/api/divergencias', (req, res) => {
  const { setor, sku, descricao, fornecedor, valorUnit, qtd, codDiv, status, responsavel, prazoCorrecao } = req.body;
  
  const query = `
    INSERT INTO divergencias (setor, sku, descricao, fornecedor, valorUnit, qtd, codDiv, status, responsavel, data, prazoCorrecao) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)
  `;
  
  db.query(query, [setor, sku, descricao, fornecedor, valorUnit, qtd, codDiv, status, responsavel, prazoCorrecao], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao salvar divergência" });
    }
    res.status(201).json({ id: result.insertId, message: "Divergência criada com sucesso" });
  });
});

// Atualizar divergência
app.put('/api/divergencias/:id', (req, res) => {
  const { id } = req.params;
  const { setor, sku, descricao, fornecedor, valorUnit, qtd, codDiv, status, responsavel, prazoCorrecao } = req.body;

  const query = `
    UPDATE divergencias 
    SET setor = ?, sku = ?, descricao = ?, fornecedor = ?, valorUnit = ?, qtd = ?, codDiv = ?, status = ?, responsavel = ?, prazoCorrecao = ?
    WHERE id = ?
  `;

  db.query(query, [setor, sku, descricao, fornecedor, valorUnit, qtd, codDiv, status, responsavel, prazoCorrecao, id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao atualizar divergência" });
    }
    res.json({ message: "Divergência atualizada com sucesso" });
  });
});

// Excluir divergência
app.delete('/api/divergencias/:id', (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM divergencias WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao excluir divergência" });
    }
    res.json({ message: "Divergência excluída com sucesso" });
  });
});

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});