import { campeonatosCache, campeonatoAtivoKey, db, SENHA_UNIFICADA, mesclagensCache } from './state.js';

// NOTA: a pasta js/ ainda NÃO está ligada ao index.html (o site carrega os
// scripts clássicos da raiz: campeonatos.js, pilotos-v2.js, ...). Esta versão
// modular é mantida em SINCRONIA com a implementação canônica do index.html
// para não divergir quando a modularização for ativada:
//   - mesma ordem canônica de provas (por "id" de cadastro);
//   - mesma recontagem de posição (ordenarParticipantes ~ ordenarParticipantesBateria);
//   - mesma mesclagem de nomes de piloto (nomeMesclado).

function valorTempo(l) {
    return (l && typeof l === 'object') ? Number(l.tempo) : Number(l);
}

// Equivalente a ordenarParticipantesBateria() (index.html): mais voltas,
// depois menor tempo total, depois melhor volta.
function ordenarParticipantes(participantes) {
    if (!participantes || participantes.length === 0) return [];
    const totalValido = (p) => (p.laps || [])
        .map(valorTempo)
        .filter(t => Number.isFinite(t) && t > 0)
        .reduce((acc, t) => acc + t, 0);

    return [...participantes].sort((a, b) => {
        const voltasA = (a.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0).length;
        const voltasB = (b.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0).length;
        if (voltasA !== voltasB) return voltasB - voltasA;
        const tempoA = totalValido(a);
        const tempoB = totalValido(b);
        if (tempoA !== tempoB) return tempoA - tempoB;
        const melhorA = Math.min(...((a.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0)), Infinity);
        const melhorB = Math.min(...((b.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0)), Infinity);
        return melhorA - melhorB;
    });
}

function nomeMesclado(nome) {
    if (nome === null || nome === undefined) return nome;
    let chave = String(nome).replace(/[.#$\/\[\]]/g, "_");
    return (mesclagensCache && mesclagensCache[chave]) ? mesclagensCache[chave] : nome;
}

export function calcularClassificacaoBancoSeparado(camp) {
    let provasSep = camp.bateriasBancoSeparado || {};
    let conf = camp.configuracoes || {};
    let tabelaPontosArr = conf.pontuacaoTabela || [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

    let provasArr = Object.keys(provasSep)
        .sort((a, b) => {
            let ia = (provasSep[a] && provasSep[a].id) || 0;
            let ib = (provasSep[b] && provasSep[b].id) || 0;
            if (ia !== ib) return ia - ib;
            return String(a).localeCompare(String(b));
        })
        .map(k => provasSep[k]);

    let pilotoDados = {};
    provasArr.forEach((arq, provaIndex) => {
        if (!arq || !Array.isArray(arq.dados)) return;
        let ordenadosBateria = ordenarParticipantes(arq.dados.filter(d => d.laps && d.laps.length > 0));
        ordenadosBateria.forEach((d, index) => {
            let posNum = index + 1;
            let pts = (posNum > 0 && posNum <= tabelaPontosArr.length) ? tabelaPontosArr[posNum - 1] : 0;
            if (pts <= 0) return;
            let pNome = nomeMesclado(d.piloto);
            if (!pilotoDados[pNome]) pilotoDados[pNome] = { piloto: pNome, provas: new Array(provasArr.length).fill(0), pontos: 0 };
            pilotoDados[pNome].provas[provaIndex] = pts;
        });
    });

    let ranking = Object.values(pilotoDados).map(p => {
        while (p.provas.length < provasArr.length) p.provas.push(0);
        p.pontos = p.provas.reduce((acc, val) => acc + val, 0);
        return p;
    });
    ranking.sort((a, b) => b.pontos - a.pontos);
    return ranking;
}

export function renderizarListaCampeonatosModal() {
    const ul = document.getElementById('campeonatos-lista-modal');
    if (!ul) return;
    ul.innerHTML = "";
    let keys = Object.keys(campeonatosCache);
    if (keys.length === 0) {
        ul.innerHTML = `<li style="color: var(--text-muted); text-align: center; padding: 6px;">Nenhum campeonato cadastrado.</li>`;
        return;
    }

    keys.forEach(key => {
        let camp = campeonatosCache[key];
        let statusCamp = camp.status || "Em andamento";
        const li = document.createElement('li');
        li.style.background = "var(--bg-input)";
        li.style.padding = "12px 16px";
        li.style.borderRadius = "8px";
        li.style.border = "1px solid var(--border-card)";
        li.style.display = "flex";
        li.style.flexDirection = "column";
        li.style.gap = "8px";

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <span style="font-size: 1rem; font-weight: 700; color: var(--text-title);">🏆 ${escapeHtml(camp.nome)}</span>
                    <span style="font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px; background: ${statusCamp === 'Finalizada' ? 'rgba(46,196,182,0.15); color: var(--accent-green);' : 'rgba(255,183,3,0.15); color: var(--accent-gold);'}">${statusCamp}</span>
                </div>
            </div>`;
        ul.appendChild(li);
    });
}

export async function criarCampeonatoProtegido() {
    let senha = prompt("🔒 Digite a senha unificada (1234):");
    if (senha !== SENHA_UNIFICADA) { alert("❌ Senha incorreta!"); return; }
    let nomeCamp = document.getElementById('input-nome-campeonato').value.trim();
    if (!nomeCamp) { alert("Digite o nome do campeonato."); return; }
    let campKey = "camp_" + nomeCamp.toLowerCase().replace(/[^a-z0-9]/g, "_");
    let novoCamp = {
        chave: campKey, nome: nomeCamp, status: "Em andamento",
        configuracoes: { numeroProvas: 4, pilotosPorChave: 10, inverterSegundaBateria: true, usaGridTreino: false, pontuacaoTabela: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], categoria: '' },
        pilotosInscritos: {}, bateriasBancoSeparado: {}, gridTreinoDados: null
    };
    await db.ref('campeonatos/' + campKey).set(novoCamp);
    document.getElementById('input-nome-campeonato').value = "";
    alert("Campeonato criado com sucesso!");
}

function escapeHtml(text) {
    if (!text) return '';
    let map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
