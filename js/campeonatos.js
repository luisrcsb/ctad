import { campeonatosCache, campeonatoAtivoKey, db, SENHA_UNIFICADA } from './state.js';

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
        configuracoes: { numeroProvas: 4, pilotosPorProva: 10, pontuacaoTabela: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
        pilotosInscritos: {}, bateriasBancoSeparado: {}
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
