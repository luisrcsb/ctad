/* CTAD — elo.js (Fase 3)
   Sistema ELO compartilhado. Extraído do desafios.js sem mudança de
   comportamento: mesmas constantes, mesma fórmula, mesmo arredondamento.
   Carregado ANTES de desafios.js, pilotos.js e do inline — todos usam
   estes bindings globais.
   - ELO_INICIAL = 1000, ELO_K = 32
   - eloEsperado(eloA, eloB): probabilidade esperada de A vencer B
   - calcularElo(eloA, eloB, resultadoA): novo ELO de A (resultado 1/0.5/0)
   - getEloPiloto(nome): ELO atual no pilotosMetadadosCache ou ELO_INICIAL */

const ELO_INICIAL = 1000;
const ELO_K = 32;

function eloEsperado(eloA, eloB) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function calcularElo(eloA, eloB, resultadoA) {
    return Math.round(eloA + ELO_K * (resultadoA - eloEsperado(eloA, eloB)));
}

function getEloPiloto(nome) {
    if (typeof pilotosMetadadosCache === 'undefined' || !pilotosMetadadosCache) return ELO_INICIAL;
    let key = String(nome).replace(/[.#$\/\[\]]/g, '_');
    let meta = pilotosMetadadosCache[key];
    if (meta && typeof meta.elo === 'number') return meta.elo;
    return ELO_INICIAL;
}
