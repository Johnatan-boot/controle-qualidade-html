/* ==================== CLIENTE DE API ====================
   Substitui o antigo modelo "tudo em memória / localStorage" por chamadas reais
   ao backend (que por sua vez fala com o MySQL). Toda função `salvar*`/`recarregar*`
   deste arquivo é usada pelo check-list-four.js no lugar da antiga persistência local. */
async function apiFetch(caminho, opcoes){
  const resposta = await fetch(caminho, { credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...opcoes });
  if(resposta.status === 401){ await doLogout(); throw new Error('Sua sessão expirou. Faça login novamente.'); }
  let dados = null;
  try{ dados = await resposta.json(); }catch(e){ /* corpo vazio, ok */ }
  if(!resposta.ok){ throw new Error((dados && dados.erro) || 'Não foi possível concluir a operação no servidor.'); }
  return dados;
}
function apiGet(caminho){ return apiFetch(caminho); }
function apiPost(caminho, corpo){ return apiFetch(caminho, { method:'POST', body: JSON.stringify(corpo || {}) }); }
function apiPut(caminho, corpo){ return apiFetch(caminho, { method:'PUT', body: JSON.stringify(corpo || {}) }); }
function apiDelete(caminho){ return apiFetch(caminho, { method:'DELETE' }); }

function substituirArray(destino, itens){ destino.length = 0; destino.push(...(itens || [])); }

async function recarregarProdutos(){ substituirArray(PRODUTOS, await apiGet('/api/produtos')); }
async function recarregarDivergenciasProdutos(){ substituirArray(divergencias, await apiGet('/api/divergencias-produtos')); }
async function recarregarInspecoesEstoque(){ substituirArray(inspecoesEstoque, await apiGet('/api/inspecoes-estoque')); }
async function recarregarChecklists5s(){ substituirArray(checklist5s, await apiGet('/api/checklists-5s')); }
async function recarregarInspecoesRecebimento(){ substituirArray(inspecoesRecebimento, await apiGet('/api/inspecoes-recebimento')); }
async function recarregarHistorico(){
  const linhas = await apiGet('/api/historico');
  substituirArray(historicoAlteracoes, linhas.map(h => ({ ...h, dataHora: new Date(h.dataHora) })));
}
async function recarregarUsuarios(){
  if(!podeGerenciarPermissoes()) return;
  substituirArray(USUARIOS, await apiGet('/api/usuarios'));
}
async function recarregarLogAcessos(){
  if(!podeGerenciarPermissoes()) return;
  substituirArray(LOG_ACESSO, await apiGet('/api/log-acessos'));
}
async function carregarTudoDoServidor(){
  await Promise.all([
    recarregarProdutos(), recarregarDivergenciasProdutos(), recarregarInspecoesEstoque(),
    recarregarChecklists5s(), recarregarInspecoesRecebimento(), recarregarHistorico(),
    recarregarUsuarios(), recarregarLogAcessos(),
  ]);
}

function alternarVisibilidadeSenha(inputId, btnEl){
  const input = document.getElementById(inputId);
  if(!input) return;
  const oculto = input.type === 'password';
  input.type = oculto ? 'text' : 'password';
  if(btnEl) btnEl.textContent = oculto ? '🙈' : '👁️';
}
