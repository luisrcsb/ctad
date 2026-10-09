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

    let bateriasFiltradas = (listaJsonsCache || []).filter(arq => bateriasSel.includes(arq.firebaseKey));

    if (bateriasFiltradas.length === 0) {
        container.innerHTML = `<div class="card" style="text-align: center; color: var(--text-muted);">Nenhuma bateria selecionada.</div>`;
        return;
    }

    bateriasFiltradas.forEach(arq => {
        if (!arq.dados || !Array.isArray(arq.dados)) return;

        let mapaPilotosBateria = {};

        arq.dados.forEach(d => {
            if (!d) return;
            let pNomeBruto = d.piloto || d.name || d.pilot;
            if (!pNomeBruto || !d.laps || !Array.isArray(d.laps) || d.laps.length === 0) return;

            let safeKey = pNomeBruto.replace(/[.#$\/\[\]]/g, "_");
            let pNomeReal = (mesclagensCache || {})[safeKey] || pNomeBruto;

            if (!mapaPilotosBateria[pNomeReal]) {
                mapaPilotosBateria[pNomeReal] = { piloto: pNomeReal, laps: [] };
            }
            mapaPilotosBateria[pNomeReal].laps = mapaPilotosBateria[pNomeReal].laps.concat(d.laps);
        });

        let dadosValidos = Object.values(mapaPilotosBateria).filter(d => {
            let pilotoMatch = pilotosSel.length === 0 || pilotosSel.includes(d.piloto);
            return pilotoMatch && d.laps.length > 0;
        });

        if (dadosValidos.length === 0) return;

        dadosValidos.forEach(d => {
            d.lapsNorm = d.laps.map(extrairTempoNumerico).filter(t => !isNaN(t) && t > 0);
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
                    melhorVoltaPiloto = d.piloto;
                }
            });
        });

        let sessaoNomeFormatada = formatarNomeSessao(arq.sessao || (arq.dados[0] ? (arq.dados[0].sessao || arq.dados[0].session) : arq.firebaseKey));

        let linhasTabela = dadosValidos.map((d, index) => {
            let melhorTVal = Math.min(...d.lapsNorm);
            let melhorT = melhorTVal.toFixed(3).replace('.', ',') + 's';
            let voltasTot = d.lapsNorm.length;
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

    const elTotalVoltas = document.getElementById('kpi-total-voltas');
    if (elTotalVoltas) elTotalVoltas.innerText = totalVoltasGeral;

    const elMelhorVolta = document.getElementById('kpi-melhor-volta');
    const elMelhorVoltaSub = document.getElementById('kpi-melhor-volta-sub');
    if (melhorVoltaGlobal !== Infinity) {
        if (elMelhorVolta) elMelhorVolta.innerText = melhorVoltaGlobal.toFixed(3).replace('.', ',') + 's';
        if (elMelhorVoltaSub) elMelhorVoltaSub.innerText = `Piloto: ${melhorVoltaPiloto}`;
    } else {
        if (elMelhorVolta) elMelhorVolta.innerText = "--";
        if (elMelhorVoltaSub) elMelhorVoltaSub.innerText = "--";
    }
}

function renderizarListaUploadModal() {
    const ul = document.getElementById('upload-lista-historico');
    if (!ul) return;
    let lista = listaJsonsCache || [];
    if (lista.length === 0) {
        ul.innerHTML = `<li>Nenhum arquivo no histórico.</li>`;
        return;
    }
    ul.innerHTML = lista.map(arq => {
        let nome = arq.sessao || arq.nomeArquivoOriginal || arq.firebaseKey;
        return `
            <li>
                <span>📄 ${escapeHtml(nome)}</span>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-text-action" onclick="window.inspecionarJsonUpload('${arq.firebaseKey}')">Inspecionar</button>
                    <button class="btn-text-action" style="color: var(--accent-red);" onclick="window.excluirArquivoUpload('${arq.firebaseKey}')">Excluir</button>
                </div>
            </li>
        `;
    }).join('');
}

window.inspecionarJsonUpload = (key) => {
    let arq = (listaJsonsCache || []).find(a => a.firebaseKey === key);
    const viewer = document.getElementById('upload-json-viewer');
    if (viewer && arq) {
        viewer.innerText = JSON.stringify(arq, null, 2);
    }
};

window.excluirArquivoUpload = async (key) => {
    if (confirm("Deseja realmente excluir este arquivo do banco de dados?")) {
        if (db) {
            await db.ref('baterias/' + key).remove();
            alert("Arquivo excluído com sucesso!");
        }
    }
};

function renderizarTabelaPilotosMetadados() {
    const tbody = document.getElementById('tabela-pilotos-metadados');
    if (!tbody) return;
    let keys = Object.keys(pilotosMetadadosCache || {});
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum apelido cadastrado.</td></tr>`;
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

function renderizarTabelaMesclagens() {
    const tbody = document.getElementById('tabela-mesclagens-ativas');
    const selOrigem = document.getElementById('select-piloto-origem');
    const selDestino = document.getElementById('select-piloto-destino');
    if (!tbody || !selOrigem || !selDestino) return;

    let todosPilotos = new Set();
    (listaJsonsCache || []).forEach(arq => {
        if (arq.dados && Array.isArray(arq.dados)) {
            arq.dados.forEach(d => {
                let p = d.piloto || d.name || d.pilot;
                if (p) todosPilotos.add(p);
            });
        }
    });
    Object.keys(pilotosMetadadosCache || {}).forEach(p => todosPilotos.add(p));

    let listaOrdenada = Array.from(todosPilotos).sort();
    let optionsHtml = `<option value="">Selecione um piloto...</option>`;
    listaOrdenada.forEach(p => {
        optionsHtml += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
    });
    selOrigem.innerHTML = optionsHtml;
    selDestino.innerHTML = optionsHtml;

    let mesclagensSalvas = Object.keys(mesclagensCache || {}).filter(k => !ALIAS_EDGARD_DJ_DEFAULTS[k]);
    if (mesclagensSalvas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhuma mesclagem ativa.</td></tr>`;
        return;
    }

    tbody.innerHTML = mesclagensSalvas.map(origemKey => {
        let destinoVal = mesclagensCache[origemKey];
        return `
            <tr>
                <td><strong>${escapeHtml(origemKey)}</strong></td>
                <td style="color: var(--accent-gold);"><strong>${escapeHtml(destinoVal)}</strong></td>
                <td style="text-align: right;"><button class="btn-text-action" style="color: var(--accent-red);" onclick="window.removerMesclagemPiloto('${escapeHtml(origemKey)}')">Desfazer</button></td>
            </tr>
        `;
    }).join('');
}

window.excluirPilotoMeta = async (key) => {
    if (confirm(`Deseja remover o apelido do piloto ${key}?`)) {
        if (db) {
            let safeKey = key.replace(/[.#$\/\[\]]/g, "_");
            await db.ref('pilotosMetadados/' + safeKey).remove();
            alert("Removido com sucesso!");
        }
    }
};

window.removerMesclagemPiloto = async (origemKey) => {
    if (confirm(`Deseja desfazer a mesclagem de ${origemKey}?`)) {
        if (db) {
            let safeKey = origemKey.replace(/[.#$\/\[\]]/g, "_");
            await db.ref('mesclagensPilotos/' + safeKey).remove();
            alert("Mesclagem desfeita com sucesso!");
        }
    }
};

function gerarFiltrosDinamicos() {
    const batContainer = document.getElementById('filtro-baterias-container');
    const pilContainer = document.getElementById('filtro-pilotos-container');
    if (!batContainer || !pilContainer) return;

    const pilotosSet = new Set();
    (listaJsonsCache || []).forEach(arq => {
        if (arq.dados && Array.isArray(arq.dados)) {
            arq.dados.forEach(d => { 
                let p = d.piloto || d.name || d.pilot;
                if (p && d.laps && d.laps.length > 0) {
                    let safeKey = p.replace(/[.#$\/\[\]]/g, "_");
                    let pReal = (mesclagensCache || {})[safeKey] || p;
                    pilotosSet.add(pReal); 
                } 
            });
        }
    });

    Object.keys(pilotosMetadadosCache || {}).forEach(p => {
        let safeKey = p.replace(/[.#$\/\[\]]/g, "_");
        let pReal = (mesclagensCache || {})[safeKey] || p;
        pilotosSet.add(pReal);
    });

    if ((listaJsonsCache || []).length === 0) {
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

    renderizarListaUploadModal();
    renderizarTabelaPilotosMetadados();
    renderizarTabelaMesclagens();
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

        dbInstancia.ref('mesclagensPilotos').on('value', snapshot => {
            let servidorMesclagens = snapshot.val() || {};
            setMesclagensCache(Object.assign({}, ALIAS_EDGARD_DJ_DEFAULTS, servidorMesclagens));
            gerarFiltrosDinamicos();
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
            if (!original || !apelido) { alert("Preencha o nome original e o apelido."); return; }
            if (!db) { alert("Erro: Banco não conectado."); return; }
            let safeKey = original.replace(/[.#$\/\[\]]/g, "_");
            await db.ref(`pilotosMetadados/${safeKey}`).set({ apelido: apelido });
            document.getElementById('input-piloto-original').value = "";
            document.getElementById('input-piloto-apelido').value = "";
            alert("Apelido salvo com sucesso!");
        };
    }

    // Botão Executar Mesclagem de Pilotos
    const btnMesclar = document.getElementById('btn-executar-mesclagem');
    if (btnMesclar) {
        btnMesclar.onclick = async () => {
            let origem = document.getElementById('select-piloto-origem').value;
            let destino = document.getElementById('select-piloto-destino').value;
            if (!origem || !destino) { alert("Selecione o piloto origem e o piloto destino."); return; }
            if (origem === destino) { alert("O piloto origem e destino não podem ser o mesmo."); return; }
            if (!db) { alert("Erro: Banco não conectado."); return; }

            let safeKey = origem.replace(/[.#$\/\[\]]/g, "_");
            await db.ref(`mesclagensPilotos/${safeKey}`).set(destino);
            alert(`Piloto "${origem}" mesclado com sucesso para "${destino}"!`);
            renderizarTabelaMesclagens();
        };
    }

    // Botão de Processar Upload de Arquivos
    const btnProcUpload = document.getElementById('btn-processar-upload');
    if (btnProcUpload) {
        btnProcUpload.onclick = async () => {
            const inputEl = document.getElementById('input-pdf-upload');
            if (!inputEl || !inputEl.files || inputEl.files.length === 0) { alert("Selecione arquivos PDF ou HTML."); return; }
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
                    let novoRegistro = { bateriaKey: batKey, sessao: sessaoNome, id: Date.now(), dados: dadosExtraidos, pdfBase64: pdfBase64, nomeArquivoOriginal: file.name };
                    await db.ref('baterias/' + batKey).set(novoRegistro);
                } catch (err) {
                    console.error("Erro:", err);
                    alert(`Erro ao processar ${file.name}: ${err.message}`);
                }
            }
            inputEl.value = "";
            alert("Upload(s) salvos com sucesso!");
            document.getElementById('upload-modal').style.display = 'none';
        };
    }

    // Abertura e Fechamento de Modais com atualização imediata da lista
    const btnAbrirUp = document.getElementById('btn-abrir-upload');
    if (btnAbrirUp) {
        btnAbrirUp.onclick = () => {
            const modal = document.getElementById('upload-modal');
            if (modal) modal.style.display = 'flex';
            renderizarListaUploadModal();
        };
    }

    const btnFecharUp = document.getElementById('btn-fechar-upload');
    if (btnFecharUp) {
        btnFecharUp.onclick = () => {
            const modal = document.getElementById('upload-modal');
            if (modal) modal.style.display = 'none';
        };
    }

    const btnAbrirCamp = document.getElementById('btn-abrir-campeonatos');
    if (btnAbrirCamp) {
        btnAbrirCamp.onclick = () => {
            const modal = document.getElementById('campeonatos-modal');
            if (modal) modal.style.display = 'flex';
        };
    }

    const btnFecharCamp = document.getElementById('btn-fechar-campeonatos');
    if (btnFecharCamp) {
        btnFecharCamp.onclick = () => {
            const modal = document.getElementById('campeonatos-modal');
            if (modal) modal.style.display = 'none';
        };
    }

    const btnCriarCamp = document.getElementById('btn-criar-campeonato');
    if (btnCriarCamp) btnCriarCamp.onclick = criarCampeonatoProtegido;

    const btnAbrirPil = document.getElementById('btn-abrir-pilotos');
    if (btnAbrirPil) {
        btnAbrirPil.onclick = () => {
            const modal = document.getElementById('pilotos-modal');
            if (modal) modal.style.display = 'flex';
            renderizarTabelaMesclagens();
        };
    }

    const btnFecharPil = document.getElementById('btn-fechar-pilotos');
    if (btnFecharPil) {
        btnFecharPil.onclick = () => {
            const modal = document.getElementById('pilotos-modal');
            if (modal) modal.style.display = 'none';
        };
    }

    const btnAbrirCc = document.getElementById('btn-abrir-cc');
    if (btnAbrirCc) {
        btnAbrirCc.onclick = () => {
            const modal = document.getElementById('campeonatos2-modal');
            if (modal) modal.style.display = 'flex';
        };
    }

    const btnFecharCc = document.getElementById('btn-fechar-cc');
    if (btnFecharCc) {
        btnFecharCc.onclick = () => {
            const modal = document.getElementById('campeonatos2-modal');
            if (modal) modal.style.display = 'none';
        };
    }

    const btnCriarCc = document.getElementById('btn-criar-cc');
    if (btnCriarCc) btnCriarCc.onclick = criarCompraColetiva;

    const btnGerarPdf = document.getElementById('btn-gerar-pdf');
    if (btnGerarPdf) btnGerarPdf.onclick = () => window.print();
});
