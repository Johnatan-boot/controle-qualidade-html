// Envolve toda rota assíncrona: se a Promise rejeitar (erro de banco, bug,
// dado inesperado etc.), o erro é entregue ao Express via next(err) em vez de
// virar uma "unhandled promise rejection" — que em Node derruba o processo
// inteiro. Sem isso, um único erro num único request tirava o servidor do ar
// para todo mundo até alguém reiniciar manualmente.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
