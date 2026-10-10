/* CTAD - Central de Telemetria — Área de Desafios entre Pilotos
   Depende de variáveis/funções globais do script principal:
   'db', 'escapeHtml()', 'escJs()' (de piloto-conta.js), 'usuarioAtual',
   'pilotoVinculadoAoUsuario', 'usuariosPilotosCache', 'pilotosMetadadosCache',
   'convitesDesafioCache', 'desafiosCache', 'obterTodosDadosConsolidados()'.

   MODELO (v6.0):
   1) Piloto entra em "Minha Conta" → "Desafiar" → seleciona adversário(s)
      → escolhe formato → envia convite.
   2) Cada convidado recebe o convite em "Minha Conta" e responde.
   3) Quando o primeiro convidado ACEITA, o desafio é criado (status 'aguardando').
   4) O sistema monitora as corridas: no primeiro encontro (corrida com todos
      presentes), o desafio é DECIDIDO automaticamente pelo formato escolhido.
   5) Se o desafiado não aparece em 3 corridas seguidas, o desafiante vence por W.O.
   6) Desafios não-decididos após 30 dias expiram.
   7) Cada decisão atualiza o ELO dos pilotos envolvidos.

   Formatos:
   - duelo: melhor posição final no 1º encontro
   - maisVoltas: mais voltas válidas no 1º encontro
   - kingOfTheHill: mais voltas na liderança no 1º encontro
   - voandoBaixo: maior sequência de voltas mais rápidas que o adversário (X=3,5,7) */

// ===== Constantes =====

const FORMATOS_DESAFIO = {
    duelo: {
        nome: 'Duelo',
        icone: '⚔️',
        descricaoCurta: 'Melhor posição final no primeiro encontro. Quem terminar na frente vence.',
        descricaoCompleta: 'O Duelo é o formato mais direto: no primeiro encontro entre os dois pilotos (a primeira corrida onde ambos estiverem presentes), quem terminar na melhor posição vence o desafio. Se houver empate de posição, decide pela melhor volta. Ideal pra quem quer um confronto direto e definitivo.'
    },
    maisVoltas: {
        nome: 'Mais Voltas',
        icone: '🔄',
        descricaoCurta: 'Quem completar mais voltas válidas no primeiro encontro vence.',
        descricaoCompleta: 'No primeiro encontro, o piloto que completar mais voltas válidas vence. Este formato premia a resistência e a consistência — quem aguenta mais tempo na pista leva a melhor. Se houver empate de voltas, decide pela posição final.'
    },
    kingOfTheHill: {
        nome: 'King of the Hill',
        icone: '👑',
        descricaoCurta: 'Quem liderar mais voltas no primeiro encontro vence. Fique no ponto mais alto!',
        descricaoCompleta: 'Inspirado na brincadeira dos cachorros de tentar sempre ficar no ponto mais alto, este formato conta quantas volta cada piloto passou na liderança (posição 1) durante o primeiro encontro. Quem liderar mais voltas vence. Se houver empate, decide pela posição final.'
    },
    voandoBaixo: {
        nome: 'Voando Baixo',
        icone: '✈️',
        descricaoCurta: 'Maior sequência de voltas consecutivas mais rápidas que o adversário. Escolha 3, 5 ou 7.',
        descricaoCompleta: 'No primeiro encontro, contamos a maior sequência de voltas consecutivas em que um piloto foi mais rápido que o outro. Por exemplo, com X=3: se o piloto A foi mais rápido que B por 3 voltas seguidas em algum momento da corrida, e a maior sequência de B foi 2, então A vence. Este formato premia a velocidade consistente em sequência.'
    }
};

const STATUS_DESAFIO = {
    aguardando: { nome: 'Aguardando', cor: 'var(--accent-gold)', corFundo: 'rgba(255,183,3,0.12)' },
    decidido: { nome: 'Decidido', cor: 'var(--accent-green)', corFundo: 'rgba(46,196,182,0.12)' },
    expirado: { nome: 'Expirado', cor: 'var(--accent-red)', corFundo: 'rgba(239,71,111,0.12)' }
};

const WO_MAX_AUSENCIAS = 3;
const EXPIRAR_DIAS = 30;

// ===== Helpers =====

function formatarDataDesafio(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
}

