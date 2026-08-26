# Q.A. King Star — versão Node/Express + MySQL

Este pacote corrige o sistema que estava hospedado no Render (com banco MySQL do
Clever Cloud). Antes de qualquer coisa, leia o aviso de segurança abaixo.

## ⚠️ AÇÃO URGENTE: troque a senha do banco de dados

O arquivo `public/index.txt` do projeto antigo continha o usuário e a senha reais
do MySQL do Clever Cloud, em texto puro. Como esse arquivo ficava dentro da pasta
`public/`, ele era servido publicamente pelo próprio site (qualquer pessoa que
soubesse a URL, ex. `https://seu-app.onrender.com/index.txt`, conseguia ver a
senha do banco). Esse arquivo **não foi incluído neste pacote** e o problema que
o causava (servir a pasta toda como estática sem revisar o conteúdo) foi corrigido,
mas isso não desfaz a exposição que já aconteceu.

**Antes de colocar esta nova versão no ar, entre no painel do Clever Cloud e troque
a senha do banco de dados (ou recrie o add-on).** Depois disso, atualize as
variáveis de ambiente no Render com as novas credenciais. Isso é independente do
resto deste projeto — faça essa troca mesmo que ainda não vá publicar o código novo.

## O que estava causando a falta de sincronização

O sistema antigo era só HTML/CSS/JavaScript rodando no navegador: todos os dados
(produtos, divergências, inspeções, checklists, usuários) ficavam em variáveis
JavaScript e no `localStorage` de cada navegador. O `server.js` existia, mas só
tinha rotas para uma única tabela (`divergencias`) e nada no front-end chamava
essas rotas — por isso cada computador/navegador via só os dados digitados nele
mesmo, e nada era realmente salvo em banco.

Esta versão corrige isso de ponta a ponta:

- Criado um schema MySQL completo (`db/schema.sql`) com todas as tabelas:
  produtos, divergências de produtos, inspeções de estoque (com itens),
  checklists 5S (com itens), inspeções de recebimento, usuários, histórico de
  alterações e log de acessos.
- Criada uma API REST completa em Express (`routes/api.js`) cobrindo todas essas
  entidades (GET/POST/PUT/DELETE conforme o caso).
- O front-end (`public/scripts/check-list-four.js`) foi reescrito para carregar
  os dados do servidor ao entrar (`carregarTudoDoServidor()`) e para salvar tudo
  via `fetch` (arquivo novo `public/scripts/api-client.js`), em vez de guardar
  tudo só no navegador.
- Resultado: qualquer computador que acessar o link vê os mesmos dados, em tempo
  real, porque todos leem e escrevem no mesmo banco MySQL.

## Login obrigatório (guarda de rotas)

Conforme pedido, agora só usuários cadastrados no sistema conseguem acessar:

- A tela inicial sempre exige login real (usuário + senha), validado contra a
  tabela `usuarios` (senhas guardadas com hash bcrypt, nunca em texto puro).
- Todas as rotas de `/api/*` (exceto login) exigem um token de sessão válido
  (`requireAuth`, em `middleware/auth.js`). Se não houver login válido (sem
  cookie de sessão, cookie expirado, ou usuário desativado), a API responde
  `401` e o próprio `api-client.js` detecta isso e devolve a pessoa para a tela
  de login automaticamente.
- Algumas ações são restritas por perfil (`requireRole('GESTAO')`), como excluir
  inspeções e gerenciar usuários — reaproveitando a mesma regra já usada na
  versão anterior deste sistema.
- Cada usuário criado pelo `db/seed.js` recebe uma senha provisória e é
  obrigado a trocá-la no primeiro acesso (campo `precisa_trocar_senha`).

## Usuários iniciais (senha provisória)

Depois de rodar o seed (veja abaixo), os logins iniciais são:

| Login      | Perfil          | Senha provisória (padrão) |
|------------|-----------------|----------------------------|
| gestao     | GESTAO          | `KingStar@2026`            |
| admin      | ADMINISTRADOR   | `KingStar@2026`            |
| operador   | OPERADOR        | `KingStar@2026`            |

Você pode sobrescrever essas senhas padrão definindo `SEED_SENHA_GESTAO`,
`SEED_SENHA_ADMIN` e `SEED_SENHA_OPERADOR` no `.env` antes de rodar o seed.
Todos são obrigados a trocar a senha no primeiro login.

## Como rodar localmente

```bash
npm install
cp .env.example .env
# edite o .env com os dados do seu banco MySQL local

node db/setup.js   # cria as tabelas (idempotente, pode rodar de novo sem problema)
node db/seed.js    # cria os 3 usuários iniciais + produtos de exemplo (só roda se a tabela usuarios estiver vazia)

npm start          # inicia o servidor em http://localhost:3000
```

