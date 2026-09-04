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

    // Abertura de Modais
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
