-- ============================================================================
-- Q.A. King Star — Esquema do banco de dados (MySQL / Clever Cloud)
-- ============================================================================
-- Convertido a partir do modelo relacional já usado no sistema (mesmos nomes
-- de campos que o front-end espera). Compatível com MySQL 5.7+/8 e MariaDB.
-- ============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  login         VARCHAR(60) NOT NULL UNIQUE,
  senha_hash    VARCHAR(255) NOT NULL,
  perfil        ENUM('GESTAO','ADMINISTRADOR','OPERADOR') NOT NULL,
  setor         VARCHAR(100) NULL,
  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  precisa_trocar_senha TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acesso DATETIME NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS produtos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(120) NOT NULL UNIQUE,
  descricao     VARCHAR(255) NOT NULL,
  grupo         VARCHAR(100) NULL,
  preco         DECIMAL(10,2) NOT NULL DEFAULT 0,
  fornecedor    VARCHAR(150) NULL,
  familia       VARCHAR(150) NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS divergencias_produtos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  setor            VARCHAR(60) NOT NULL,
  sku              VARCHAR(120) NOT NULL,
  descricao        VARCHAR(255) NULL,
  fornecedor       VARCHAR(150) NULL,
  valor_unit       DECIMAL(10,2) NOT NULL DEFAULT 0,
  qtd              INT NOT NULL DEFAULT 1,
  cod_divergencia  VARCHAR(120) NOT NULL,
  outro_cod_div    VARCHAR(255) NULL,
  status           ENUM('PENDENTE','EM_ESPERA','CORRIGIDO') NOT NULL DEFAULT 'PENDENTE',
  responsavel      VARCHAR(150) NULL,
  data             DATE NOT NULL,
  prazo_correcao   DATE NULL,
  data_conclusao   DATE NULL,
  observacao       TEXT NULL,
  fotos_json       JSON NOT NULL,
  criado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_divergencias_produtos_status (status),
  INDEX idx_divergencias_produtos_data (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspecoes_estoque (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  data        DATE NOT NULL,
  responsavel VARCHAR(150) NULL,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspecoes_estoque_itens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  inspecao_id    INT NOT NULL,
  ordem          INT NOT NULL,
  tipo           VARCHAR(30) NOT NULL,
  divergencia    VARCHAR(150) NOT NULL,
  outro_desc     VARCHAR(255) NULL,
  observacao     TEXT NULL,
  status         ENUM('PENDENTE','EM_ESPERA','CORRIGIDO') NOT NULL DEFAULT 'PENDENTE',
  data_conclusao DATE NULL,
  fotos_json     JSON NOT NULL,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_estoque_itens_inspecao FOREIGN KEY (inspecao_id) REFERENCES inspecoes_estoque(id) ON DELETE CASCADE,
  INDEX idx_inspecoes_estoque_itens_inspecao (inspecao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklists_5s (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  setor        VARCHAR(60) NOT NULL,
  turno        VARCHAR(30) NULL,
  responsavel  VARCHAR(150) NULL,
  data         DATE NOT NULL,
  conformidade DECIMAL(5,2) NOT NULL DEFAULT 0,
  anexos_json  JSON NOT NULL,
  criado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checklists_5s_itens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  checklist_id   INT NOT NULL,
  ordem          INT NOT NULL,
  senso          VARCHAR(20) NOT NULL,
  descricao      VARCHAR(255) NOT NULL,
  resp           ENUM('CONFORME','NAO_CONFORME','NA') NOT NULL,
  observacao     TEXT NULL,
  acao_corretiva TEXT NULL,
  responsavel_nc VARCHAR(150) NULL,
  criticidade    VARCHAR(30) NULL,
  status         ENUM('PENDENTE','EM_ESPERA','CORRIGIDO') NULL,
  prazo          DATE NULL,
  data_conclusao DATE NULL,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_5s_itens_checklist FOREIGN KEY (checklist_id) REFERENCES checklists_5s(id) ON DELETE CASCADE,
  INDEX idx_checklists_5s_itens_checklist (checklist_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspecoes_recebimento (
  id                           VARCHAR(20) PRIMARY KEY,
  data_inspecao                DATETIME NOT NULL,
  fornecedor                   VARCHAR(150) NOT NULL,
  fornecedor_outro             VARCHAR(150) NULL,
  resultado_fornecedor         ENUM('conforme','conforme_ressalva','nao_conforme') NOT NULL,
  divergencia_fornecedor_json  JSON NOT NULL,
  resultado_operacional        ENUM('conforme','conforme_ressalva','nao_conforme') NOT NULL,
  divergencia_operacional_json JSON NOT NULL,
  status_final                 ENUM('conforme','conforme_ressalva','nao_conforme') NOT NULL,
  usuario_responsavel          VARCHAR(150) NULL,
  data_finalizacao             DATETIME NULL,
  criado_em                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inspecoes_recebimento_data (data_inspecao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- contador atômico para gerar os ids "INS-000001", "INS-000002", ... com segurança
-- mesmo com várias pessoas finalizando inspeções de recebimento ao mesmo tempo.
CREATE TABLE IF NOT EXISTS contadores (
  nome    VARCHAR(60) PRIMARY KEY,
  valor   INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO contadores (nome, valor) VALUES ('inspecao_recebimento', 0)
  ON DUPLICATE KEY UPDATE nome = nome;

CREATE TABLE IF NOT EXISTS historico_alteracoes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tabela        VARCHAR(60) NOT NULL,
  registro_id   VARCHAR(60) NOT NULL,
  acao          ENUM('CRIACAO','EDICAO','EXCLUSAO') NOT NULL,
  usuario_nome  VARCHAR(150) NOT NULL,
  descricao     TEXT NOT NULL,
  data_hora     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_historico_tabela_registro (tabela, registro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS log_acessos (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  usuario_nome VARCHAR(150) NOT NULL,
  login        VARCHAR(60) NOT NULL,
  sucesso      TINYINT(1) NOT NULL,
  data_hora    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
