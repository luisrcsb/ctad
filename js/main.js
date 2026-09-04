import { 
    setDb, db, listaJsonsCache, setListaJsonsCache, campeonatosCache, setCampeonatosCache, 
    comprasColetivasCache, setComprasColetivasCache, pilotosMetadadosCache, setPilotosMetadadosCache, 
    mesclagensCache, setMesclagensCache, ALIAS_EDGARD_DJ_DEFAULTS 
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
    if (window.firebase && !window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
    }
    if (window.firebase) {
        setDb(window.firebase.database());
    }
} catch (e) {
    console.error("Erro crítico ao inicializar o Firebase:", e);
}

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
        batContainer.innerHTML = `<span style="font-size:0.85rem; color: var(--text-muted);">Nenhum arquivo no banco.</span>`;
        pilContainer.innerHTML = `<span style="font-size:0.85rem; color: var(--text-muted);">Nenhum piloto no banco.</span>`;
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
    const dbInstancia = db;
    if (dbInstancia) {
        dbInstancia.ref('.info/connected').on('value', snap => {
            const badge = document.getElementById('db-status-badge');
            if (badge) {
                badge.style.background = snap.val() === true ? "#2ec4b6" : "#ffb703";
                badge.innerText = snap.val() === true ? "Online (Firebase)" : "Reconectando...";
            }
        });

        dbInstancia.ref('pilotosMetadados').on('value', snapshot => { 
            setPilotosMetadadosCache(snapshot.val() || {}); 
            gerarFiltrosDinamicos(); 
        }, err => console.error("Erro em pilotosMetadados:", err));

        dbInstancia.ref('mesclagensPilotos').on('value', snapshot => { 
            let servidorMesclagens = snapshot.val() || {};
            setMesclagensCache(Object.assign({}, ALIAS_EDGARD_DJ_DEFAULTS, servidorMesclagens)); 
            gerarFiltrosDinamicos(); 
        }, err => console.error("Erro em mesclagensPilotos:", err));

        dbInstancia.ref('campeonatos').on('value', snapshot => { 
            setCampeonatosCache(snapshot.val() || {}); 
            renderizarListaCampeonatosModal(); 
        }, err => console.error("Erro em campeonatos:", err));

        dbInstancia.ref('comprasColetivas').on('value', snapshot => { 
            setComprasColetivasCache(snapshot.val() || {}); 
            renderizarListaComprasColetivas(); 
        }, err => console.error("Erro em comprasColetivas:", err));

        dbInstancia.ref('baterias').on('value', snapshot => {
            let novaLista = [];
            snapshot.forEach(child => { 
                let val = child.val(); 
                if (val && val.dados) novaLista.push({ firebaseKey: child.key, ...val }); 
            });
            novaLista.sort((a, b) => extrairPesoOrdenacao(b.sessao) - extrairPesoOrdenacao(a.sessao));
            setListaJsonsCache(novaLista);
            gerarFiltrosDinamicos();
        }, err => console.error("Erro em baterias:", err));
    } else {
        console.error("Instância do banco de dados Firebase é nula.");
    }

    // Eventos dos Botões
    const btnUpload = document.getElementById('btn-abrir-upload');
    if (btnUpload) btnUpload.onclick = () => document.getElementById('upload-modal').style.display = 'flex';
    
    const btnCloseUpload = document.getElementById('btn-fechar-upload');
    if (btnCloseUpload) btnCloseUpload.onclick = () => document.getElementById('upload-modal').style.display = 'none';

    const btnCamp = document.getElementById('btn-abrir-campeonatos');
    if (btnCamp) btnCamp.onclick = () => document.getElementById('campeonatos-modal').style.display = 'flex';

    const btnCloseCamp = document.getElementById('btn-fechar-campeonatos');
    if (btnCloseCamp) btnCloseCamp.onclick = () => document.getElementById('campeonatos-modal').style.display = 'none';

    const btnCriarCamp = document.getElementById('btn-criar-campeonato');
    if (btnCriarCamp) btnCriarCamp.onclick = criarCampeonatoProtegido;

    const btnFecharZ = document.getElementById('btn-fechar-painel-zround');
    if (btnFecharZ) btnFecharZ.onclick = fecharPainelZRoundCamp;

    const btnSalvarAba1 = document.getElementById('btn-salvar-aba1');
    if (btnSalvarAba1) btnSalvarAba1.onclick = salvarAba1ConfigGeral;

    const btnExcluirCamp = document.getElementById('btn-excluir-campeonato');
    if (btnExcluirCamp) btnExcluirCamp.onclick = excluirCampeonatoAtual;

    const btnProcTreino = document.getElementById('btn-processar-treino-grid');
    if (btnProcTreino) btnProcTreino.onclick = processarTreinoParaGrid;

    const btnUploadProva = document.getElementById('btn-upload-prova-separada');
    if (btnUploadProva) btnUploadProva.onclick = uploadProvasBancoSeparado;

    const btnFinalizarCamp = document.getElementById('btn-finalizar-campeonato');
    if (btnFinalizarCamp) btnFinalizarCamp.onclick = finalizarCampeonatoAtual;

    const btnImpPiloto = document.getElementById('btn-importar-piloto-geral');
    if (btnImpPiloto) btnImpPiloto.onclick = importarPilotoBancoGeral;

    const btnCadMan = document.getElementById('btn-cadastrar-piloto-manual');
    if (btnCadMan) btnCadMan.onclick = adicionarPilotoManualZRound;

    document.querySelectorAll('#campeonatos-modal .zround-tab-btn').forEach((btn, idx) => {
        btn.onclick = () => mudarAbaZRound(idx + 1);
    });

    const btnClosePart = document.getElementById('btn-fechar-participar');
    if (btnClosePart) btnClosePart.onclick = fecharModalParticipar;

    const btnInsPart = document.getElementById('btn-inscrever-participar');
    if (btnInsPart) btnInsPart.onclick = adicionarPilotoPorModalParticipar;

    const btnCc = document.getElementById('btn-abrir-cc');
    if (btnCc) btnCc.onclick = () => document.getElementById('campeonatos2-modal').style.display = 'flex';

    const btnCloseCc = document.getElementById('btn-fechar-cc');
    if (btnCloseCc) btnCloseCc.onclick = () => document.getElementById('campeonatos2-modal').style.display = 'none';

    const btnCriarCc = document.getElementById('btn-criar-cc');
    if (btnCriarCc) btnCriarCc.onclick = criarCompraColetiva;

    const btnCloseRes = document.getElementById('btn-fechar-resumo-fiscal');
    if (btnCloseRes) onCloseRes.onclick = () => document.getElementById('resumo-fiscal-modal').style.display = 'none';

    const btnPdf = document.getElementById('btn-gerar-pdf');
    if (btnPdf) btnPdf.onclick = () => window.print();
});
