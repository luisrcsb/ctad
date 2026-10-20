/* CTAD — elo-recalc.js
   Recálculo automático do ranking ELO geral.

   Fórmula (mesma de elo.js/desafios.js: K=32, base 1000):
   1) Fase BATERIAS: cada bateria (excluindo treinos) conta 1 jogo por piloto
      contra a MÉDIA do ELO dos demais presentes; venceu = 1 (posição "1º"),
      senão 0. Baterias em ordem cronológica.
   2) Fase DESAFIOS: replay dos desafios decididos em ordem de `decididoEm`,
      com exatamente a fórmula de `aplicarDecisaoDesafio` — assim um recálculo
      NUNCA apaga os ajustes feitos por desafios, ele os reproduz.

   Nomes: unifica variantes pelo nó `mesclagensPilotos` ("DJ" -> "DJ Edgard")
   + fallback de aliases, e grava na chave oficial de `pilotosMetadados`
   (preservando maiúsculas).

   Usado pelo site (`window.recalcularEloGeral`, disparado após upload/exclusão/
   reprocessamento de baterias e pelo botão "Recalcular ELO" da administração)
   e pelo robô de upload (`require('../elo-recalc.js')` → calcularRankingElo). */

(function (global) {
    'use strict';

    const ELO_INICIAL_R = (typeof ELO_INICIAL !== 'undefined') ? ELO_INICIAL : 1000;
    const ELO_K_R = (typeof ELO_K !== 'undefined') ? ELO_K : 32;

    // Fallback caso as mesclagens oficiais não cubram o caso (PDFs antigos
    // chamavam o DJ Edgard só de "DJ"). Aplicado DEPOIS das mesclagens.
    const ALIAS_ELO = { dj: 'dj edgard', deejay: 'dj edgard', 'edgard camilo': 'dj edgard' };

    // Chave de identidade (minúsculas) — mesma regra de keyIdentidadeDesafio.
    function keyElo(nome) {
        return String(nome == null ? '' : nome).trim().toLowerCase().replace(/[.#$\/\[\]]/g, '_');
    }

    function tsDaBateria(chave, reg) {
        let m = String(chave).match(/(\d{13})/);
        if (m) return Number(m[1]);
        if (reg && typeof reg.id === 'number') return reg.id;
        if (reg && typeof reg.uploadedAt === 'number') return reg.uploadedAt;
        return 0;
    }

    function posNumElo(p) {
        return parseInt(String(p == null ? '' : p).replace(/\D/g, '')) || 99;
    }

    function construirCanonico(mesclagens) {
        let mapa = {};
        Object.keys(mesclagens || {}).forEach(k => {
            let destino = keyElo(mesclagens[k]);
            if (destino) mapa[keyElo(k)] = destino;
        });
        return function (nome) {
            let k = keyElo(nome);
            if (mapa[k]) k = mapa[k];
            if (ALIAS_ELO[k]) k = ALIAS_ELO[k];
            return k;
        };
    }

    /* Cálculo puro (sem tocar no banco) — testável em Node.
       Entradas: objetos crus de baterias, desafios, mesclagensPilotos e
       pilotosMetadados. Saída: ranking completo + só as alterações a gravar. */
    function calcularRankingElo(baterias, desafios, mesclagens, metadados) {
        let canon = construirCanonico(mesclagens);

        // Nome de exibição/chave: chave oficial de pilotosMetadados > apelido >
        // nome original visto pela primeira vez.
        let exibicao = {};
        let apelidos = {};
        Object.keys(metadados || {}).forEach(k => {
            exibicao[keyElo(k)] = k;
            let ap = metadados[k] && metadados[k].apelido;
            if (ap && String(ap).trim()) apelidos[keyElo(ap)] = k;
        });
        let primeiroVisto = {};

        let elo = {};
        let stats = {}; // corridas/vitórias contadas nas baterias (desafios não contam)
        function garantir(pCanon, nomeOriginal) {
            if (elo[pCanon] == null) {
                elo[pCanon] = ELO_INICIAL_R;
                stats[pCanon] = { corridas: 0, vitorias: 0 };
                let nome = exibicao[pCanon] || apelidos[pCanon] || nomeOriginal || pCanon;
                exibicao[pCanon] = String(nome).replace(/[.#$\/\[\]]/g, '_');
            }
            return pCanon;
        }

        // 1) Baterias — cronológicas; treinos ficam de fora.
        let lista = Object.keys(baterias || {})
            .filter(chave => {
                let r = baterias[chave] || {};
                return !/treino/i.test(chave + ' ' + (r.sessao || ''));
            })
            .map(chave => ({
                ts: tsDaBateria(chave, baterias[chave]),
                dados: (baterias[chave] || {}).dados || []
            }))
            .sort((a, b) => a.ts - b.ts);

        let bateriasContadas = 0;
        lista.forEach(b => {
            let presentes = [];
            b.dados.forEach(d => {
                let nome = d && d.piloto ? String(d.piloto).trim() : '';
                if (!nome) return;
                let c = canon(nome);
                if (!primeiroVisto[c]) primeiroVisto[c] = nome;
                if (presentes.indexOf(c) === -1) presentes.push(c);
            });
            if (presentes.length < 2) return;
            bateriasContadas++;
            let antes = {};
            presentes.forEach(p => { antes[p] = elo[garantir(p, primeiroVisto[p])]; });
            presentes.forEach(p => {
                let adv = presentes.filter(a => a !== p);
                let eloAdv = adv.reduce((s, a) => s + antes[a], 0) / adv.length;
                let esperado = 1 / (1 + Math.pow(10, (eloAdv - antes[p]) / 400));
                let venceu = b.dados.some(d => d && canon(d.piloto || '') === p && posNumElo(d.pos) === 1);
                elo[p] = Math.round(elo[p] + ELO_K_R * ((venceu ? 1 : 0) - esperado));
                stats[p].corridas++;
                if (venceu) stats[p].vitorias++;
            });
        });

        // 2) Desafios decididos — replay na ordem das decisões (mesma fórmula
        //    de aplicarDecisaoDesafio: vencedor x média dos adversários).
        let decisoes = Object.keys(desafios || {})
            .map(id => desafios[id] || {})
            .filter(d => d.status === 'decidido' && d.vencedor && !d.expirado && typeof d.decididoEm === 'number')
            .sort((a, b) => (a.decididoEm || 0) - (b.decididoEm || 0));

        decisoes.forEach(d => {
            let todos = [d.desafiante, ...(d.desafiados || [])]
                .map(canon)
                .filter((v, i, arr) => v && arr.indexOf(v) === i);
            if (todos.length < 2) return;
            let vencedor = canon(d.vencedor);
            let antes = {};
            todos.forEach(p => { antes[p] = elo[garantir(p)]; });
            todos.forEach(p => {
                let adv = todos.filter(a => a !== p);
                let eloAdv = adv.reduce((s, a) => s + antes[a], 0) / adv.length;
                let esperado = 1 / (1 + Math.pow(10, (eloAdv - antes[p]) / 400));
                let res = (p === vencedor) ? 1 : 0;
                elo[p] = Math.round(elo[p] + ELO_K_R * (res - esperado));
            });
        });

        let ranking = Object.keys(elo)
            .map(c => ({
                canon: c,
                nome: exibicao[c] || c,
                elo: elo[c],
                corridas: stats[c].corridas,
                vitorias: stats[c].vitorias
            }))
            .sort((a, b) => b.elo - a.elo);

        let alteracoes = [];
        ranking.forEach(r => {
            let meta = metadados && metadados[r.nome];
            let atual = (meta && typeof meta.elo === 'number') ? meta.elo : null;
            let corridasAtual = (meta && typeof meta.corridas === 'number') ? meta.corridas : null;
            let vitoriasAtual = (meta && typeof meta.vitorias === 'number') ? meta.vitorias : null;
            if (atual !== r.elo || corridasAtual !== r.corridas || vitoriasAtual !== r.vitorias) {
                alteracoes.push({
                    metaKey: r.nome,
                    elo: r.elo,
                    corridas: r.corridas,
                    vitorias: r.vitorias,
                    antes: atual
                });
            }
        });

        return { ranking, alteracoes, bateriasContadas, desafiosContados: decisoes.length };
    }

    // Multi-path update pronto pra db.ref().update() / admin SDK.
    function montarUpdatesElo(alteracoes) {
        let updates = {};
        alteracoes.forEach(a => {
            updates['pilotosMetadados/' + a.metaKey + '/elo'] = a.elo;
            updates['pilotosMetadados/' + a.metaKey + '/corridas'] = a.corridas;
            updates['pilotosMetadados/' + a.metaKey + '/vitorias'] = a.vitorias;
        });
        return updates;
    }

    /* ===== Navegador =====
       Busca os dados, calcula e grava só o que mudou. */
    async function recalcularEloGeral(opcoes) {
        opcoes = opcoes || {};
        if (typeof db === 'undefined' || !db) throw new Error('Banco não conectado.');
        let snap = await Promise.all([
            db.ref('baterias').once('value'),
            db.ref('desafios').once('value'),
            db.ref('mesclagensPilotos').once('value'),
            db.ref('pilotosMetadados').once('value')
        ]);
        let resultado = calcularRankingElo(
            snap[0].val() || {}, snap[1].val() || {}, snap[2].val() || {}, snap[3].val() || {}
        );
        if (resultado.alteracoes.length && !opcoes.apenasCalcular) {
            await db.ref().update(montarUpdatesElo(resultado.alteracoes));
            // Mantém o cache local coerente pra leaderboard redesenhar já
            // atualizado sem esperar o listener do banco.
            if (typeof pilotosMetadadosCache !== 'undefined' && pilotosMetadadosCache) {
                resultado.alteracoes.forEach(a => {
                    pilotosMetadadosCache[a.metaKey] = pilotosMetadadosCache[a.metaKey] || {};
                    pilotosMetadadosCache[a.metaKey].elo = a.elo;
                });
            }
            if (typeof renderizarLeaderboardElo === 'function') {
                try { renderizarLeaderboardElo(); } catch (e) { /* leaderboard é opcional */ }
            }
        }
        return resultado;
    }

    global.recalcularEloGeral = recalcularEloGeral;
    global.calcularRankingElo = calcularRankingElo;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { calcularRankingElo, montarUpdatesElo, recalcularEloGeral, keyElo };
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
