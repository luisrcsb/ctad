import { 
    setDb, db, listaJsonsCache, setListaJsonsCache, campeonatosCache, setCampeonatosCache, 
    comprasColetivasCache, setComprasColetivasCache, pilotosMetadadosCache, setPilotosMetadadosCache, 
    mesclagensCache, setMesclagensCache, ALIAS_EDGARD_DJ_DEFAULTS 
} from './state.js';

import { 
    formatarNomeSessao, extrairPesoOrdenacao, obterTodosDadosConsolidados 
} from './telemetria.js';

import { renderizarListaCampeonatosModal } from './campeonatos.js';
import { renderizarListaComprasColetivas } from './compras-coletivas.js';

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
    firebase.initializeApp(firebaseConfig);
    setDb(firebase.database());
} catch (e) {
    console.warn("Erro Firebase:", e);
}

function escapeHtml(text) {
    if (!text) return '';
    let map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Função que preenche os checkboxes de baterias e pilotos na tela
function gerarFiltrosDinamicos() {
    const batContainer = document.getElementById('filtro-baterias-container');
    const pilContainer = document.getElementById('filtro-pilotos-container');
    if (!batContainer || !pilContainer) return;

    const pilotosSet = new Set();
    listaJsonsCache.forEach(arq => {
        if (arq.dados && Array.isArray(arq.dados)) {
            arq.dados.forEach(d => { 
                if (d.piloto && d.laps && d.laps.length > 0) {
                    let pReal = d.piloto;
                    let safeKey = pReal.replace(/[.#$\/\[\]]/g, "_");
                    if (mesclagensCache[safeKey]) pReal = mesclagensCache[safeKey];
                    pilotosSet.add(pReal); 
                } 
            });
        }
    });

    Object.keys(pilotosMetadadosCache).forEach(p => {
        let safeKey = p.replace(/[.#$\/\[\]]/g, "_");
        let pReal = mesclagensCache[safeKey] || p;
        pilotosSet.add(pReal);
    });

    if (listaJsonsCache.length === 0) {
        batContainer.innerHTML = `<span style="font-size:0.85rem; color: var(--text-muted);">Nenhum arquivo encontrado.</span>`;
        pilContainer.innerHTML = `<span style="font-size:0.85rem; color: var(--text-muted);">Nenhum piloto encontrado.</span>`;
        return;
    }

    let bateriasSelecionadasAntigas = Array.from(document.querySelectorAll('.filter-bateria:checked')).map(cb => cb.value);
    let pilotosSelecionadosAntigos = Array.from(document.querySelectorAll('.filter-piloto:checked')).map(cb => cb.value);
    let primeiraVezBat = bateriasSelecionadasAntigas.length === 0;
    let primeiraVezPil = pilotosSelecionadosAntigos.length === 0;

    batContainer.innerHTML = listaJsonsCache.map(arq => {
        let key = arq.firebaseKey;
        let sessaoOriginal = arq.sessao || (arq.dados && arq.dados[0] ? arq.dados[0].sessao : key);
        let sessaoFormatada = formatarNomeSessao(sessaoOriginal);
        let marcado = (primeiraVezBat || bateriasSelecionadasAntigas.includes(key)) ? 'checked' : '';
        return `<label class="checkbox-item"><input type="checkbox" value="${key}" class="filter-bateria" ${marcado}> ${escapeHtml(sessaoFormatada)}</label>`;
    }).join('');

    let listaNomesUnicos = Array.from(pilotosSet).filter(p => {
        let sKey = p.replace(/[.#$\/\[\]]/g, "_");
        if (mesclagensCache[sKey]) return false;
        return true;
    });

    pilContainer.innerHTML = listaNomesUnicos.sort().map(piloto => {
        let meta = pilotosMetadadosCache[piloto] || {};
        let labelExib = meta.apelido ? `${piloto} (${meta.apelido})` : piloto;
        let marcado = primeiraVezPil || pilotosSelecionadosAntigos.includes(piloto) ? 'checked' : '';
        return `<label class="checkbox-item"><input type="checkbox" value="${escapeHtml(piloto)}" class="filter-piloto" ${marcado}> ${escapeHtml(labelExib)}</label>`;
    }).join('');

    // Ativar escuta para atualizar quando mudar os filtros
    document.querySelectorAll('.filter-bateria, .filter-piloto, .filter-modulo').forEach(el => {
        el.onchange = atualizarDashboard;
    });

    atualizarDashboard();
}

function atualizarDashboard() {
    let dadosBase = obterTodosDadosConsolidados();
    const bateriasSel = Array.from(document.querySelectorAll('.filter-bateria:checked')).map(cb => cb.value);
    const pilotosSel = Array.from(document.querySelectorAll('.filter-piloto:checked')).map(cb => cb.value);

    const dadosFiltrados = dadosBase.filter(item => bateriasSel.includes(item.bateriaKey) && (pilotosSel.length === 0 || pilotosSel.includes(item.piloto)));

    if (listaJsonsCache.length > 0) {
        let totalV = dadosFiltrados.reduce((acc, item) => acc + (item.laps ? item.laps.length : 0), 0);
        const totalVoltasEl = document.getElementById('kpi-total-voltas');
        if (totalVoltasEl) totalVoltasEl.innerText = totalV;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (db) {
        db.ref('.info/connected').on('value', snap => {
            const badge = document.getElementById('db-status-badge');
            if (badge) {
                if (snap.val() === true) {
                    badge.style.background = "#2ec4b6";
                    badge.innerText = "Online (Firebase)";
                } else {
                    badge.style.background = "#ffb703";
                    badge.innerText = "Reconectando...";
                }
            }
        });

        db.ref('pilotosMetadados').on('value', snapshot => {
            setPilotosMetadadosCache(snapshot.val() || {});
            gerarFiltrosDinamicos();
        });

        db.ref('mesclagensPilotos').on('value', snapshot => {
            let servidorMesclagens = snapshot.val() || {};
            setMesclagensCache(Object.assign({}, ALIAS_EDGARD_DJ_DEFAULTS, servidorMesclagens));
            gerarFiltrosDinamicos();
        });

        db.ref('campeonatos').on('value', snapshot => {
            setCampeonatosCache(snapshot.val() || {});
            renderizarListaCampeonatosModal(() => {}, () => {});
        });

        db.ref('comprasColetivas').on('value', snapshot => {
            setComprasColetivasCache(snapshot.val() || {});
            renderizarListaComprasColetivas(() => {}, () => {});
        });

        db.ref('baterias').on('value', snapshot => {
            let novaLista = [];
            snapshot.forEach(childSnapshot => {
                let val = childSnapshot.val();
                if (val && val.dados && val.dados.length > 0) {
                    if (!val.historicoNomesOriginais) val.historicoNomesOriginais = {};
                    novaLista.push({ firebaseKey: childSnapshot.key, ...val });
                }
            });
            
            novaLista.sort((a, b) => {
                let nomeA = a.sessao || (a.dados && a.dados[0] ? a.dados[0].sessao : '') || '';
                let nomeB = b.sessao || (b.dados && b.dados[0] ? b.dados[0].sessao : '') || '';
                return extrairPesoOrdenacao(nomeB) - extrairPesoOrdenacao(nomeA);
            });

            setListaJsonsCache(novaLista);
            gerarFiltrosDinamicos();
        });
    }

    // Vincular botões principais do Header
    const btnUpload = document.getElementById('btn-abrir-upload');
    if (btnUpload) btnUpload.onclick = () => document.getElementById('upload-modal').style.display = 'flex';
    
    const btnCloseUpload = document.getElementById('btn-fechar-upload');
    if (btnCloseUpload) btnCloseUpload.onclick = () => document.getElementById('upload-modal').style.display = 'none';

    const btnCamp = document.getElementById('btn-abrir-campeonatos');
    if (btnCamp) btnCamp.onclick = () => document.getElementById('campeonatos-modal').style.display = 'flex';

    const btnCloseCamp = document.getElementById('btn-fechar-campeonatos');
    if (btnCloseCamp) btnCloseCamp.onclick = () => document.getElementById('campeonatos-modal').style.display = 'none';

    const btnCc = document.getElementById('btn-abrir-cc');
    if (btnCc) btnCc.onclick = () => document.getElementById('campeonatos2-modal').style.display = 'flex';

    const btnCloseCc = document.getElementById('btn-fechar-cc');
    if (btnCloseCc) btnCloseCc.onclick = () => document.getElementById('campeonatos2-modal').style.display = 'none';

    const btnPdf = document.getElementById('btn-gerar-pdf');
    if (btnPdf) btnPdf.onclick = () => window.print();
});
