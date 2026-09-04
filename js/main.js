import { 
    setDb, db, listaJsonsCache, setListaJsonsCache, campeonatosCache, setCampeonatosCache, 
    comprasColetivasCache, setComprasColetivasCache, pilotosMetadadosCache, setPilotosMetadadosCache, 
    mesclagensCache, setMesclagensCache, ALIAS_EDGARD_DJ_DEFAULTS 
} from './state.js';

import { formatarNomeSessao, extrairPesoOrdenacao } from './telemetria.js';
import { criarCampeonatoProtegido, renderizarListaCampeonatosModal } from './campeonatos.js';
import { criarCompraColetiva, renderizarListaComprasColetivas } from './compras-coletivas.js';

const firebaseConfig = {
    apiKey: "AIzaSyDCTkeIa6QsY2zYs8S__HlIwcY-zcuhZCA",
    authDomain: "krathus-telemetria.firebaseapp.com",
    projectId: "krathus-telemetria",
    storageBucket: "krathus-telemetria.firebasestorage.app",
    messagingSenderId: "1051581039922",
    appId: "1:1051581039922:web:d8ae00eb4ab45fa3d5432b",
    measurementId: "G-JPR41S7CZ3",
    databaseURL: "https://krathus-telemetria-default-rtdb.firebaseio.com"
};

try {
    if (window.firebase && !window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
    }
    if (window.firebase) {
        setDb(window.firebase.database());
    }
} catch (e) {
    console.error("Erro Firebase:", e);
}

