-- Inserção de Usuários Padrão
INSERT INTO usuarios (nome, login, email, perfil, setor, ultimo, ativo) 
VALUES 
('Administrador Geral', 'gestao', 'gestao@kingstarcolchoes.com.br', 'GESTAO', '—', NOW(), TRUE),
('Admin CD', 'admin', 'admin@kingstarcolchoes.com.br', 'ADMINISTRADOR', '—', NOW(), TRUE),
('Operador Recebimento', 'operador', 'operador@kingstarcolchoes.com.br', 'OPERADOR', 'RECEBIMENTO', NOW(), TRUE)
ON DUPLICATE KEY UPDATE login=login;

-- Inserção de uma Divergência de Exemplo para Teste
INSERT INTO divergencias (setor, sku, descricao, fornecedor, valorUnit, qtd, codDiv, status, responsavel, data, prazoCorrecao)
VALUES 
('MERCADO', 'BUP096X203', 'Colchão com defeito na costura lateral', 'Fornecedor Exemplo LTDA', 450.00, 1, '1-DEFEITO DE FABRICAÇÃO', 'PENDENTE', 'Administrador Geral', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 5 DAY));