## Como publicar no Render + Clever Cloud

1. Troque a senha do banco no Clever Cloud (ver aviso acima) antes de qualquer coisa.
2. No Render, crie um "Web Service" apontando para este repositório.
   - Build command: `npm install`
   - Start command: `npm start`
3. Conecte o add-on MySQL do Clever Cloud ao serviço do Render (isso injeta
   automaticamente as variáveis `MYSQL_ADDON_HOST`, `MYSQL_ADDON_DB`,
   `MYSQL_ADDON_USER`, `MYSQL_ADDON_PASSWORD`, `MYSQL_ADDON_PORT` — o
   `db/pool.js` já sabe usá-las, não precisa configurar nada a mais).
4. Nas variáveis de ambiente do Render, defina também:
   - `JWT_SECRET` — um valor longo e aleatório (gere com
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `COOKIE_SECURE=true` (o Render serve em HTTPS)
   - Opcionalmente `SEED_SENHA_GESTAO`/`SEED_SENHA_ADMIN`/`SEED_SENHA_OPERADOR`
     antes de rodar o seed pela primeira vez.
5. Depois do primeiro deploy, rode uma vez (via o shell do Render, ou localmente
   apontando para o banco de produção com as credenciais novas):
   ```bash
   node db/setup.js
   node db/seed.js
   ```
6. Acesse a URL do Render, faça login com um dos usuários iniciais, troque a
   senha quando solicitado, e cadastre os demais usuários da equipe pela tela
   de "Permissões/Usuários" (perfil GESTAO).

## O que foi testado

- Login com usuário/senha reais (rejeitando credenciais inválidas).
- Troca de senha obrigatória no primeiro acesso.
- Acesso a `/api/*` sem login retorna `401` (guarda de rotas funcionando).
- Duas sessões de navegador separadas (simulando dois computadores) veem os
  mesmos produtos, divergências e indicadores, confirmando que os dados vêm do
  banco compartilhado e não mais do armazenamento local do navegador.
- Estrutura de cadastro de produtos, inspeções e dashboards carregando dados
  reais do MySQL após o login.

## Outras correções incluídas

- Removida a duplicidade de `check-list-two.js` (era uma cópia idêntica de
  `check-list-one.js`, ambos carregando a mesma biblioteca de gráficos duas vezes).
- Adicionado tratamento de `/favicon.ico` para evitar erro 404 no console.
- Adicionado botão de mostrar/ocultar senha nos campos de senha.
- Adicionados botões de excluir inspeções (Estoque, 5S e Recebimento),
  restritos ao perfil Gestão.

## Correções desta revisão (depois do primeiro teste em produção)

Depois do primeiro deploy real, apareceram dois problemas — ambos corrigidos aqui:

1. **Servidor caindo inteiro por causa de um único erro.** Nenhuma rota da API
   tinha tratamento de erro: se qualquer chamada ao banco falhasse por qualquer
   motivo (tabela ausente, dado inesperado, etc.), o processo Node inteiro
   morria — por isso o site ficava fora do ar ("ERR_CONNECTION_REFUSED") até
   alguém reiniciar manualmente. Foi exatamente isso que causou o travamento
   visto com `bcrypt.compare` recebendo um hash de senha ausente. Agora:
   - Toda rota é protegida por um `asyncHandler` (`middleware/asyncHandler.js`)
     que transforma qualquer erro numa resposta HTTP 500 normal, sem derrubar
     o servidor.
   - O login rejeita explicitamente usuários sem hash de senha válido (401),
     em vez de travar tentando comparar a senha.
   - Foi adicionada uma rede de segurança extra em `server.js` que registra no
     log qualquer erro que escape por algum outro caminho, sem matar o processo.
2. **Tabela em falta em produção (`log_acessos doesn't exist`).** Isso indicava
   que o `schema.sql` não tinha sido aplicado no banco de produção depois do
   deploy. Agora o próprio `server.js` roda o schema automaticamente a cada
   boot (é seguro, todos os comandos são `CREATE TABLE IF NOT EXISTS`) — não é
   mais possível esquecer esse passo.
3. **Sessão não era retomada ao recarregar a página (F5).** O front-end nunca
   perguntava ao servidor "ainda estou logado?" ao abrir a página — por isso,
   mesmo com o cookie de sessão válido por 8h, um F5 sempre te devolvia pra
   tela de login. Agora a página chama `/api/auth/me` automaticamente ao
   carregar e retoma a sessão se o cookie ainda for válido.

## Banco de produção — limite de conexões

A Clever Cloud utilizada neste projeto limita o usuário MySQL a 5 conexões simultâneas.
O pool do backend foi ajustado para usar no máximo 2 conexões por padrão (configurável por
`DB_CONNECTION_LIMIT`, limitado pelo código a 4), evitando `ER_USER_LIMIT_REACHED`.

Também foi adicionado `GET /health` para validar a conexão com o banco sem autenticação.

## Novidades desta revisão (categoria, busca, paginação, relatório e alertas)

- **Campo "Categoria" nos produtos.** Nova coluna `categoria` em `produtos` e
  `divergencias_produtos` (aplicada automaticamente no boot do servidor, mesmo
  em banco de produção já existente — não precisa rodar nada manual). Ao
  cadastrar um produto (manual ou por planilha), a categoria é lida de uma
  coluna "Categoria" da planilha quando ela existir; se não existir (ou a
  linha vier em branco), o sistema deriva sozinho a categoria a partir das 3
  primeiras letras do código do produto (SKU) — ex.: "CMP158X198..." → "CMP",
  "CEP..." → "CEP". O mesmo vale para o cadastro manual: se o campo Categoria
  ficar em branco, é preenchido automaticamente a partir do SKU.
- **Busca ampliada.** Os autocompletes de SKU (na Inspeção de Produtos) e a
  busca do Cadastro de Produtos agora também encontram produtos por
  categoria e fornecedor (texto) e por valor unitário (digitando o preço,
  ex.: "185,85").
- **Paginação no Cadastro de Produtos.** Antes a lista simplesmente cortava
  em 200 linhas; agora mostra 10 produtos por página, com botões Anterior/
  Próxima e números de página clicáveis.
- **3 colunas novas no Relatório Consolidado de Qualidade** (aba Indicadores
  → Relatórios): Setor, Quantidade (nº de divergências/itens não conformes
  do registro — para Inspeção de Produtos usa a quantidade real do item) e
  Observação. Presentes na tabela, no CSV exportado e na impressão/PDF.
- **SweetAlert2 em vez de alert()/confirm() nativos.** Toda confirmação de
  exclusão e toda mensagem de erro do sistema agora usa modais do
  SweetAlert2 (biblioteca embutida localmente em
  `public/scripts/sweetalert2.min.js`, sem depender de CDN externo),
  seguindo as cores do sistema.

## Busca do Cadastro de Produtos refeita (leitura completa da Descrição)

A busca anterior comparava a Descrição (e os demais campos) como um texto
único e exigia que os termos digitados aparecessem exatamente na mesma
ordem e "colados" (sem espaços) dentro desse texto — por isso buscar
"EVEREST MOLA" não encontrava o produto "BI MOLA EVEREST ...", mesmo sendo
o mesmo produto com as palavras em outra ordem.

A busca foi reescrita do zero:

- O texto digitado é dividido em termos (palavras e, separadamente, valores
  decimais como "185,85", reconhecidos mesmo com vírgula).
- Cada termo pode aparecer em qualquer lugar entre os campos Descrição,
  Código (SKU), Categoria, Fornecedor, Grupo e Família — em qualquer ordem
  — e **todos** os termos digitados precisam ser encontrados (busca "E",
  não "OU"), então buscas com várias palavras ficam mais precisas.
- Um termo numérico decimal (ex.: "185,85" ou "560,56") é comparado contra
  o valor unitário do produto, permitindo buscar por preço junto com
  palavras da descrição (ex.: "VELUDO 560,56").
- Os resultados são ordenados por relevância: produtos cujo termo aparece
  na **Descrição** aparecem primeiro, seguidos por Código, depois
  Categoria/Fornecedor e por fim Grupo/Família.

Testado com a planilha real de produtos enviada (11.605 itens): a
importação foi conferida campo a campo (SKU, Descrição, Grupo, Valor,
Fornecedor, Família), o produto de exemplo `BUP096X203X36AFDBOXPREMVELCHO`
foi localizado corretamente com termos fora de ordem
("EVEREST MOLA" → "BI MOLA EVEREST..."), buscas combinando fornecedor +
palavra da descrição, e buscas por preço (isolado e combinado com
palavra) — todas retornando os resultados esperados.

**Observação:** 344 códigos (SKU) da planilha real começam com número em
vez de letra (ex.: "31M088X188X34..."). Como a categoria automática é
derivada das letras iniciais do código, esses itens ficam sem categoria
derivada quando a planilha não traz uma coluna "Categoria" preenchida
para eles. Isso não impede a busca (o produto continua sendo encontrado
normalmente pela Descrição, Código etc.), mas fica registrado aqui caso
queira que a regra de derivação de categoria seja ajustada para esses
casos também.