function escapeHtml(text) {
    if (!text) return '';
    let map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function atualizarDashboard() {
    const bateriasSel = Array.from(document.querySelectorAll('.filter-bateria:checked')).map(cb => cb.value);
    const pilotosSel = Array.from(document.querySelectorAll('.filter-piloto:checked')).map(cb => cb.value);

    const container = document.getElementById('sessions-container');
    if (!container) return;
    container.innerHTML = "";

    let totalVoltasGeral = 0;
    let melhorVoltaGlobal = Infinity;
    let melhorVoltaPiloto = "--";

    let bateriasFiltradas = listaJsonsCache.filter(arq => bateriasSel.includes(arq.firebaseKey));

    if (bateriasFiltradas.length === 0) {
        container.innerHTML = `<div class="card" style="text-align: center; color: var(--text-muted);">Nenhuma bateria selecionada.</div>`;
        return;
    }

    bateriasFiltradas.forEach(arq => {
        if (!arq.dados || !Array.isArray(arq.dados)) return;
        
        let dadosValidos = arq.dados.filter(d => d.laps && d.laps.length > 0 && (pilotosSel.length === 0 || pilotosSel.includes(d.piloto)));
        if (dadosValidos.length === 0) return;

        dadosValidos.sort((a, b) => {
            let vA = a.laps.filter(t => t > 0).length;
            let vB = b.laps.filter(t => t > 0).length;
            if (vA !== vB) return vB - vA;
            let m1 = Math.min(...a.laps.filter(t => t > 0));
            let m2 = Math.min(...b.laps.filter(t => t > 0));
            return m1 - m2;
        });

        dadosValidos.forEach(d => {
            totalVoltasGeral += (d.laps || []).filter(t => t > 0).length;
            d.laps.forEach(t => {
                if (t > 0 && t < melhorVoltaGlobal) {
                    melhorVoltaGlobal = t;
                    melhorVoltaPiloto = d.piloto;
                }
            });
        });

        let sessaoNomeFormatada = formatarNomeSessao(arq.sessao || (arq.dados[0] ? arq.dados[0].sessao : arq.firebaseKey));

        let linhasTabela = dadosValidos.map((d, index) => {
            let melhorT = d.melhorVoltaTxt || (Math.min(...d.laps.filter(t => t > 0)).toFixed(3) + 's');
            let voltasTot = d.laps.filter(t => t > 0).length;
            return `
                <tr>
                    <td><span class="pos-badge">${index + 1}º</span></td>
                    <td><strong>${escapeHtml(d.piloto)}</strong></td>
                    <td>${voltasTot}</td>
                    <td style="color: var(--accent-green); font-weight: 700;">${melhorT}</td>
                </tr>
            `;
        }).join('');

        let blocoHtml = `
            <div class="session-block" style="display: flex; flex-direction: column; gap: 15px; background: rgba(19, 27, 46, 0.4); border: 1px solid var(--border-card); border-radius: 14px; padding: 20px; margin-bottom: 20px;">
                <div class="session-block-header" style="background: var(--bg-card-header); border-left: 5px solid var(--accent-red); padding: 12px 16px; border-radius: 8px;">
                    <div class="session-block-title" style="font-size: 1.1rem; font-weight: 700; color: var(--text-title);">🏁 ${escapeHtml(sessaoNomeFormatada)}</div>
                </div>
                <div class="card" style="background: var(--bg-card); padding: 15px; border-radius: 10px; border: 1px solid var(--border-card);">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Pos</th>
                                    <th>Piloto</th>
                                    <th>Voltas</th>
                                    <th>Melhor Volta</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${linhasTabela}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += blocoHtml;
    });

    document.getElementById('kpi-total-voltas').innerText = totalVoltasGeral;
    if (melhorVoltaGlobal !== Infinity) {
        document.getElementById('kpi-melhor-volta').innerText = melhorVoltaGlobal.toFixed(3).replace('.', ',') + 's';
        document.getElementById('kpi-melhor-volta-sub').innerText = `Piloto: ${melhorVoltaPiloto}`;
    }
}

function gerarFiltrosDinamicos() {
    const batContainer = document.getElementById('filtro-baterias-container');
    const pilContainer = document.getElementById('filtro-pilotos-container');
    if (!batContainer || !pilContainer) return;

    const pilotosSet = new Set();
    listaJsonsCache.forEach(arq => {
        if (arq.dados && Array.isArray(arq.dados)) {
            arq.dados.forEach(d => { 
                if (d.piloto && d.laps && d.laps.length > 0) pilotosSet.add(d.piloto); 
            });
        }
    });

    if (listaJsonsCache.length === 0) {
        batContainer.innerHTML = `<span style="font-size:0.82rem; color: var(--accent-gold);">ℹ️ Conectado, buscando dados...</span>`;
        pilContainer.innerHTML = `<span style="font-size:0.82rem; color: var(--text-muted);">Aguardando...</span>`;
        return;
    }

    batContainer.innerHTML = listaJsonsCache.map(arq => {
        let key = arq.firebaseKey;
        let sessaoOriginal = arq.sessao || (arq.dados && arq.dados[0] ? arq.dados[0].sessao : key);
        return `<label class="checkbox-item"><input type="checkbox" value="${key}" class="filter-bateria" checked> ${formatarNomeSessao(sessaoOriginal)}</label>`;
    }).join('');

    pilContainer.innerHTML = Array.from(pilotosSet).sort().map(piloto => {
        return `<label class="checkbox-item"><input type="checkbox" value="${piloto}" class="filter-piloto" checked> ${piloto}</label>`;
    }).join('');

    document.querySelectorAll('.filter-bateria, .filter-piloto, .filter-modulo').forEach(el => {
        el.onchange = atualizarDashboard;
    });

    document.getElementById('btn-limpar-bateria').onclick = () => {
        document.querySelectorAll('.filter-bateria').forEach(cb => cb.checked = false);
        atualizarDashboard();
    };
    document.getElementById('btn-limpar-piloto').onclick = () => {
        document.querySelectorAll('.filter-piloto').forEach(cb => cb.checked = false);
        atualizarDashboard();
    };

    atualizarDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
    const dbInstancia = db;
    if (dbInstancia) {
        dbInstancia.ref('.info/connected').on('value', snap => {
            const badge = document.getElementById('db-status-badge');
            if (badge) {
                badge.style.background = snap.val() === true ? "#2ec4b6" : "#ffb703";
                badge.innerText = snap.val() === true ? "Online (Firebase)" : "Reconectando...";
            }
        });

        dbInstancia.ref('baterias').on('value', snapshot => {
            let novaLista = [];
            snapshot.forEach(child => { 
                let val = child.val(); 
                if (val && val.dados) novaLista.push({ firebaseKey: child.key, ...val }); 
            });
            novaLista.sort((a, b) => extrairPesoOrdenacao(b.sessao) - extrairPesoOrdenacao(a.sessao));
            setListaJsonsCache(novaLista);
            gerarFiltrosDinamicos();
        });

        dbInstancia.ref('pilotosMetadados').on('value', snapshot => { setPilotosMetadadosCache(snapshot.val() || {}); });
        dbInstancia.ref('campeonatos').on('value', snapshot => { setCampeonatosCache(snapshot.val() || {}); renderizarListaCampeonatosModal(); });
        dbInstancia.ref('comprasColetivas').on('value', snapshot => { setComprasColetivasCache(snapshot.val() || {}); renderizarListaComprasColetivas(); });
    }

    document.getElementById('btn-abrir-upload').onclick = () => document.getElementById('upload-modal').style.display = 'flex';
    document.getElementById('btn-fechar-upload').onclick = () => document.getElementById('upload-modal').style.display = 'none';

    document.getElementById('btn-abrir-campeonatos').onclick = () => document.getElementById('campeonatos-modal').style.display = 'flex';
    document.getElementById('btn-fechar-campeonatos').onclick = () => document.getElementById('campeonatos-modal').style.display = 'none';
    document.getElementById('btn-criar-campeonato').onclick = criarCampeonatoProtegido;

    document.getElementById('btn-abrir-cc').onclick = () => document.getElementById('campeonatos2-modal').style.display = 'flex';
    document.getElementById('btn-fechar-cc').onclick = () => document.getElementById('campeonatos2-modal').style.display = 'none';
    document.getElementById('btn-criar-cc').onclick = criarCompraColetiva;

    document.getElementById('btn-gerar-pdf').onclick = () => window.print();
});
