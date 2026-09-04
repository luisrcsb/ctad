import { 
    setDb, db, listaJsonsCache, setListaJsonsCache, campeonatosCache, setCampeonatosCache, 
    comprasColetivasCache, setComprasColetivasCache, pilotosMetadadosCache, setPilotosMetadadosCache, 
    mesclagensCache, setMesclagensCache, ALIAS_EDGARD_DJ_DEFAULTS 
} from './state.js';

import { formatarNomeSessao, extrairPesoOrdenacao, converterPdfParaTexto, parsearTextoConvertido, arquivoParaBase64 } from './telemetria.js';
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

function extrairTempoNumerico(l) {
    if (l === null || l === undefined) return 0;
    if (typeof l === 'object') return Number(l.tempo ?? l.time ?? l.lapTime ?? 0);
    return Number(l);
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
        
        let dadosValidos = arq.dados.filter(d => {
            if (!d) return false;
            let pNome = d.piloto || d.name || d.pilot;
            if (!pNome) return false;
            let pilotoMatch = pilotosSel.length === 0 || pilotosSel.includes(pNome);
            let temLaps = d.laps && Array.isArray(d.laps) && d.laps.length > 0;
            return pilotoMatch && temLaps;
        });

        if (dadosValidos.length === 0) return;

        dadosValidos.forEach(d => {
            d.lapsNorm = (d.laps || []).map(extrairTempoNumerico).filter(t => !isNaN(t) && t > 0);
        });

        dadosValidos = dadosValidos.filter(d => d.lapsNorm.length > 0);

        dadosValidos.sort((a, b) => {
            let vA = a.lapsNorm.length;
            let vB = b.lapsNorm.length;
            if (vA !== vB) return vB - vA;
            let m1 = Math.min(...a.lapsNorm);
            let m2 = Math.min(...b.lapsNorm);
            return m1 - m2;
        });

        dadosValidos.forEach(d => {
            totalVoltasGeral += d.lapsNorm.length;
            d.lapsNorm.forEach(t => {
                if (t < melhorVoltaGlobal) {
                    melhorVoltaGlobal = t;
                    melhorVoltaPiloto = d.piloto || d.name;
                }
            });
        });

        let sessaoNomeFormatada = formatarNomeSessao(arq.sessao || (arq.dados[0] ? (arq.dados[0].sessao || arq.dados[0].session) : arq.firebaseKey));

        let linhasTabela = dadosValidos.map((d, index) => {
            let melhorTVal = Math.min(...d.lapsNorm);
            let melhorT = melhorTVal.toFixed(3).replace('.', ',') + 's';
            let voltasTot = d.lapsNorm.length;
            let nomeP = d.piloto || d.name || "Piloto";
            return `
                <tr>
                    <td><span class="pos-badge">${index + 1}º</span></td>
                    <td><strong>${escapeHtml(nomeP)}</strong></td>
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
    } else {
        document.getElementById('kpi-melhor-volta').innerText = "--";
        document.getElementById('kpi-melhor-volta-sub').innerText = "--";
    }
}

function renderizarTabelaPilotosMetadados() {
    const tbody = document.getElementById('tabela-pilotos-metadados');
    if (!tbody) return;
    let keys = Object.keys(pilotosMetadadosCache);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum piloto configurado.</td></tr>`;
        return;
    }
    tbody.innerHTML = keys.map(k => {
        let meta = pilotosMetadadosCache[k];
        return `
            <tr>
                <td><strong>${escapeHtml(k)}</strong></td>
                <td>${escapeHtml(meta.apelido || '')}</td>
                <td style="text-align: right;"><button class="btn-text-action" style="color: var(--accent-red);" onclick="window.excluirPilotoMeta('${escapeHtml(k)}')">Remover</button></td>
            </tr>
        `;
    }).join('');
}

window.excluirPilotoMeta = async (key) => {
    if (confirm(`Deseja remover a configuração do piloto ${key}?`)) {
        if (db) {
            let safeKey = key.replace(/[.#$\/\[\]]/g, "_");
            await db.ref('pilotosMetadados/' + safeKey).remove();
            alert("Removido com sucesso!");
        }
    }
};

function gerarFiltrosDinamicos() {
    const batContainer = document.getElementById('filtro-baterias-container');
    const pilContainer = document.getElementById('filtro-pilotos-container');
    if (!batContainer || !pilContainer) return;

    const pilotosSet = new Set();
    listaJsonsCache.forEach(arq => {
        if (arq.dados && Array.isArray(arq.dados)) {
            arq.dados.forEach(d => { 
                let p = d.piloto || d.name || d.pilot;
                if (p && d.laps && d.laps.length > 0) pilotosSet.add(p); 
            });
        }
    });

    Object.keys(pilotosMetadadosCache).forEach(p => pilotosSet.add(p));

    if (listaJsonsCache.length === 0) {
        batContainer.innerHTML = `<span style="font-size:0.82rem; color: var(--accent-gold);">ℹ️ Nenhum arquivo encontrado.</span>`;
        pilContainer.innerHTML = `<span style="font-size:0.82rem; color: var(--text-muted);">Aguardando...</span>`;
        return;
    }

    batContainer.innerHTML = listaJsonsCache.map(arq => {
        let key = arq.firebaseKey;
        let sessaoOriginal = arq.sessao || (arq.dados && arq.dados[0] ? (arq.dados[0].sessao || arq.dados[0].session) : key);
        return `<label class="checkbox-item"><input type="checkbox" value="${key}" class="filter-bateria" checked> ${formatarNomeSessao(sessaoOriginal)}</label>`;
    }).join('');

    pilContainer.innerHTML = Array.from(pilotosSet).sort().map(piloto => {
        return `<label class="checkbox-item"><input type="checkbox" value="${piloto}" class="filter-piloto" checked> ${piloto}</label>`;
    }).join('');

    document.querySelectorAll('.filter-bateria, .filter-piloto, .filter-modulo').forEach(el => {
        el.onchange = atualizarDashboard;
    });

    const btnLimparBat = document.getElementById('btn-limpar-bateria');
    if (btnLimparBat) btnLimparBat.onclick = () => {
        document.querySelectorAll('.filter-bateria').forEach(cb => cb.checked = false);
        atualizarDashboard();
    };

    const btnLimparPil = document.getElementById('btn-limpar-piloto');
    if (btnLimparPil) btnLimparPil.onclick = () => {
        document.querySelectorAll('.filter-piloto').forEach(cb => cb.checked = false);
        atualizarDashboard();
    };

    renderizarTabelaPilotosMetadados();
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

        dbInstancia.ref('pilotosMetadados').on('value', snapshot => { 
            setPilotosMetadadosCache(snapshot.val() || {}); 
            renderizarTabelaPilotosMetadados();
        });
        dbInstancia.ref('campeonatos').on('value', snapshot => { setCampeonatosCache(snapshot.val() || {}); renderizarListaCampeonatosModal(); });
        dbInstancia.ref('comprasColetivas').on('value', snapshot => { setComprasColetivasCache(snapshot.val() || {}); renderizarListaComprasColetivas(); });
    }

    // Botão Salvar Metadados do Piloto
    const btnSalvarMeta = document.getElementById('btn-salvar-meta-piloto');
    if (btnSalvarMeta) {
        btnSalvarMeta.onclick = async () => {
            let original = document.getElementById('input-piloto-original').value.trim();
            let apelido = document.getElementById('input-piloto-apelido').value.trim();
            if (!original || !apelido) {
                alert("Preencha o nome original e o apelido.");
                return;
            }
            if (!db) { alert("Erro: Banco não conectado."); return; }
            let safeKey = original.replace(/[.#$\/\[\]]/g, "_");
            await db.ref(`pilotosMetadados/${safeKey}`).set({ apelido: apelido });
            document.getElementById('input-piloto-original').value = "";
            document.getElementById('input-piloto-apelido').value = "";
            alert("Configuração de piloto salva com sucesso!");
        };
    }

    // Abertura e Fechamento do Modal de Pilotos
    const btnAbriPil = document.getElementById('btn-abrir-pilotos');
    if (btnAbriPil) btnAbriPil.onclick = () => document.getElementById('pilotos-modal').style.display = 'flex';
    const btnFechPil = document.getElementById('btn-fechar-pilotos');
    if (btnFechPil) btnFechPil.onclick = () => document.getElementById('pilotos-modal').style.display = 'none';

    // Outros botões
    const btnProcUpload = document.getElementById('btn-processar-upload');
    if (btnProcUpload) {
        btnProcUpload.onclick = async () => {
            const inputEl = document.getElementById('input-pdf-upload');
            if (!inputEl || !inputEl.files || inputEl.files.length === 0) {
                alert("Selecione pelo menos um arquivo PDF ou HTML.");
                return;
            }
            if (!db) { alert("Erro: Banco não conectado."); return; }

            for (let file of inputEl.files) {
                try {
                    let textoExtraido = "";
                    const extensao = file.name.split('.').pop().toLowerCase();
                    if (extensao === 'html' || extensao === 'htm') {
                        const htmlText = await file.text();
                        const parser = new DOMParser();
                        const docHtml = parser.parseFromString(htmlText, 'text/html');
                        textoExtraido = docHtml.body.innerText;
                    } else {
                        textoExtraido = await converterPdfParaTexto(file);
                    }

                    let sessaoNome = file.name.replace(/\.[^/.]+$/, "").trim();
                    let dadosExtraidos = parsearTextoConvertido(textoExtraido, sessaoNome, "bat_" + Date.now());
                    
                    if (!dadosExtraidos || dadosExtraidos.length === 0) {
                        alert(`Aviso: Não foi possível extrair dados válidos de ${file.name}`);
                        continue;
                    }

                    let pdfBase64 = await arquivoParaBase64(file);
                    let batKey = "bat_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
                    let novoRegistro = {
                        bateriaKey: batKey, sessao: sessaoNome, id: Date.now(),
                        dados: dadosExtraidos, pdfBase64: pdfBase64, nomeArquivoOriginal: file.name
                    };

                    await db.ref('baterias/' + batKey).set(novoRegistro);
                } catch (err) {
                    console.error("Erro:", err);
                    alert(`Erro ao processar ${file.name}: ${err.message}`);
                }
            }

            inputEl.value = "";
            alert("Upload(s) salvos com sucesso no Firebase!");
            document.getElementById('upload-modal').style.display = 'none';
        };
    }

    const bUpload = document.getElementById('btn-abrir-upload');
    if (bUpload) bUpload.onclick = () => document.getElementById('upload-modal').style.display = 'flex';
    const bCloseUp = document.getElementById('btn-fechar-upload');
    if (bCloseUp) bCloseUp.onclick = () => document.getElementById('upload-modal').style.display = 'none';

    const bCamp = document.getElementById('btn-abrir-campeonatos');
    if (bCamp) bCamp.onclick = () => document.getElementById('campeonatos-modal').style.display = 'flex';
    const bCloseCamp = document.getElementById('btn-fechar-campeonatos');
    if (bCloseCamp) bCloseCamp.onclick = () => document.getElementById('campeonatos-modal').style.display = 'none';
    const bCriarCamp = document.getElementById('btn-criar-campeonato');
    if (bCriarCamp) bCriarCamp.onclick = criarCampeonatoProtegido;

    const bCc = document.getElementById('btn-abrir-cc');
    if (bCc) bCc.onclick = () => document.getElementById('campeonatos2-modal').style.display = 'flex';
    const bCloseCc = document.getElementById('btn-fechar-cc');
    if (bCloseCc) bCloseCc.onclick = () => document.getElementById('campeonatos2-modal').style.display = 'none';
    const bCriarCc = document.getElementById('btn-criar-cc');
    if (bCriarCc) bCriarCc.onclick = criarCompraColetiva;

    const bPdf = document.getElementById('btn-gerar-pdf');
    if (bPdf) bPdf.onclick = () => window.print();
});