function pilotoKeyDesafio(nome) {
    return String(nome).trim().toLowerCase().replace(/[.#$\/\[\]]/g, '_');
}

function uidDoPilotoDesafio(nome) {
    let vinculos = usuariosPilotosCache || {};
    let uid = Object.keys(vinculos).find(u => vinculos[u] && vinculos[u].piloto === nome);
    return uid || null;
}

function nomeCanonicoDesafio(nome) {
    if (!nome) return '';
    let n = String(nome).trim();
    try {
        let safe = n.replace(/[.#$\/\[\]]/g, '_');
        let mesc = (typeof mesclagensCache !== 'undefined' && mesclagensCache) || {};
        if (mesc[safe] && mesc[safe] !== n) return String(mesc[safe]).trim();
    } catch (e) {}
    return n;
}

function listarPilotosDesafiaveis() {
    // Mapa apelido (minúsculo) -> nome original da base: "guga" -> "Gustavo".
    // Assim apelido e original colapsam numa entrada só (exibe "Gustavo (Guga)").
    let apelidoParaOriginal = {};
    try {
        Object.keys(pilotosMetadadosCache || {}).forEach(k => {
            let m = pilotosMetadadosCache[k];
            if (m && m.apelido && String(m.apelido).trim() && String(m.apelido).trim() !== k) {
                apelidoParaOriginal[String(m.apelido).trim().toLowerCase()] = k;
            }
        });
    } catch (e) {}
    function paraOriginal(n) {
        let key = String(n).trim().toLowerCase();
        return apelidoParaOriginal[key] || String(n).trim();
    }
    let brutos = new Set();
    Object.keys(pilotosMetadadosCache || {}).forEach(k => { if (k && k.trim()) brutos.add(k.trim()); });
    (typeof obterTodosDadosConsolidados === 'function' ? obterTodosDadosConsolidados() : []).forEach(d => { if (d && d.piloto) brutos.add(String(d.piloto).trim()); });
    Object.values(usuariosPilotosCache || {}).forEach(v => { if (v && v.piloto) brutos.add(String(v.piloto).trim()); });
    // Colapsa apelidos no original + aliases mesclados no canônico (Guga->Gustavo, edgard->Edgard...)
    let canonicos = new Set();
    brutos.forEach(n => {
        if (!n || !String(n).trim()) return;
        let c = nomeCanonicoDesafio(paraOriginal(n));
        // Se o próprio usuário está vinculado por apelido, exclui também
        if (c && c !== pilotoVinculadoAoUsuario && paraOriginal(pilotoVinculadoAoUsuario || '') !== c) canonicos.add(c);
    });
    return Array.from(canonicos)
        .sort((a, b) => {
            // Quem tem conta primeiro (pode responder), depois A–Z
            let ca = uidDoPilotoDesafio(a) ? 0 : 1, cb = uidDoPilotoDesafio(b) ? 0 : 1;
            if (ca !== cb) return ca - cb;
            return a.localeCompare(b, 'pt-BR');
        });
}

// Rótulo de exibição: "Gustavo (Guga)" quando há apelido diferente do original.
function rotuloPilotoDesafio(nome) {
    try {
        let m = (pilotosMetadadosCache || {})[nome];
        if (m && m.apelido && String(m.apelido).trim() && String(m.apelido).trim() !== nome) {
            return `${nome} (${String(m.apelido).trim()})`;
        }
    } catch (e) {}
    return nome;
}

function filtrarListaConviteDesafio() {
    let busca = (document.getElementById('convite-busca-piloto')?.value || '').trim().toLowerCase();
    let soComConta = !!document.getElementById('convite-so-com-conta')?.checked;
    document.querySelectorAll('#convite-pilotos-lista .convite-item').forEach(label => {
        let nome = (label.getAttribute('data-nome') || '').toLowerCase();
        let temConta = label.getAttribute('data-conta') === '1';
        let ok = (!busca || nome.includes(busca)) && (!soComConta || temConta);
        label.style.display = ok ? '' : 'none';
    });
    let visiveis = Array.from(document.querySelectorAll('#convite-pilotos-lista .convite-item')).filter(el => el.style.display !== 'none').length;
    let vazio = document.getElementById('convite-lista-vazia');
    if (vazio) vazio.style.display = visiveis ? 'none' : '';
}

function jaDesafiaAtivoCom(nomeAlvo) {
    let emConvite = Object.keys(convitesDesafioCache || {}).some(id => {
        let c = convitesDesafioCache[id];
        if (!c || !c.convidados) return false;
        return Object.values(c.convidados).some(inv =>
            inv && inv.status === 'pendente' &&
            ((c.desafiante === pilotoVinculadoAoUsuario && inv.nome === nomeAlvo) ||
             (inv.nome === pilotoVinculadoAoUsuario && c.desafiante === nomeAlvo)));
    });
    if (emConvite) return true;
    return Object.keys(desafiosCache || {}).some(id => {
        let d = desafiosCache[id];
        if (!d || (d.status !== 'aguardando' && d.status !== 'decidido')) return false;
        return (d.desafiante === pilotoVinculadoAoUsuario && d.desafiados.includes(nomeAlvo)) ||
               (d.desafiados.includes(pilotoVinculadoAoUsuario) && d.desafiante === nomeAlvo);
    });
}

function getImagemCarroCache(nomePiloto) {
    try {
        let meta = (typeof pilotosMetadadosCache !== 'undefined' && pilotosMetadadosCache) || {};
        let metaKey = pilotoKeyDesafio(nomePiloto);
        let carros = meta[metaKey] && meta[metaKey].carros;
        if (!carros) return null;
        let keys = Object.keys(carros);
        for (let k of keys) {
            if (carros[k] && carros[k].imagem) return carros[k].imagem;
        }
    } catch (e) {}
    return null;
}

// ===== Lógica de Decisão =====

function agruparPorCorrida() {
    let dados = (typeof obterTodosDadosConsolidados === 'function' ? obterTodosDadosConsolidados() : []);
    let corridas = {};
    dados.forEach(d => {
        if (!d.bateriaKey) return;
        if (!corridas[d.bateriaKey]) corridas[d.bateriaKey] = [];
        corridas[d.bateriaKey].push(d);
    });
    return corridas;
}

function getPilotosNaCorrida(dadosCorrida) {
    return dadosCorrida.map(d => d.piloto).filter(n => n && n.trim());
}

function ordenarPorPosicao(dadosCorrida) {
    return [...dadosCorrida].sort((a, b) => {
        let posA = parseInt(a.pos) || 999;
        let posB = parseInt(b.pos) || 999;
        return posA - posB;
    });
}

function calcularPosicoesPorVolta(dadosCorrida) {
    let maxVoltas = 0;
    dadosCorrida.forEach(d => { if (d.laps && d.laps.length > maxVoltas) maxVoltas = d.laps.length; });
    let posicoesPorVolta = [];
    for (let v = 0; v < maxVoltas; v++) {
        let ranking = [];
        dadosCorrida.forEach(p => {
            let soma = 0, valido = true;
            for (let j = 0; j <= v; j++) {
                let l = p.laps ? p.laps[j] : null;
                let t = l !== undefined && l !== null ? Number(typeof l === 'object' ? l.tempo : l) : null;
                if (!Number.isFinite(t) || t <= 0) { valido = false; break; }
                soma += t;
            }
            if (valido) ranking.push({ piloto: p.piloto, tempoTotal: soma });
        });
        ranking.sort((a, b) => a.tempoTotal - b.tempoTotal);
        let posMap = {};
        ranking.forEach((item, idx) => { posMap[item.piloto] = idx + 1; });
        posicoesPorVolta.push(posMap);
    }
    return posicoesPorVolta;
}

function contarVoltasLideradas(posicoesPorVolta, piloto) {
    let count = 0;
    posicoesPorVolta.forEach(pos => { if (pos[piloto] === 1) count++; });
    return count;
}

function contarVoltasValidas(dadosCorrida, piloto) {
    let dado = dadosCorrida.find(d => d.piloto === piloto);
    if (!dado || !dado.laps) return 0;
    return dado.laps.filter(l => {
        let t = l !== undefined && l !== null ? Number(typeof l === 'object' ? l.tempo : l) : null;
        return Number.isFinite(t) && t > 0;
    }).length;
}

function maiorSequenciaVoandoBaixo(dadosCorrida, pilotoA, pilotoB, x) {
    let lapsA = (dadosCorrida.find(d => d.piloto === pilotoA) || {}).laps || [];
    let lapsB = (dadosCorrida.find(d => d.piloto === pilotoB) || {}).laps || [];
    let maxVoltas = Math.max(lapsA.length, lapsB.length);
    let maxSeqA = 0, maxSeqB = 0;
    let seqA = 0, seqB = 0;
    for (let v = 0; v < maxVoltas; v++) {
        let tA = lapsA[v] !== undefined && lapsA[v] !== null ? Number(typeof lapsA[v] === 'object' ? lapsA[v].tempo : lapsA[v]) : null;
        let tB = lapsB[v] !== undefined && lapsB[v] !== null ? Number(typeof lapsB[v] === 'object' ? lapsB[v].tempo : lapsB[v]) : null;
        let validoA = Number.isFinite(tA) && tA > 0;
        let validoB = Number.isFinite(tB) && tB > 0;
        if (validoA && validoB) {
            if (tA < tB) { seqA++; seqB = 0; }
            else if (tB < tA) { seqB++; seqA = 0; }
            else { seqA = 0; seqB = 0; }
        } else { seqA = 0; seqB = 0; }
        if (seqA > maxSeqA) maxSeqA = seqA;
        if (seqB > maxSeqB) maxSeqB = seqB;
    }
    return { pilotoA: maxSeqA, pilotoB: maxSeqB };
}

function decidirDesafio(desafio, dadosCorrida, batKey) {
    let formato = desafio.formato;
    let desafiante = desafio.desafiante;
    let desafiados = desafio.desafiados;
    let todosPilotos = [desafiante, ...desafiados];
    let resultado = {
        vencedor: null,
        perdedores: [],
        bateriaKey: batKey,
        posicoes: {},
        voltas: {},
        voltasLideradas: {},
        decididoEm: Date.now()
    };
    let ordenados = ordenarPorPosicao(dadosCorrida);
    todosPilotos.forEach(p => {
        let dado = dadosCorrida.find(d => d.piloto === p);
        resultado.posicoes[p] = dado ? (parseInt(dado.pos) || 999) : 999;
        resultado.voltas[p] = dado ? contarVoltasValidas(dadosCorrida, p) : 0;
    });
    let posicoesPorVolta = calcularPosicoesPorVolta(dadosCorrida);
    todosPilotos.forEach(p => {
        resultado.voltasLideradas[p] = contarVoltasLideradas(posicoesPorVolta, p);
    });

    if (formato === 'duelo') {
        if (desafiados.length === 1) {
            let desafiado = desafiados[0];
            let posD = resultado.posicoes[desafiante];
            let posP = resultado.posicoes[desafiado];
            if (posD < posP) { resultado.vencedor = desafiante; resultado.perdedores = [desafiado]; }
            else if (posP < posD) { resultado.vencedor = desafiado; resultado.perdedores = [desafiante]; }
            else {
                let melhD = (dadosCorrida.find(d => d.piloto === desafiante) || {}).melhorVoltaVal || Infinity;
                let melhP = (dadosCorrida.find(d => d.piloto === desafiado) || {}).melhorVoltaVal || Infinity;
                if (melhD <= melhP) { resultado.vencedor = desafiante; resultado.perdedores = [desafiado]; }
                else { resultado.vencedor = desafiado; resultado.perdedores = [desafiante]; }
            }
        } else {
            let menorMedia = Infinity, vencedor = null;
            desafiados.forEach(d => {
                let media = resultado.posicoes[d];
                if (media < menorMedia) { menorMedia = media; vencedor = d; }
            });
            let posDesafiante = resultado.posicoes[desafiante];
            if (posDesafiante <= menorMedia) { resultado.vencedor = desafiante; resultado.perdedores = [...desafiados]; }
            else { resultado.vencedor = vencedor; resultado.perdedores = [desafiante, ...desafiados.filter(d => d !== vencedor)]; }
        }
    } else if (formato === 'maisVoltas') {
        let maxVoltas = -1;
        todosPilotos.forEach(p => {
            if (resultado.voltas[p] > maxVoltas) maxVoltas = resultado.voltas[p];
        });
        let empatados = todosPilotos.filter(p => resultado.voltas[p] === maxVoltas);
        if (empatados.length === 1) {
            resultado.vencedor = empatados[0];
            resultado.perdedores = todosPilotos.filter(p => p !== empatados[0]);
        } else {
            let melhorPos = Math.min(...empatados.map(p => resultado.posicoes[p]));
            let vencedor = empatados.find(p => resultado.posicoes[p] === melhorPos);
            resultado.vencedor = vencedor;
            resultado.perdedores = todosPilotos.filter(p => p !== vencedor);
        }
    } else if (formato === 'kingOfTheHill') {
        let maxLideradas = -1;
        todosPilotos.forEach(p => {
            if (resultado.voltasLideradas[p] > maxLideradas) maxLideradas = resultado.voltasLideradas[p];
        });
        let empatados = todosPilotos.filter(p => resultado.voltasLideradas[p] === maxLideradas);
        if (empatados.length === 1) {
            resultado.vencedor = empatados[0];
            resultado.perdedores = todosPilotos.filter(p => p !== empatados[0]);
        } else {
            let melhorPos = Math.min(...empatados.map(p => resultado.posicoes[p]));
            let vencedor = empatados.find(p => resultado.posicoes[p] === melhorPos);
            resultado.vencedor = vencedor;
            resultado.perdedores = todosPilotos.filter(p => p !== vencedor);
        }
    } else if (formato === 'voandoBaixo') {
        let x = desafio.voandoBaixoX || 5;
        if (desafiados.length === 1) {
            let desafiado = desafiados[0];
            let seq = maiorSequenciaVoandoBaixo(dadosCorrida, desafiante, desafiado, x);
            if (seq.pilotoA > seq.pilotoB) { resultado.vencedor = desafiante; resultado.perdedores = [desafiado]; }
            else if (seq.pilotoB > seq.pilotoA) { resultado.vencedor = desafiado; resultado.perdedores = [desafiante]; }
            else {
                let posD = resultado.posicoes[desafiante];
                let posP = resultado.posicoes[desafiado];
                if (posD <= posP) { resultado.vencedor = desafiante; resultado.perdedores = [desafiado]; }
                else { resultado.vencedor = desafiado; resultado.perdedores = [desafiante]; }
            }
            resultado.maiorSequencia = seq;
        } else {
            let maiorSeq = -1, vencedor = null;
            desafiados.forEach(d => {
                let seq = maiorSequenciaVoandoBaixo(dadosCorrida, desafiante, d, x);
                if (seq.pilotoA > maiorSeq) { maiorSeq = seq.pilotoA; vencedor = desafiante; }
                if (seq.pilotoB > maiorSeq) { maiorSeq = seq.pilotoB; vencedor = d; }
            });
            if (vencedor === desafiante) {
                resultado.vencedor = desafiante;
                resultado.perdedores = [...desafiados];
            } else {
                resultado.vencedor = vencedor;
                resultado.perdedores = [desafiante, ...desafiados.filter(d => d !== vencedor)];
            }
        }
    }
    return resultado;
}

function verificarEncontros() {
    let corridas = agruparPorCorrida();
    let batKeys = Object.keys(corridas).sort().reverse();
    Object.keys(desafiosCache || {}).forEach(id => {
        let d = desafiosCache[id];
        if (!d || d.status !== 'aguardando') return;
        if (d.decididoEm) return;
        let todosPilotos = [d.desafiante, ...d.desafiados];
        for (let batKey of batKeys) {
            let dadosCorrida = corridas[batKey];
            if (!dadosCorrida) continue;
            let pilotosNaCorrida = getPilotosNaCorrida(dadosCorrida);
            let todosPresentes = todosPilotos.every(p => pilotosNaCorrida.includes(p));
            if (todosPresentes) {
                let resultado = decidirDesafio(d, dadosCorrida, batKey);
                aplicarDecisaoDesafio(id, resultado);
                return;
            }
            let desafiadosPresentes = d.desafiados.filter(p => pilotosNaCorrida.includes(p));
            if (desafiadosPresentes.length < d.desafiados.length) {
                d.ausenciasDesafiado = (d.ausenciasDesafiado || 0) + 1;
                if (d.ausenciasDesafiado >= WO_MAX_AUSENCIAS) {
                    aplicarDecisaoDesafio(id, {
                        vencedor: d.desafiante,
                        perdedores: [...d.desafiados],
                        bateriaKey: batKey,
                        posicoes: {}, voltas: {}, voltasLideradas: {},
                        decididoEm: Date.now(),
                        wo: true
                    });
                    return;
                }
            }
        }
        if (d.criadoEm && (Date.now() - d.criadoEm) > EXPIRAR_DIAS * 24 * 60 * 60 * 1000) {
            aplicarDecisaoDesafio(id, {
                vencedor: null, perdedores: [],
                bateriaKey: null, posicoes: {}, voltas: {}, voltasLideradas: {},
                decididoEm: Date.now(), expirado: true
            });
        }
    });
}

async function aplicarDecisaoDesafio(id, resultado) {
    if (!db) return;
    try {
        let update = {
            status: resultado.expirado ? 'expirado' : 'decidido',
            vencedor: resultado.vencedor,
            perdedores: resultado.perdedores,
            bateriaKey: resultado.bateriaKey,
            posicoes: resultado.posicoes,
            voltas: resultado.voltas,
            voltasLideradas: resultado.voltasLideradas,
            decididoEm: resultado.decididoEm
        };
        if (resultado.wo) update.wo = true;
        if (resultado.expirado) update.expirado = true;
        if (resultado.maiorSequencia) update.maiorSequencia = resultado.maiorSequencia;
        let eloAntes = {};
        let eloDepois = {};
        let todosPilotos = [desafiosCache[id].desafiante, ...desafiosCache[id].desafiados];
        todosPilotos.forEach(p => { eloAntes[p] = getEloPiloto(p); });
        if (resultado.vencedor && !resultado.expirado) {
            todosPilotos.forEach(p => {
                let adversarios = todosPilotos.filter(a => a !== p);
                let eloAdversario = adversarios.reduce((s, a) => s + eloAntes[a], 0) / adversarios.length;
                let esperado = 1 / (1 + Math.pow(10, (eloAdversario - eloAntes[p]) / 400));
                let resultadoPartida = p === resultado.vencedor ? 1 : 0;
                eloDepois[p] = Math.round(eloAntes[p] + ELO_K * (resultadoPartida - esperado));
            });
            update.eloAntes = eloAntes;
            update.eloDepois = eloDepois;
            todosPilotos.forEach(p => {
                let metaKey = pilotoKeyDesafio(p);
                if (pilotosMetadadosCache && pilotosMetadadosCache[metaKey]) {
                    db.ref(`pilotosMetadados/${metaKey}/elo`).set(eloDepois[p]);
                }
            });
        }
        await db.ref(`desafios/${id}`).update(update);
    } catch (e) { console.error('Erro ao aplicar decisão:', e); }
}

// ===== ELO =====
// (cálculo em elo.js — getEloPiloto/calcularElo compartilhados)

function renderizarLeaderboardElo() {
    let container = document.getElementById('kpi-desafios-conteudo');
    if (!container) return;
    let pilotos = [];
    Object.keys(pilotosMetadadosCache || {}).forEach(k => {
        let m = pilotosMetadadosCache[k];
        let nome = (m && m.apelido) || k;
        let elo = (m && typeof m.elo === 'number') ? m.elo : ELO_INICIAL;
        pilotos.push({ nome, elo });
    });
    pilotos.sort((a, b) => b.elo - a.elo);
    let ids = Object.keys(desafiosCache || {}).filter(id => desafiosCache[id].status === 'decidido')
        .sort((a, b) => (desafiosCache[b].decididoEm || 0) - (desafiosCache[a].decididoEm || 0));
    let desafiosHtml = ids.slice(0, 6).map(id => {
        let d = desafiosCache[id];
        let formato = FORMATOS_DESAFIO[d.formato] ? FORMATOS_DESAFIO[d.formato] : FORMATOS_DESAFIO.duelo;
        let vencedor = d.vencedor;
        let perdedores = d.perdedores || [];
        let imgVencedor = getImagemCarroCache(vencedor);
        let cardImg = (src, titulo) => src
            ? '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(titulo) + '" style="width:36px; height:36px; border-radius:6px; object-fit:cover; flex-shrink:0; background:var(--bg-body);" onerror="this.outerHTML=\'<div style="width:36px; height:36px; border-radius:6px; background:var(--bg-body); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🏎️</div>\'">'
            : '<div style="width:36px; height:36px; border-radius:6px; background:var(--bg-body); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🏎️</div>';
        return '<div style="background:var(--bg-input); padding:10px 12px; border-radius:8px; border:1px solid var(--border-card); display:flex; align-items:center; gap:10px;">' +
            '<div style="flex:1; min-width:0;">' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                    cardImg(imgVencedor, vencedor) +
                    '<div style="min-width:0;">' +
                        '<div style="font-size:0.78rem; color:var(--text-title); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(vencedor || '(expirado)') + '</div>' +
                        '<div style="font-size:0.68rem; color:var(--accent-green); font-weight:700;">' + formato.icone + ' Venceu</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div style="text-align:center; flex-shrink:0;">' +
                '<div style="font-size:1.1rem; font-weight:700; color:var(--accent-gold);">' + formato.nome + '</div>' +
                '<div style="font-size:0.6rem; color:var(--text-muted);">Formato</div>' +
            '</div>' +
            '<div style="flex:1; min-width:0;">' +
                '<div style="display:flex; align-items:center; gap:8px; justify-content:flex-end;">' +
                    '<div style="text-align:right; min-width:0;">' +
                        '<div style="font-size:0.78rem; color:var(--text-title); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(perdedores.join(', ')) + '</div>' +
                        '<div style="font-size:0.68rem; color:var(--accent-red); font-weight:700;">Perdeu</div>' +
                    '</div>' +
                    '<button class="btn" style="background:rgba(37,211,102,0.15); color:#25D366; border:1px solid #25D366; padding:3px 8px; font-size:0.7rem; flex-shrink:0;" title="Compartilhar no WhatsApp" onclick="compartilharDesafio(\'' + String(id).replace(/\\/g, '\\\\').replace(/\'/g, "\\'") + '\')">📤</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');
    let leaderboardHtml = pilotos.slice(0, 10).map((p, idx) => {
        let posCor = idx === 0 ? 'var(--accent-gold)' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'var(--text-muted)';
        return '<div style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px dashed var(--border-card);">' +
            '<span style="font-size:0.72rem; font-weight:700; color:' + posCor + '; width:20px; text-align:center;">' + (idx + 1) + 'º</span>' +
            '<span style="flex:1; font-size:0.78rem; color:var(--text-title);">' + escapeHtml(p.nome) + '</span>' +
            '<span style="font-size:0.78rem; font-weight:700; color:var(--accent-gold);">' + p.elo + '</span>' +
        '</div>';
    }).join('');
    container.innerHTML = `
        <div style="font-size:0.72rem; font-weight:800; color:var(--accent-gold); text-transform:uppercase; margin-bottom:6px;">🏆 Top ELO</div>
        ${leaderboardHtml || '<div style="font-size:0.75rem; color:var(--text-muted);">Nenhum piloto com ELO ainda.</div>'}
        <div style="font-size:0.72rem; font-weight:800; color:var(--accent-gold); text-transform:uppercase; margin:10px 0 6px;">⚔️ Últimos Desafios Decididos</div>
        ${desafiosHtml || '<div style="font-size:0.75rem; color:var(--text-muted);">Nenhum desafio decidido ainda.</div>'}
    `;
}

// ===== Modal: Desafiar Pilotos =====

window.abrirModalDesafiarPiloto = function() {
    if (!usuarioAtual || !pilotoVinculadoAoUsuario) {
        alert("Entre em \"Minha Conta\" (com cadastro aprovado) pra desafiar outros pilotos.");
        return;
    }
    let modal = document.getElementById('convite-desafio-modal');
    let lista = document.getElementById('convite-pilotos-lista');
    if (!modal || !lista) return;
    let msg = document.getElementById('convite-mensagem');
    if (msg) msg.value = '';
    let pilotos = listarPilotosDesafiaveis();
    if (pilotos.length === 0) {
        lista.innerHTML = `<div style="color:var(--text-muted); font-size:0.78rem;">Nenhum outro piloto encontrado na base ainda.</div>`;
    } else {
        lista.innerHTML = `
            <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
                <input type="text" id="convite-busca-piloto" class="config-input" placeholder="🔎 Buscar piloto..." style="flex:1;min-width:140px;font-size:0.78rem;" oninput="filtrarListaConviteDesafio()">
                <label class="checkbox-item" style="font-size:0.72rem;white-space:nowrap;"><input type="checkbox" id="convite-so-com-conta" onchange="filtrarListaConviteDesafio()"> Só com conta</label>
            </div>
            <div id="convite-lista-vazia" style="display:none;color:var(--text-muted);font-size:0.78rem;">Nenhum piloto com esse filtro.</div>` +
        pilotos.map(nome => {
            let temConta = !!uidDoPilotoDesafio(nome);
            let rotulo = (typeof rotuloPilotoDesafio === 'function') ? rotuloPilotoDesafio(nome) : nome;
            return `
                <label class="checkbox-item convite-item" data-nome="${escapeHtml(nome + ' ' + rotulo)}" data-conta="${temConta ? '1' : '0'}" style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid var(--border-card); border-radius:8px; background:var(--bg-input); cursor:pointer;">
                    <input type="checkbox" class="convite-check" value="${escapeHtml(nome)}" style="width:16px; height:16px; accent-color:var(--accent-red);" onchange="atualizarHistoricoConfronto()">
                    <span style="flex:1; font-size:0.82rem; color:var(--text-title);">${escapeHtml(rotulo)}</span>
                    ${temConta
                        ? `<span style="font-size:0.62rem; color:var(--accent-green); font-weight:700;">COM CONTA</span>`
                        : `<span style="font-size:0.62rem; color:var(--text-muted);">sem conta — não pode responder ainda</span>`}
                </label>`;
        }).join('');
    }
    let historicoContainer = document.getElementById('convite-historico-confronto');
    if (!historicoContainer) {
        let newDiv = document.createElement('div');
        newDiv.id = 'convite-historico-confronto';
        newDiv.style.cssText = 'display:none; background:var(--bg-input); border:1px solid var(--border-card); border-radius:8px; padding:10px; margin-top:8px;';
        lista.parentNode.insertBefore(newDiv, lista.nextSibling);
    }
    atualizarHistoricoConfronto();
    let formatosHtml = Object.entries(FORMATOS_DESAFIO).map(([key, f]) => `
        <div class="formato-opcao" data-formato="${key}" style="border:1px solid var(--border-card); border-radius:8px; padding:10px; cursor:pointer; background:var(--bg-input); transition:border-color 0.2s;" onclick="selecionarFormato('${key}')">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.2rem;">${f.icone}</span>
                <strong style="font-size:0.82rem; color:var(--text-title);">${f.nome}</strong>
                <span style="font-size:0.62rem; color:var(--accent-blue); margin-left:auto; cursor:pointer;" onclick="event.stopPropagation(); toggleDescricaoFormato('${key}')">ⓘ Saiba mais</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px; line-height:1.4;">${f.descricaoCurta}</div>
            <div id="descricao-${key}" style="display:none; font-size:0.72rem; color:var(--text-main); margin-top:6px; padding-top:6px; border-top:1px dashed var(--border-card); line-height:1.5;">${f.descricaoCompleta}</div>
            ${key === 'voandoBaixo' ? `
                <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
                    <span style="font-size:0.68rem; color:var(--text-muted);">Voltas consecutivas:</span>
                    <select id="voando-baixo-x" class="config-select" style="font-size:0.72rem; padding:3px 6px;" onclick="event.stopPropagation();">
                        <option value="3">3</option>
                        <option value="5" selected>5</option>
                        <option value="7">7</option>
                    </select>
                </div>` : ''}
        </div>
    `).join('');
    let formatosContainer = document.getElementById('convite-formatos');
    if (formatosContainer) formatosContainer.innerHTML = formatosHtml;
    // Seleciona 'duelo' por padrão ao abrir o modal
    selecionarFormato('duelo');
    let btnEnviar = document.getElementById('btn-enviar-convite');
    if (btnEnviar) {
        btnEnviar.onclick = function() {
            let formato = document.querySelector('.formato-opcao.selected');
            let formatoKey = formato ? formato.dataset.formato : 'duelo';
            let voandoBaixoX = parseInt(document.getElementById('voando-baixo-x')?.value) || 5;
            enviarConviteDesafio(formatoKey, voandoBaixoX);
        };
    }
    modal.style.display = 'flex';
};

window.toggleDescricaoFormato = function(formatoKey) {
    let el = document.getElementById('descricao-' + formatoKey);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

function calcularHistoricoConfronto(pilotoA, pilotoB) {
    let dados = (typeof obterTodosDadosConsolidados === 'function' ? obterTodosDadosConsolidados() : []);
    let corridas = {};
    dados.forEach(d => {
        if (!d.bateriaKey) return;
        if (!corridas[d.bateriaKey]) corridas[d.bateriaKey] = [];
        corridas[d.bateriaKey].push(d);
    });
    let vitoriasA = 0, vitoriasB = 0, encontros = [];
    Object.keys(corridas).sort().reverse().forEach(batKey => {
        let dadosCorrida = corridas[batKey];
        let pA = dadosCorrida.find(d => d.piloto === pilotoA);
        let pB = dadosCorrida.find(d => d.piloto === pilotoB);
        if (pA && pB) {
            let posA = parseInt(pA.pos) || 999;
            let posB = parseInt(pB.pos) || 999;
            let vencedor = posA <= posB ? pilotoA : pilotoB;
            if (vencedor === pilotoA) vitoriasA++;
            else vitoriasB++;
            encontros.push({
                bateriaKey: batKey,
                sessao: pA.sessao || batKey,
                posA,
                posB,
                vencedor
            });
        }
    });
    return { vitoriasA, vitoriasB, encontros };
}

function atualizarHistoricoConfronto() {
    let container = document.getElementById('convite-historico-confronto');
    if (!container) return;
    let selecionados = Array.from(document.querySelectorAll('.convite-check:checked'))
        .map(cb => cb.value)
        .filter(n => n && n !== pilotoVinculadoAoUsuario);
    if (selecionados.length !== 1) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    let adversario = selecionados[0];
    let historico = calcularHistoricoConfronto(pilotoVinculadoAoUsuario, adversario);
    let imgEu = getImagemCarroCache(pilotoVinculadoAoUsuario);
    let imgAdv = getImagemCarroCache(adversario);
    let cardImg = (src) => src
        ? '<img src="' + escapeHtml(src) + '" style="width:32px; height:32px; border-radius:6px; object-fit:cover;" onerror="this.style.display=\'none\'">'
        : '<span style="font-size:1.2rem;">🏎️</span>';
    container.style.display = 'block';
    container.innerHTML = `
        <div style="font-size:0.72rem; font-weight:800; color:var(--accent-gold); text-transform:uppercase; margin-bottom:8px;">📊 Histórico: ${escapeHtml(pilotoVinculadoAoUsuario)} vs ${escapeHtml(adversario)}</div>
        <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:10px;">
            <div style="text-align:center;">${cardImg(imgEu)}<br><span style="font-size:0.72rem; color:var(--text-title);">${escapeHtml(pilotoVinculadoAoUsuario)}</span></div>
            <div style="font-size:1.2rem; font-weight:700; color:var(--accent-gold);">${historico.vitoriasA} x ${historico.vitoriasB}</div>
            <div style="text-align:center;">${cardImg(imgAdv)}<br><span style="font-size:0.72rem; color:var(--text-title);">${escapeHtml(adversario)}</span></div>
        </div>
        ${historico.encontros.length > 0 ? `
            <div style="font-size:0.68rem; color:var(--text-muted); margin-bottom:6px;">Últimos ${Math.min(5, historico.encontros.length)} encontros:</div>
            <div style="display:flex; flex-direction:column; gap:3px; max-height:120px; overflow-y:auto;">
                ${historico.encontros.slice(0, 5).map(e => `
                    <div style="display:flex; align-items:center; gap:8px; font-size:0.68rem; padding:4px; background:var(--bg-body); border-radius:4px;">
                        <span style="flex:1; text-align:right; color:${e.vencedor === pilotoVinculadoAoUsuario ? 'var(--accent-green)' : 'var(--accent-red)'};">
                            ${escapeHtml(e.sessao || e.bateriaKey)}: ${e.posA}º x ${e.posB}º
                        </span>
                        <span style="color:var(--text-muted);">${e.vencedor === pilotoVinculadoAoUsuario ? '✅' : '❌'}</span>
                    </div>
                `).join('')}
            </div>
        ` : `
            <div style="font-size:0.72rem; color:var(--text-muted); text-align:center;">Nenhum encontro anterior registrado.</div>
        `}
    `;
}

window.selecionarFormato = function(formatoKey) {
    document.querySelectorAll('.formato-opcao').forEach(el => {
        el.style.borderColor = el.dataset.formato === formatoKey ? 'var(--accent-red)' : 'var(--border-card)';
    });
};

window.fecharModalDesafiarPiloto = function() {
    let modal = document.getElementById('convite-desafio-modal');
    if (modal) modal.style.display = 'none';
};

window.enviarConviteDesafio = async function(formato = 'duelo', voandoBaixoX = 5) {
    if (!db || !usuarioAtual || !pilotoVinculadoAoUsuario) return;
    let selecionados = Array.from(document.querySelectorAll('.convite-check:checked'))
        .map(cb => cb.value)
        .filter(n => n && n !== pilotoVinculadoAoUsuario);
    if (selecionados.length === 0) { alert("Selecione pelo menos um piloto pra desafiar."); return; }
    let bloqueados = selecionados.filter(n => jaDesafiaAtivoCom(n));
    if (bloqueados.length > 0) {
        alert(`Já existe um convite ou desafio ativo com: ${bloqueados.join(', ')}. Remova o selecionado(s) e tente de novo.`);
        return;
    }
    let mensagem = (document.getElementById('convite-mensagem')?.value || '').trim();
    let convidados = {};
    selecionados.forEach(nome => {
        convidados[pilotoKeyDesafio(nome)] = {
            nome: nome,
            uid: uidDoPilotoDesafio(nome),
            status: 'pendente',
            respondidoEm: null
        };
    });
    let id = 'convite_' + Date.now();
    try {
        await db.ref(`convitesDesafio/${id}`).set({
            desafiante: pilotoVinculadoAoUsuario,
            desafianteUid: usuarioAtual.uid,
            mensagem: mensagem,
            formato: formato,
            voandoBaixoX: formato === 'voandoBaixo' ? voandoBaixoX : null,
            criadoEm: Date.now(),
            convidados: convidados
        });
        fecharModalDesafiarPiloto();
        alert(`Convite enviado para ${selecionados.length} piloto(s)! Assim que aceitarem, o desafio é criado automaticamente.`);
    } catch (err) { alert("Erro: " + err.message); }
};

window.responderConviteDesafio = async function(conviteId, convKey, novoStatus) {
    if (!db || !usuarioAtual || !pilotoVinculadoAoUsuario) return;
    let convite = (convitesDesafioCache || {})[conviteId];
    if (!convite || !convite.convidados || !convite.convidados[convKey]) { alert("Convite não encontrado."); return; }
    let meuConvite = convite.convidados[convKey];
    let ehMeuConvite = meuConvite.uid
        ? meuConvite.uid === usuarioAtual.uid
        : (meuConvite.nome === pilotoVinculadoAoUsuario && !meuConvite.uid);
    if (!ehMeuConvite && !hasPerm('desafios', 'gerenciar')) {
        alert("🔒 Este convite não é pra você.");
        return;
    }
    try {
        await db.ref(`convitesDesafio/${conviteId}/convidados/${convKey}`).update({
            status: novoStatus,
            respondidoEm: Date.now()
        });
        if (novoStatus === 'aceito') {
            let desafioId = 'desafio_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            await db.ref(`desafios/${desafioId}`).set({
                desafiante: convite.desafiante,
                desafianteUid: convite.desafianteUid || null,
                desafiados: Object.values(convite.convidados).map(c => c.nome),
                desafiadosUids: Object.values(convite.convidados).map(c => c.uid).filter(u => u),
                formato: convite.formato || 'duelo',
                voandoBaixoX: convite.voandoBaixoX || null,
                status: 'aguardando',
                criadoEm: Date.now(),
                respondidoEm: Date.now(),
                ausenciasDesafiado: 0
            });
            alert(`Desafio aceito! ${convite.desafiante} vs ${Object.values(convite.convidados).map(c => c.nome).join(', ')} está valendo — o sistema vai decidir automaticamente no primeiro encontro.`);
        }
    } catch (err) { alert("Erro: " + err.message); }
};

window.encerrarConviteDesafio = async function(conviteId) {
    if (!db) return;
    let convite = (convitesDesafioCache || {})[conviteId];
    if (!convite) return;
    let ehDono = convite.desafianteUid === usuarioAtual?.uid || convite.desafiante === pilotoVinculadoAoUsuario;
    if (!ehDono && !hasPerm('desafios', 'gerenciar')) {
        alert("🔒 Só quem enviou o convite pode encerrá-lo.");
        return;
    }
    if (!confirm("Encerrar este convite? Ele sai da lista de todos os convidados.")) return;
    try { await db.ref(`convitesDesafio/${conviteId}`).remove(); } catch (err) { alert("Erro: " + err.message); }
};

window.excluirDesafio = async function(desafioId) {
    if (!db) return;
    let desafio = (desafiosCache || {})[desafioId];
    if (!desafio) { alert("Desafio não encontrado."); return; }
    let ehParte = pilotoVinculadoAoUsuario &&
        (desafio.desafiante === pilotoVinculadoAoUsuario || desafio.desafiados.includes(pilotoVinculadoAoUsuario));
    if (!hasPerm('desafios', 'gerenciar') && !ehParte) {
        alert("🔒 Apenas os pilotos envolvidos podem remover este desafio.");
        return;
    }
    if (!confirm("Encerrar este desafio?")) return;
    try { await db.ref(`desafios/${desafioId}`).remove(); } catch (err) { alert("Erro: " + err.message); }
};

// ===== Seção "Minha Conta" =====

function renderizarSecaoDesafiosMinhaConta() {
    if (!pilotoVinculadoAoUsuario) return '';
    let meuNome = pilotoVinculadoAoUsuario;
    let minhaKey = pilotoKeyDesafio(meuNome);
    let recebidos = Object.keys(convitesDesafioCache || {}).filter(id => {
        let c = convitesDesafioCache[id];
        if (!c || !c.convidados || !c.convidados[minhaKey]) return false;
        if (c.desafiante === meuNome) return false;
        return c.convidados[minhaKey].status === 'pendente';
    }).sort((a, b) => (convitesDesafioCache[b].criadoEm || 0) - (convitesDesafioCache[a].criadoEm || 0));
    let recebidosHtml = recebidos.map(id => {
        let c = convitesDesafioCache[id];
        let inv = c.convidados[minhaKey];
        let formato = FORMATOS_DESAFIO[c.formato] ? FORMATOS_DESAFIO[c.formato] : FORMATOS_DESAFIO.duelo;
        let outrosConvidados = Object.values(c.convidados).filter(cv => cv.nome !== meuNome).map(cv => cv.nome).join(', ');
        return `
            <div class="config-panel" style="margin:0;">
                <div style="font-size:0.82rem; color:var(--text-title);"><strong>${escapeHtml(c.desafiante)}</strong> te desafiou!</div>
                ${outrosConvidados ? `<div style="font-size:0.72rem; color:var(--text-muted);">Também convidou: ${escapeHtml(outrosConvidados)}</div>` : ''}
                <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                    <span style="font-size:0.72rem; color:var(--accent-red); font-weight:700;">${formato.icone} ${formato.nome}</span>
                    ${c.formato === 'voandoBaixo' && c.voandoBaixoX ? `<span style="font-size:0.68rem; color:var(--text-muted);">(${c.voandoBaixoX} voltas)</span>` : ''}
                </div>
                ${c.mensagem ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">"${escapeHtml(c.mensagem)}"</div>` : ''}
                <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                    <button class="btn-action-primary" style="padding:4px 10px; font-size:0.72rem; background:var(--accent-green);" onclick="responderConviteDesafio('${escJs(id)}','${escJs(minhaKey)}','aceito')">✅ Aceitar</button>
                    <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:4px 10px; font-size:0.72rem;" onclick="responderConviteDesafio('${escJs(id)}','${escJs(minhaKey)}','talvez')">🤔 Talvez</button>
                    <button class="btn-action-danger" style="padding:4px 10px; font-size:0.72rem;" onclick="responderConviteDesafio('${escJs(id)}','${escJs(minhaKey)}','recusado')">❌ Recusar</button>
                </div>
            </div>`;
    }).join('');
    let aguardando = Object.keys(desafiosCache || {}).filter(id => {
        let d = desafiosCache[id];
        return d && d.status === 'aguardando' && (d.desafiante === meuNome || d.desafiados.includes(meuNome));
    });
    let aguardandoHtml = aguardando.map(id => {
        let d = desafiosCache[id];
        let formato = FORMATOS_DESAFIO[d.formato] ? FORMATOS_DESAFIO[d.formato] : FORMATOS_DESAFIO.duelo;
        let souDesafiante = d.desafiante === meuNome;
        let adversarios = souDesafiante ? d.desafiados : [d.desafiante];
        let imgAdv = getImagemCarroCache(adversarios[0]);
        let cardImg = imgAdv
            ? '<img src="' + escapeHtml(imgAdv) + '" style="width:32px; height:32px; border-radius:6px; object-fit:cover;" onerror="this.style.display=\'none\'">'
            : '<span style="font-size:1.2rem;">🏎️</span>';
        return `
            <div class="config-panel" style="margin:0; border-left:3px solid ${STATUS_DESAFIO.aguardando.cor};">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${cardImg}
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.78rem; color:var(--text-title); font-weight:600;">${escapeHtml(adversarios.join(', '))}</div>
                        <div style="font-size:0.68rem; color:var(--text-muted);">${souDesafiante ? 'Você desafiou' : 'Desafiou você'} • ${formato.icone} ${formato.nome}</div>
                    </div>
                    <span style="font-size:0.62rem; font-weight:700; color:${STATUS_DESAFIO.aguardando.cor}; background:${STATUS_DESAFIO.aguardando.corFundo}; padding:2px 8px; border-radius:4px;">AGUARDANDO</span>
                </div>
            </div>`;
    }).join('');
    let decididos = Object.keys(desafiosCache || {}).filter(id => {
        let d = desafiosCache[id];
        return d && d.status === 'decidido' && (d.desafiante === meuNome || d.desafiados.includes(meuNome));
    }).sort((a, b) => (desafiosCache[b].decididoEm || 0) - (desafiosCache[a].decididoEm || 0));
    let decididosHtml = decididos.slice(0, 5).map(id => {
        let d = desafiosCache[id];
        let formato = FORMATOS_DESAFIO[d.formato] ? FORMATOS_DESAFIO[d.formato] : FORMATOS_DESAFIO.duelo;
        let souVencedor = d.vencedor === meuNome;
        let corBorda = souVencedor ? 'var(--accent-green)' : 'var(--accent-red)';
        return `
            <div class="config-panel" style="margin:0; border-left:3px solid ${corBorda};">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.78rem; color:var(--text-title); font-weight:600;">${escapeHtml(d.vencedor || '(expirado)')}</div>
                        <div style="font-size:0.68rem; color:var(--text-muted);">${formato.icone} ${formato.nome} • ${formatarDataDesafio(d.decididoEm)}</div>
                    </div>
                    <span style="font-size:0.62rem; font-weight:700; color:${corBorda}; background:${souVencedor ? 'rgba(46,196,182,0.12)' : 'rgba(239,71,111,0.12)'}; padding:2px 8px; border-radius:4px;">${souVencedor ? 'VITÓRIA' : 'DERROTA'}</span>
                </div>
            </div>`;
    }).join('');
    let enviados = Object.keys(convitesDesafioCache || {}).filter(id =>
        convitesDesafioCache[id] && convitesDesafioCache[id].desafiante === meuNome)
        .sort((a, b) => (convitesDesafioCache[b].criadoEm || 0) - (convitesDesafioCache[a].criadoEm || 0));
    let statusTexto = { pendente: '⏳ Aguardando', aceito: '✅ Aceito', recusado: '❌ Recusado', talvez: '🤔 Talvez' };
    let enviadosHtml = enviados.map(id => {
        let c = convitesDesafioCache[id];
        let convidadosLinhas = Object.entries(c.convidados || {}).map(([k, inv]) => `
            <div style="display:flex; justify-content:space-between; gap:8px; font-size:0.74rem; padding:3px 0; border-bottom:1px dashed var(--border-card);">
                <span style="color:var(--text-main);">${escapeHtml(inv.nome || k)}</span>
                <span style="color:var(--text-muted); white-space:nowrap;">${statusTexto[inv.status] || inv.status}</span>
            </div>`).join('');
        return `
            <div class="config-panel" style="margin:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <span style="font-size:0.72rem; color:var(--text-muted);">Enviado em ${formatarDataDesafio(c.criadoEm)}</span>
                    <button class="btn-text-action" style="color:var(--accent-red); font-size:0.7rem;" onclick="encerrarConviteDesafio('${escJs(id)}')">Encerrar convite</button>
                </div>
                ${c.mensagem ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">"${escapeHtml(c.mensagem)}"</div>` : ''}
                <div style="margin-top:4px;">${convidadosLinhas}</div>
            </div>`;
    }).join('');
    return `
        <div class="config-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <div class="config-panel-title" style="border-bottom:none; padding-bottom:0; margin:0;">⚔️ Desafios</div>
                <button class="btn-action-primary" style="background:var(--accent-red); padding:6px 14px; font-size:0.76rem;" onclick="fecharModalMinhaConta(); abrirModalDesafiarPiloto()">⚔️ Desafiar</button>
            </div>
        </div>
        <div class="config-panel">
            <div class="config-panel-title">📬 Convites Recebidos</div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
                ${recebidosHtml || `<span style="font-size:0.75rem; color:var(--text-muted);">Nenhum convite pendente. Clique em "⚔️ Desafiar" pra desafiar outros pilotos.</span>`}
            </div>
        </div>
        ${aguardando.length > 0 ? `
        <div class="config-panel">
            <div class="config-panel-title">⏳ Aguardando Decisão</div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">${aguardandoHtml}</div>
        </div>` : ''}
        ${decididos.length > 0 ? `
        <div class="config-panel">
            <div class="config-panel-title">🏆 Últimos Resultados</div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">${decididosHtml}</div>
        </div>` : ''}
        ${enviados.length > 0 ? `
        <div class="config-panel">
            <div class="config-panel-title">📤 Convites Enviados</div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">${enviadosHtml}</div>
        </div>` : ''}
        ${typeof renderizarSugestoesEquipes === 'function' ? renderizarSugestoesEquipes() : ''}
    `;
}

window.compartilharDesafio = function(id) {
    let d = (typeof desafiosCache !== 'undefined' && desafiosCache) ? desafiosCache[id] : null;
    if (!d) return;
    let formato = (typeof FORMATOS_DESAFIO !== 'undefined' && FORMATOS_DESAFIO[d.formato]) ? FORMATOS_DESAFIO[d.formato] : { nome: d.formato, icone: '⚔️' };
    let texto = `⚔️ *Desafio CTAD* ${formato.icone || ''}\n${d.desafiante} vs ${(d.desafiados || []).join(', ')}\nFormato: *${formato.nome}*`;
    if (d.status === 'decidido' && d.vencedor) {
        texto += `\n\n🏆 Vencedor: *${d.vencedor}*${d.wo ? ' (W.O.)' : ''}`;
        if (d.eloDepois && typeof d.eloDepois === 'object') {
            let linhas = Object.keys(d.eloDepois).map(p => `• ${p}: ${d.eloAntes && d.eloAntes[p] !== undefined ? d.eloAntes[p] + ' ➔ ' : ''}${d.eloDepois[p]}`);
            if (linhas.length) texto += `\n\n📊 ELO:\n${linhas.join('\n')}`;
        }
    } else if (d.status === 'aguardando') {
        texto += `\n\n⏳ Aguardando o primeiro encontro na pista!`;
    }
    texto += `\n\n🔎 ${window.location.href.split('#')[0]}`;
    if (typeof compartilharWhatsApp === 'function') compartilharWhatsApp(texto);
    else if (navigator.share) { try { navigator.share({ title: 'Desafio CTAD', text: texto }); } catch (e) {} }
    else if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => alert('Copiado! Cole no WhatsApp.'));
};

// Monta o texto do convite com os pilotos selecionados e abre o WhatsApp (sem enviar pelo site).
window.convidarDesafioWhatsApp = function() {
    if (typeof pilotoVinculadoAoUsuario === 'undefined' || !pilotoVinculadoAoUsuario) {
        alert('Entre em "Minha Conta" (com cadastro aprovado) pra desafiar outros pilotos.');
        return;
    }
    let selecionados = Array.from(document.querySelectorAll('.convite-check:checked'))
        .map(cb => cb.value)
        .filter(n => n && n !== pilotoVinculadoAoUsuario);
    if (selecionados.length === 0) { alert('Selecione pelo menos um piloto pra desafiar.'); return; }
    let formatoEl = document.querySelector('.formato-opcao.selected');
    let formatoKey = formatoEl ? formatoEl.dataset.formato : 'duelo';
    let formato = (typeof FORMATOS_DESAFIO !== 'undefined' && FORMATOS_DESAFIO[formatoKey]) ? FORMATOS_DESAFIO[formatoKey] : { nome: formatoKey };
    let mensagem = (document.getElementById('convite-mensagem')?.value || '').trim();
    let texto = `⚔️ *${pilotoVinculadoAoUsuario} te desafiou!*\n\nAdversário(s): ${selecionados.join(', ')}\nFormato: *${formato.nome}*`;
    if (mensagem) texto += `\n💬 "${mensagem}"`;
    texto += `\n\nResponda em Minha Conta:\n🔎 ${window.location.href.split('#')[0]}`;
    if (typeof compartilharWhatsApp === 'function') compartilharWhatsApp(texto);
    else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
};

// ===== Sugestão de Equipes =====

function sugerirEquipesDesafios() {
    let desafios = Object.values(desafiosCache || {});
    let convites = Object.values(convitesDesafioCache || {});
    let todosEnvolvidos = {};

    function adicionarEnvolvidos(desafiante, desafiados) {
        desafiados.forEach(d => {
            if (!todosEnvolvidos[desafiante]) todosEnvolvidos[desafiante] = new Set();
            if (!todosEnvolvidos[d]) todosEnvolvidos[d] = new Set();
            todosEnvolvidos[desafiante].add(d);
            todosEnvolvidos[d].add(desafiante);
        });
    }

    desafios.forEach(d => {
        if (d.desafiante && d.desafiados) {
            adicionarEnvolvidos(d.desafiante, d.desafiados);
        }
    });
    convites.forEach(c => {
        if (c.desafiante && c.convidados) {
            let convidados = Object.values(c.convidados).map(cv => cv.nome);
            adicionarEnvolvidos(c.desafiante, convidados);
        }
    });

    let pilotos = Object.keys(todosEnvolvidos);
    if (pilotos.length < 4) return [];

    let sugestoes = [];
    for (let i = 0; i < pilotos.length; i++) {
        for (let j = i + 1; j < pilotos.length; j++) {
            let p1 = pilotos[i];
            let p2 = pilotos[j];
            let inimigos1 = todosEnvolvidos[p1] || new Set();
            let inimigos2 = todosEnvolvidos[p2] || new Set();
            let comuns = [...inimigos1].filter(x => inimigos2.has(x));
            if (comuns.length >= 2) {
                let ladoA = [p1, p2].sort();
                let ladoB = comuns.sort();
                sugestoes.push({
                    equipeA: ladoA,
                    equipeB: ladoB,
                    score: comuns.length
                });
            }
        }
    }

    sugestoes.sort((a, b) => b.score - a.score);
    return sugestoes.slice(0, 3);
}

function renderizarSugestoesEquipes() {
    let sugestoes = sugerirEquipesDesafios();
    if (sugestoes.length === 0) return '';
    return `
        <div class="config-panel" style="margin-top:14px;">
            <div class="config-panel-title">👥 Equipes Sugeridas</div>
            <p style="font-size:0.72rem; color:var(--text-muted); margin:4px 0 8px;">O sistema detectou padrões de desafios cruzados. Confirme para criar desafios de equipe.</p>
            ${sugestoes.map((s, idx) => `
                <div style="background:var(--bg-input); border:1px solid var(--border-card); border-radius:8px; padding:10px; margin-bottom:8px;">
                    <div style="font-size:0.78rem; color:var(--text-title); font-weight:600; margin-bottom:6px;">Sugestão ${idx + 1}</div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                        <span style="font-size:0.72rem; font-weight:700; color:var(--accent-blue);">${s.equipeA.join(' + ')}</span>
                        <span style="color:var(--accent-gold);">vs</span>
                        <span style="font-size:0.72rem; font-weight:700; color:var(--accent-red);">${s.equipeB.join(' + ')}</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-action-primary" style="padding:4px 10px; font-size:0.7rem;" onclick="criarDesafioEquipe('${escJs(JSON.stringify(s.equipeA))}','${escJs(JSON.stringify(s.equipeB))}')">✅ Criar Desafio</button>
                        <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:4px 10px; font-size:0.7rem;" onclick="dispensarSugestaoEquipe(${idx})">❌ Dispensar</button>
                    </div>
                </div>
            `).join('')}
        </div>`;
}

function criarDesafioEquipe(equipeAJson, equipeBJson) {
    alert('Funcionalidade de desafio de equipe será implementada em breve. Por enquanto, desafie individualmente.');
}

function dispensarSugestaoEquipe(idx) {
    alert('Sugestão dispensada.');
}

// ===== Inicialização =====

function iniciarVerificacaoDesafios() {
    setInterval(verificarEncontros, 30000);
    setTimeout(verificarEncontros, 2000);
}

if (typeof window !== 'undefined') {
    window.iniciarVerificacaoDesafios = iniciarVerificacaoDesafios;
    window.toggleDescricaoFormato = toggleDescricaoFormato;
    window.selecionarFormato = selecionarFormato;
    window.enviarConviteDesafio = enviarConviteDesafio;
    window.formatosDesafio = FORMATOS_DESAFIO;
    window.statusDesafio = STATUS_DESAFIO;
    window.renderizarWidgetDesafiosPublicos = renderizarLeaderboardElo;
    window.sugerirEquipesDesafios = sugerirEquipesDesafios;
    window.renderizarSugestoesEquipes = renderizarSugestoesEquipes;
    window.atualizarHistoricoConfronto = atualizarHistoricoConfronto;
}
