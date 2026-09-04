import { campeonatosCache, campeonatoAtivoKey, db } from './state.js';

export function calcularClassificacaoBancoSeparado(camp) {
    let provasSep = camp.bateriasBancoSeparado || {};
    let conf = camp.configuracoes || {};
    let tabelaPontosArr = conf.pontuacaoTabela || [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    let pilotoPontos = {};

    Object.values(provasSep).forEach(arq => {
        if (arq && arq.dados) {
            arq.dados.forEach(d => {
                if (!d.laps || d.laps.length === 0) return;
                let posNum = parseInt(String(d.pos).replace('º', '').trim(), 10);
                let pts = (posNum > 0 && posNum <= tabelaPontosArr.length) ? tabelaPontosArr[posNum - 1] : 0;
                if (pts > 0) {
                    let pNome = d.piloto;
                    if (!pilotoPontos[pNome]) pilotoPontos[pNome] = 0;
                    pilotoPontos[pNome] += pts;
                }
            });
        }
    });

    let ranking = [];
    for (let [piloto, pontos] of Object.entries(pilotoPontos)) {
        ranking.push({ piloto, pontos });
    }
    ranking.sort((a, b) => b.pontos - a.pontos);
    return ranking;
}