import { 
    setDb, db, listaJsonsCache, setListaJsonsCache, campeonatosCache, setCampeonatosCache, 
    comprasColetivasCache, setComprasColetivasCache, pilotosMetadadosCache, setPilotosMetadadosCache, 
    mesclagensCache, setMesclagensCache, campeonatoAtivoKey, setCampeonatoAtivoKey, 
    campeonatoParticiparKey, setCampeonatoParticiparKey, compraAbertaKey, setCompraAbertaKey, 
    compraAbertaDados, setCompraAbertaDados, senhaCallbackPendente, setSenhaCallbackPendente, 
    SENHA_UNIFICADA, ALIAS_EDGARD_DJ_DEFAULTS 
} from './state.js';

import { 
    formatarNomeSessao, extrairPesoOrdenacao, ordenarParticipantesBateria, 
    obterTodosDadosConsolidados, parsearTextoConvertido, converterPdfParaTexto, arquivoParaBase64 
} from './telemetria.js';

import { calcularClassificacaoBancoSeparado } from './campeonatos.js';
import { gerarPayloadPixBRCode } from './compras-coletivas.js';

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
        });

        db.ref('mesclagensPilotos').on('value', snapshot => {
            let servidorMesclagens = snapshot.val() || {};
            setMesclagensCache(Object.assign({}, ALIAS_EDGARD_DJ_DEFAULTS, servidorMesclagens));
        });

        db.ref('campeonatos').on('value', snapshot => {
            setCampeonatosCache(snapshot.val() || {});
        });

        db.ref('comprasColetivas').on('value', snapshot => {
            setComprasColetivasCache(snapshot.val() || {});
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
        });
    }

    // Vincular botões principais do Header e Fechamentos
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