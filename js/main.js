import { 
    setDb, db, listaJsonsCache, setListaJsonsCache, campeonatosCache, setCampeonatosCache, 
    comprasColetivasCache, setComprasColetivasCache, pilotosMetadadosCache, setPilotosMetadadosCache, 
    mesclagensCache, setMesclagensCache, campeonatoAtivoKey, campeonatoParticiparKey, 
    ALIAS_EDGARD_DJ_DEFAULTS 
} from './state.js';

import { formatarNomeSessao, extrairPesoOrdenacao, obterTodosDadosConsolidados } from './telemetria.js';
import { 
    renderizarListaCampeonatosModal, criarCampeonatoProtegido, fecharPainelZRoundCamp, 
    mudarAbaZRound, salvarAba1ConfigGeral, excluirCampeonatoAtual, processarTreinoParaGrid, 
    uploadProvasBancoSeparado, excluirProvaBancoSeparado, finalizarCampeonatoAtual, 
    importarPilotoBancoGeral, adicionarPilotoManualZRound, removerPilotoCampeonatoZRound, 
    fecharModalParticipar, adicionarPilotoPorModalParticipar, removerPilotoParticipar 
} from './campeonatos.js';
import { renderizarListaComprasColetivas, criarCompraColetiva } from './compras-coletivas.js';

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

// Expor funções globais para os botões do HTML funcionarem sem erro
window.removerPilotoCampZRound = removerPilotoCampeonatoZRound;
window.excluirProvaSep = excluirProvaBancoSeparado;
window.removerPilotoPart = removerPilotoParticipar;
window.abrirResumoFiscalModal = (key) => { document.getElementById('resumo-fiscal-modal').style.display = 'flex'; };
window.abrirGerenciadorCompraModal = (key) => { document.getElementById('campeonatos2-modal').style.display = 'flex'; };

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
        batContainer.innerHTML = `<span style="font-size:0.85rem; color: var(--text-muted);">Nenhum arquivo.</span>`;
        pilContainer.innerHTML = `<span style="font-size:0.85rem; color: var(--text-muted);">Nenhum piloto.</span>`;
        return;
    }

    batContainer.innerHTML = listaJsonsCache.map(arq => {
        let key = arq.firebaseKey;
        let sessaoOriginal = arq.sessao || (arq.dados && arq.dados[0] ? arq.dados[0].sessao : key);
        return `<label class="checkbox-item"><input type="checkbox" value="${key}" class="filter-bateria" checked> ${formatarNomeSessao(sessaoOriginal)}</label>`;
    }).join('');

    pilContainer.innerHTML = Array.from(pilotosSet).sort().map(piloto => {
        let meta = pilotosMetadadosCache[piloto] || {};
        let labelExib = meta.apelido ? `${piloto} (${meta.apelido})` : piloto;
        return `<label class="checkbox-item"><input type="checkbox" value="${piloto}" class="filter-piloto" checked> ${labelExib}</label>`;
    }).join('');
}

document.addEventListener("DOMContentLoaded", () => {
    if (db) {
        db.ref('.info/connected').on('value', snap => {
            const badge = document.getElementById('db-status-badge');
            if (badge) {
                badge.style.background = snap.val() === true ? "#2ec4b6" : "#ffb703";
                badge.innerText = snap.val() === true ? "Online (Firebase)" : "Reconectando...";
            }
        });

        db.ref('pilotosMetadados').on('value', snapshot => { setPilotosMetadadosCache(snapshot.val() || {}); gerarFiltrosDinamicos(); });
        db.ref('mesclagensPilotos').on('value', snapshot => { setMesclagensCache(Object.assign({}, ALIAS_EDGARD_DJ_DEFAULTS, snapshot.val() || {})); gerarFiltrosDinamicos(); });
        db.ref('campeonatos').on('value', snapshot => { setCampeonatosCache(snapshot.val() || {}); renderizarListaCampeonatosModal(); });
        db.ref('comprasColetivas').on('value', snapshot => { setComprasColetivasCache(snapshot.val() || {}); renderizarListaComprasColetivas(); });
        db.ref('baterias').on('value', snapshot => {
            let novaLista = [];
            snapshot.forEach(child => { let val = child.val(); if (val && val.dados) novaLista.push({ firebaseKey: child.key, ...val }); });
            novaLista.sort((a, b) => extrairPesoOrdenacao(b.sessao) - extrairPesoOrdenacao(a.sessao));
            setListaJsonsCache(novaLista);
            gerarFiltrosDinamicos();
        });
    }

    // Eventos dos Botões do Header e Modais
    document.getElementById('btn-abrir-upload').onclick = () => document.getElementById('upload-modal').style.display = 'flex';
    document.getElementById('btn-fechar-upload').onclick = () => document.getElementById('upload-modal').style.display = 'none';

    document.getElementById('btn-abrir-campeonatos').onclick = () => document.getElementById('campeonatos-modal').style.display = 'flex';
    document.getElementById('btn-fechar-campeonatos').onclick = () => document.getElementById('campeonatos-modal').style.display = 'none';
    document.getElementById('btn-criar-campeonato').onclick = criarCampeonatoProtegido;
    document.getElementById('btn-fechar-painel-zround').onclick = fecharPainelZRoundCamp;
    document.getElementById('btn-salvar-aba1').onclick = salvarAba1ConfigGeral;
    document.getElementById('btn-excluir-campeonato').onclick = excluirCampeonatoAtual;
    document.getElementById('btn-processar-treino-grid').onclick = processarTreinoParaGrid;
    document.getElementById('btn-upload-prova-separada').onclick = uploadProvasBancoSeparado;
    document.getElementById('btn-finalizar-campeonato').onclick = finalizarCampeonatoAtual;
    document.getElementById('btn-importar-piloto-geral').onclick = importarPilotoBancoGeral;
    document.getElementById('btn-cadastrar-piloto-manual').onclick = adicionarPilotoManualZRound;

    document.querySelectorAll('#campeonatos-modal .zround-tab-btn').forEach((btn, idx) => {
        btn.onclick = () => mudarAbaZRound(idx + 1);
    });

    document.getElementById('btn-fechar-participar').onclick = fecharModalParticipar;
    document.getElementById('btn-inscrever-participar').onclick = adicionarPilotoPorModalParticipar;

    document.getElementById('btn-abrir-cc').onclick = () => document.getElementById('campeonatos2-modal').style.display = 'flex';
    document.getElementById('btn-fechar-cc').onclick = () => document.getElementById('campeonatos2-modal').style.display = 'none';
    document.getElementById('btn-criar-cc').onclick = criarCompraColetiva;

    document.getElementById('btn-fechar-resumo-fiscal').onclick = () => document.getElementById('resumo-fiscal-modal').style.display = 'none';
    document.getElementById('btn-gerar-pdf').onclick = () => window.print();
});
