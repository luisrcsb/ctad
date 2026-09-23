/* CTAD - Central de Telemetria — Compras Coletivas
   Depende de variáveis globais do script principal:
   'db' (Firebase), 'comprasColetivasCache', 'compraGerenciandoKey', 'escapeHtml()'. */

        window.abrirModalCompras = function() {
            compraGerenciandoKey = null;
            document.getElementById('compras-modal').style.display = 'flex';
            renderizarModalComprasColetivas();
        };

        window.fecharModalCompras = function() { document.getElementById('compras-modal').style.display = 'none'; };

        window.criarCompraColetiva = async function() {
            if (!db) return;
            let item = document.getElementById('input-compra-item').value.trim();
            let preco = parseFloat(document.getElementById('input-compra-preco').value) || 0;
            let qtdMin = parseInt(document.getElementById('input-compra-qtd-min').value, 10) || 1;
            if (!item) return;

            let dadosBase = obterTodosDadosConsolidados();
            let pilotosSet = new Set(PILOTOS_CORE_PADRAO);
            dadosBase.forEach(d => { if (d.piloto && d.piloto.trim()) pilotosSet.add(d.piloto.trim()); });
            Object.keys(pilotosMetadadosCache).forEach(p => { if (p && p.trim()) pilotosSet.add(p.trim()); });

            let participantesObj = {};
            Array.from(pilotosSet).filter(p => p && p.trim()).sort().forEach(pNome => {
                let pKey = "part_" + pNome.toLowerCase().replace(/[^a-z0-9]/g, "_");
                participantesObj[pKey] = {
                    nome: pNome, ativo: true, comprador: (pNome === "Raphael"), valorDevido: 0, pago: (pNome === "Raphael"), pixPersonalizado: ""
                };
            });

            let criadoEm = Date.now();
            let compraKey = "compra_" + criadoEm;
            try {
                await db.ref(`comprasColetivas/${compraKey}`).set({
                    chave: compraKey, criadoEm: criadoEm, nome: item, precoUnitario: preco, qtdMinima: qtdMin, status: "EM ANDAMENTO / PENDENTE",
                    entregue: false, rastreio: "", financeiro: { subtotal: 0, desconto: 0, frete: 0, imposto: 0, icms: 0, outros: 0 },
                    chavePix: "", itens: [{ imagem: "", descricao: item, link: "", valor: preco, qtd: 1, atribuidoA: "TODOS" }],
                    participantes: participantesObj
                });
                document.getElementById('input-compra-item').value = "";
                document.getElementById('input-compra-preco').value = "";
                document.getElementById('input-compra-qtd-min').value = "";
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.gerenciarCompraColetiva = function(compraKey) {
            compraGerenciandoKey = compraKey;
            renderizarModalComprasColetivas();
        };

        window.voltarParaListaCompras = function() {
            compraGerenciandoKey = null;
            renderizarModalComprasColetivas();
        };

        function sincronizarParticipantesCompra(comp) {
            let dadosBase = obterTodosDadosConsolidados();
            let pilotosSet = new Set(PILOTOS_CORE_PADRAO);
            dadosBase.forEach(d => { if (d.piloto && d.piloto.trim()) pilotosSet.add(d.piloto.trim()); });
            Object.keys(pilotosMetadadosCache).forEach(p => { if (p && p.trim()) pilotosSet.add(p.trim()); });
            if (!comp.participantes) comp.participantes = {};

            pilotosSet.forEach(pNome => {
                if (!pNome || !pNome.trim()) return;
                let pKey = "part_" + pNome.toLowerCase().replace(/[^a-z0-9]/g, "_");
                if (!comp.participantes[pKey]) {
                    comp.participantes[pKey] = { nome: pNome.trim(), ativo: true, comprador: false, valorDevido: 0, pago: false, pixPersonalizado: "" };
                }
            });
        }

        function calcularValoresDevidosCompra(comp) {
            let itens = comp.itens || [];
            let participantes = comp.participantes || {};
            let fin = comp.financeiro || { subtotal: 0, desconto: 0, frete: 0, imposto: 0, icms: 0, outros: 0 };

            let pKeys = Object.keys(participantes).filter(pk => participantes[pk] && participantes[pk].nome && participantes[pk].nome.trim() !== "");
            let activeKeys = pKeys.filter(pk => participantes[pk].ativo);
            let totalAtivos = activeKeys.length;

            let ajusteTotal = -(fin.desconto || 0) + (fin.frete || 0) + (fin.imposto || 0) + (fin.icms || 0) + (fin.outros || 0);
            let ajustePorAtivo = totalAtivos > 0 ? (ajusteTotal / totalAtivos) : 0;

            let totalItensTodos = itens.filter(it => it.atribuidoA === 'TODOS').reduce((acc, it) => acc + ((it.valor || 0) * (it.qtd || 1)), 0);
            let valorTodosPorAtivo = totalAtivos > 0 ? (totalItensTodos / totalAtivos) : 0;

            pKeys.forEach(pk => {
                let p = participantes[pk];
                let specificCost = itens.filter(it => it.atribuidoA === p.nome).reduce((acc, it) => acc + ((it.valor || 0) * (it.qtd || 1)), 0);
                let sharedCost = p.ativo ? valorTodosPorAtivo : 0;
                let adjCost = p.ativo ? ajustePorAtivo : 0;
                p.valorDevido = parseFloat((specificCost + sharedCost + adjCost).toFixed(2));
            });
        }

        window.alternarEntregueCompra = async function(compraKey) {
            if (!db) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            comp.entregue = !comp.entregue;

            let participantes = comp.participantes || {};
            let ativos = Object.values(participantes).filter(p => p && p.ativo);
            let quitada = (ativos.length > 0 && ativos.filter(p => p.pago).length === ativos.length);

            if (quitada && comp.entregue) comp.status = "FINALIZADA / CONCLUÍDA";
            else if (comp.entregue) comp.status = "ENTREGUE";
            else if (quitada) comp.status = "QUITADA";
            else comp.status = "EM ANDAMENTO / PENDENTE";

            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.salvarCompraGerenciada = async function(compraKey) {
            if (!db) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;

            let nomeInput = document.getElementById('det-nome-compra');
            if (nomeInput) comp.nome = nomeInput.value.trim();
            comp.entregue = document.getElementById('det-entregue')?.checked || false;

            comp.financeiro = {
                subtotal: parseFloat(document.getElementById('fin-subtotal')?.value) || 0,
                desconto: parseFloat(document.getElementById('fin-desconto')?.value) || 0,
                frete: parseFloat(document.getElementById('fin-frete')?.value) || 0,
                imposto: parseFloat(document.getElementById('fin-imposto')?.value) || 0,
                icms: parseFloat(document.getElementById('fin-icms')?.value) || 0,
                outros: parseFloat(document.getElementById('fin-outros')?.value) || 0
            };

            comp.chavePix = document.getElementById('det-chave-pix')?.value.trim() || "";
            comp.rastreio = document.getElementById('det-rastreio')?.value.trim() || "";

            let novasItens = [];
            document.querySelectorAll('.det-item-row').forEach(row => {
                let idx = row.getAttribute('data-index');
                novasItens.push({
                    imagem: document.getElementById(`item-img-${idx}`)?.value || "",
                    descricao: document.getElementById(`item-desc-${idx}`)?.value || "",
                    link: document.getElementById(`item-link-${idx}`)?.value || "",
                    valor: parseFloat(document.getElementById(`item-val-${idx}`)?.value) || 0,
                    qtd: parseInt(document.getElementById(`item-qtd-${idx}`)?.value, 10) || 1,
                    atribuidoA: document.getElementById(`item-atr-${idx}`)?.value || "TODOS"
                });
            });
            comp.itens = novasItens;

            let novosParticipantes = {};
            document.querySelectorAll('.det-part-row').forEach(row => {
                let pKey = row.getAttribute('data-pkey');
                let nome = row.getAttribute('data-nome');
                if (!nome || !nome.trim()) return;
                novosParticipantes[pKey] = {
                    nome: nome.trim(),
                    ativo: document.getElementById(`part-ativo-${pKey}`)?.checked || false,
                    comprador: document.getElementById(`part-comprador-${pKey}`)?.checked || false,
                    valorDevido: 0,
                    pago: document.getElementById(`part-pago-${pKey}`)?.checked || false,
                    pixPersonalizado: document.getElementById(`part-recibo-${pKey}`)?.value || ""
                };
            });
            comp.participantes = novosParticipantes;
            calcularValoresDevidosCompra(comp);

            let ativos = Object.values(novosParticipantes).filter(p => p && p.ativo);
            let quitada = (ativos.length > 0 && ativos.filter(p => p.pago).length === ativos.length);
            if (quitada && comp.entregue) comp.status = "FINALIZADA / CONCLUÍDA";
            else if (comp.entregue) comp.status = "ENTREGUE";
            else if (quitada) comp.status = "QUITADA";
            else comp.status = "EM ANDAMENTO / PENDENTE";

            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                alert("Salvo com sucesso!");
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.adicionarItemCompra = async function(compraKey) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            if (!comp.itens) comp.itens = [];
            comp.itens.push({ imagem: "", descricao: "Novo Item", link: "", valor: 0.0, qtd: 1, atribuidoA: "TODOS" });
            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.removerItemCompra = async function(compraKey, index) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp || !comp.itens) return;
            comp.itens.splice(index, 1);
            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.adicionarParticipanteCompra = async function(compraKey) {
            let nomeInput = document.getElementById('input-novo-participante-compra');
            let nome = nomeInput ? nomeInput.value.trim() : "";
            if (!nome) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            if (!comp.participantes) comp.participantes = {};
            let pKey = "part_" + nome.toLowerCase().replace(/[^a-z0-9]/g, "_");
            comp.participantes[pKey] = { nome, ativo: true, comprador: false, valorDevido: 0, pago: false, pixPersonalizado: "" };
            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                if (nomeInput) nomeInput.value = "";
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.removerParticipanteCompra = async function(compraKey, pKey) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp || !comp.participantes) return;
            delete comp.participantes[pKey];
            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.finalizarCompraColetivaStatus = async function(compraKey) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            comp.entregue = true;
            comp.status = "FINALIZADA / CONCLUÍDA";
            try {
                await db.ref(`comprasColetivas/${compraKey}`).set(comp);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.excluirCompraColetiva = async function(compraKey) {
            if (!isAdminLogado) { alert("🔒 Faça login como administrador primeiro."); return; }
            if (confirm("Excluir esta compra coletiva?")) {
                try {
                    await db.ref(`comprasColetivas/${compraKey}`).remove();
                    compraGerenciandoKey = null;
                    renderizarModalComprasColetivas();
                } catch(err) { alert("Erro: " + err.message); }
            }
        };

        function renderizarModalComprasColetivas() {
            let tituloEl = document.getElementById('compras-modal-titulo');
            let bodyEl = document.getElementById('compras-modal-body');
            if (!bodyEl) return;

            if (compraGerenciandoKey && comprasColetivasCache[compraGerenciandoKey]) {
                let comp = comprasColetivasCache[compraGerenciandoKey];
                sincronizarParticipantesCompra(comp);
                calcularValoresDevidosCompra(comp);

                if (tituloEl) tituloEl.innerHTML = `🛒 Gestão de Compra Coletiva`;

                let itens = comp.itens || [];
                let participantes = comp.participantes || {};
                let fin = comp.financeiro || { subtotal: 0, desconto: 0, frete: 0, imposto: 0, icms: 0, outros: 0 };
                let calcSubtotal = itens.reduce((acc, it) => acc + ((it.valor || 0) * (it.qtd || 1)), 0);
                let valorGlobalFinal = calcSubtotal - (fin.desconto || 0) + (fin.frete || 0) + (fin.imposto || 0) + (fin.icms || 0) + (fin.outros || 0);

                let ativosArr = Object.values(participantes).filter(p => p && p.ativo);
                let pagosAtivos = ativosArr.filter(p => p.pago).length;
                let quitada = (ativosArr.length > 0 && pagosAtivos === ativosArr.length);

                let dadosBase = obterTodosDadosConsolidados();
                let pilotosSet = new Set(PILOTOS_CORE_PADRAO);
                dadosBase.forEach(d => { if (d.piloto && d.piloto.trim()) pilotosSet.add(d.piloto.trim()); });
                Object.keys(pilotosMetadadosCache).forEach(p => { if (p && p.trim()) pilotosSet.add(p.trim()); });
                Object.values(participantes).forEach(p => { if (p && p.nome && p.nome.trim()) pilotosSet.add(p.nome.trim()); });
                let listaPilotosDisponiveis = Array.from(pilotosSet).filter(p => p && p.trim()).sort();

                let itensHtml = itens.map((it, idx) => {
                    let subtotalItem = (it.valor || 0) * (it.qtd || 1);
                    let optionsPilotos = `<option value="TODOS" ${it.atribuidoA === 'TODOS' ? 'selected' : ''}>TODOS</option>` +
                        listaPilotosDisponiveis.map(p => `<option value="${escapeHtml(p)}" ${it.atribuidoA === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
                    
                    return `
                        <div class="det-item-row" data-index="${idx}" style="display: grid; grid-template-columns: 1fr 1.8fr 1.2fr 75px 45px 85px 1.2fr 32px; gap: 6px; align-items: center; margin-bottom: 6px;">
                            <input type="text" id="item-img-${idx}" class="config-input" value="${escapeHtml(it.imagem || '')}" placeholder="Img URL" style="font-size: 0.75rem;">
                            <input type="text" id="item-desc-${idx}" class="config-input" value="${escapeHtml(it.descricao || '')}" placeholder="Descrição" style="font-size: 0.75rem;">
                            <input type="text" id="item-link-${idx}" class="config-input" value="${escapeHtml(it.link || '')}" placeholder="Link" style="font-size: 0.75rem;">
                            <input type="number" step="0.001" id="item-val-${idx}" class="config-input" value="${it.valor || 0}" placeholder="Valor" style="font-size: 0.75rem;">
                            <input type="number" id="item-qtd-${idx}" class="config-input" value="${it.qtd || 1}" placeholder="Qtd" style="font-size: 0.75rem;">
                            <span style="color: var(--accent-gold); font-weight: 700; font-size: 0.78rem;">R$ ${subtotalItem.toFixed(2)}</span>
                            <select id="item-atr-${idx}" class="config-select" style="font-size: 0.75rem;">${optionsPilotos}</select>
                            <button class="btn-action-danger" style="padding: 3px 6px;" onclick="removerItemCompra('${compraGerenciandoKey}', ${idx})">🗑️</button>
                        </div>
                    `;
                }).join('');

                let participantesHtml = Object.keys(participantes).filter(pk => participantes[pk] && participantes[pk].nome).map(pk => {
                    let p = participantes[pk];
                    return `
                        <div class="det-part-row" data-pkey="${pk}" data-nome="${escapeHtml(p.nome)}" style="display: grid; grid-template-columns: 40px 1.8fr 60px 80px 60px 2fr 32px; gap: 6px; align-items: center; background: rgba(21,28,40,0.6); padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-card); margin-bottom: 4px;">
                            <div style="text-align: center;"><input type="checkbox" id="part-ativo-${pk}" ${p.ativo ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent-green); cursor: pointer;"></div>
                            <div><strong style="font-size: 0.82rem;">${escapeHtml(p.nome)}</strong></div>
                            <div style="text-align: center;"><input type="radio" name="comprador_radio" id="part-comprador-${pk}" ${p.comprador ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent-blue); cursor: pointer;"></div>
                            <div style="color: var(--accent-gold); font-weight: 700; font-size: 0.82rem;">R$ ${(p.valorDevido || 0).toFixed(2)}</div>
                            <div style="text-align: center;"><input type="checkbox" id="part-pago-${pk}" ${p.pago ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent-green); cursor: pointer;"></div>
                            <div><input type="text" id="part-recibo-${pk}" class="config-input" value="${escapeHtml(p.pixPersonalizado || '')}" placeholder="Pix Copia e Cola" style="width: 100%; font-size: 0.75rem;"></div>
                            <div style="text-align: right;"><button class="btn-action-danger" style="padding: 3px 6px;" onclick="removerParticipanteCompra('${compraGerenciandoKey}', '${pk}')">🗑️</button></div>
                        </div>
                    `;
                }).join('');

                bodyEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; background: var(--bg-input); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-card);">
                        <span style="font-size: 0.85rem; font-weight: 700; color: var(--accent-gold);">Gerenciando: ${escapeHtml(comp.chave)}</span>
                        <button class="btn-action-primary" style="background: #3a86ff; padding: 5px 10px; font-size: 0.75rem;" onclick="voltarParaListaCompras()">⬅️ Voltar</button>
                    </div>

                    <div class="config-panel" style="background: rgba(46,196,182,0.06); border: 1px solid var(--accent-green);">
                        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between;">
                            <label class="checkbox-item" style="font-weight: 700; font-size: 0.82rem;">
                                <input type="checkbox" id="det-entregue" ${comp.entregue ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-green); cursor: pointer;">
                                Produto Entregue ✅
                            </label>
                            <div style="font-size: 0.8rem;">Pagamentos: <strong style="color: ${quitada ? 'var(--accent-green)' : 'var(--accent-gold)'};">${pagosAtivos}/${ativosArr.length} pagos</strong></div>
                        </div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">1. Nome da Compra</div>
                        <input type="text" id="det-nome-compra" class="config-input" value="${escapeHtml(comp.nome || '')}">
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">2. Itens da Compra</div>
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                            ${itensHtml}
                        </div>
                        <div><button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 5px 10px; font-size: 0.75rem;" onclick="adicionarItemCompra('${compraGerenciandoKey}')">+ Item</button></div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">3. Financeiro & Impostos</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px;">
                            <div>
                                <label style="font-size: 0.65rem; color: var(--text-muted);">SUBTOTAL</label>
                                <input type="number" step="0.01" id="fin-subtotal" class="config-input" value="${calcSubtotal.toFixed(2)}" readonly style="width: 100%; margin-top: 2px; background: var(--bg-body); font-size: 0.78rem;">
                            </div>
                            <div>
                                <label style="font-size: 0.65rem; color: var(--text-muted);">DESCONTO</label>
                                <input type="number" step="0.01" id="fin-desconto" class="config-input" value="${fin.desconto || 0}" style="width: 100%; margin-top: 2px; font-size: 0.78rem;">
                            </div>
                            <div>
                                <label style="font-size: 0.65rem; color: var(--text-muted);">FRETE</label>
                                <input type="number" step="0.01" id="fin-frete" class="config-input" value="${fin.frete || 0}" style="width: 100%; margin-top: 2px; font-size: 0.78rem;">
                            </div>
                            <div>
                                <label style="font-size: 0.65rem; color: var(--text-muted);">IMPOSTO</label>
                                <input type="number" step="0.01" id="fin-imposto" class="config-input" value="${fin.imposto || 0}" style="width: 100%; margin-top: 2px; font-size: 0.78rem;">
                            </div>
                            <div>
                                <label style="font-size: 0.65rem; color: var(--text-muted);">ICMS</label>
                                <input type="number" step="0.01" id="fin-icms" class="config-input" value="${fin.icms || 0}" style="width: 100%; margin-top: 2px; font-size: 0.78rem;">
                            </div>
                            <div>
                                <label style="font-size: 0.65rem; color: var(--text-muted);">OUTROS</label>
                                <input type="number" step="0.01" id="fin-outros" class="config-input" value="${fin.outros || 0}" style="width: 100%; margin-top: 2px; font-size: 0.78rem;">
                            </div>
                        </div>
                        <div style="background: rgba(255,183,3,0.1); border: 1px dashed var(--accent-gold); border-radius: 6px; padding: 8px; display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                            <span style="font-size: 0.82rem; font-weight: 700; color: var(--accent-gold);">VALOR GLOBAL FINAL:</span>
                            <span style="font-size: 1.05rem; font-weight: 700; color: var(--accent-gold);">R$ ${valorGlobalFinal.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">4. Participantes & Rateio</div>
                        <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px; flex-wrap: wrap;">
                            <input type="text" id="input-novo-participante-compra" class="config-input" placeholder="Novo participante (Ex: Carlos)" style="max-width: 220px; font-size: 0.78rem;">
                            <button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 5px 10px; font-size: 0.75rem;" onclick="adicionarParticipanteCompra('${compraGerenciandoKey}')">+ Participante</button>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
                            ${participantesHtml}
                        </div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">5. Chave Pix / Rastreio</div>
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 2px;">
                            <input type="text" id="det-chave-pix" class="config-input" value="${escapeHtml(comp.chavePix || '')}" placeholder="Chave Pix Copia e Cola Global" style="font-size: 0.78rem;">
                            <input type="text" id="det-rastreio" class="config-input" value="${escapeHtml(comp.rastreio || '')}" placeholder="Código de Rastreio (Ex: NN374569092BR)" style="font-size: 0.78rem;">
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap; gap: 6px;">
                        <button class="btn-action-danger" style="padding: 7px 14px; font-size: 0.78rem;" onclick="excluirCompraColetiva('${compraGerenciandoKey}')">🗑️ Excluir</button>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn-action-primary" style="background: #3a86ff; padding: 7px 14px; font-size: 0.78rem;" onclick="finalizarCompraColetivaStatus('${compraGerenciandoKey}')">✔️ Concluir</button>
                            <button class="btn-action-primary" style="background: #2ec4b6; color: #000; padding: 7px 14px; font-size: 0.78rem;" onclick="salvarCompraGerenciada('${compraGerenciandoKey}')">💾 Salvar</button>
                        </div>
                    </div>
                `;
                return;
            }

            if (tituloEl) tituloEl.innerHTML = `🛒 Gestão de Compras Coletivas`;

            // As compras são exibidas da mais recente para a mais antiga.
            // Compras novas usam criadoEm; registros antigos continuam funcionando
            // pelo timestamp presente na chave "compra_<timestamp>".
            let keys = Object.keys(comprasColetivasCache).sort((a, b) => {
                const compA = comprasColetivasCache[a] || {};
                const compB = comprasColetivasCache[b] || {};

                const dataA = Number(compA.criadoEm) || Number(String(a).match(/(\d+)$/)?.[1]) || 0;
                const dataB = Number(compB.criadoEm) || Number(String(b).match(/(\d+)$/)?.[1]) || 0;

                return dataB - dataA;
            });

            if (keys.length === 0) {
                bodyEl.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div style="color: var(--text-muted); text-align: center; padding: 14px;">Nenhuma compra coletiva cadastrada.</div>
                        <div class="config-panel" style="background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; padding: 12px;">
                            <div class="config-panel-title" style="color: var(--accent-gold); border-bottom: none; padding-bottom: 0;">🔒 CRIAR NOVA COMPRA COLETIVA</div>
                            <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
                                <input type="text" id="input-compra-item" class="config-input" placeholder="Nome da Compra (Ex: Peças RC)" style="flex: 2; background: var(--bg-input);">
                                <input type="number" step="0.01" id="input-compra-preco" class="config-input" placeholder="Preço (R$)" style="flex: 0.8; background: var(--bg-input);">
                                <input type="number" id="input-compra-qtd-min" class="config-input" placeholder="Qtd" style="flex: 0.8; background: var(--bg-input);">
                                <button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 7px 14px;" onclick="criarCompraColetiva()">Criar</button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            let cardsHtml = keys.map(k => {
                let comp = comprasColetivasCache[k];
                sincronizarParticipantesCompra(comp);
                calcularValoresDevidosCompra(comp);

                let participantes = comp.participantes || {};
                let ativosArr = Object.values(participantes).filter(p => p && p.ativo);
                let pagosAtivos = ativosArr.filter(p => p.pago).length;
                let quitada = (ativosArr.length > 0 && pagosAtivos === ativosArr.length);
                let entregue = !!comp.entregue;
                let finalizada = quitada && entregue;

                let statusExibicao = finalizada ? "Finalizada" : (quitada ? "Quitada" : (entregue ? "Entregue" : "Em Andamento"));
                let badgeColor = finalizada ? "rgba(46,196,182,0.15); color: var(--accent-green); border: 1px solid var(--accent-green);" : (quitada ? "rgba(58,134,255,0.15); color: var(--accent-blue); border: 1px solid var(--accent-blue);" : "rgba(255,183,3,0.15); color: var(--accent-gold); border: 1px solid var(--accent-gold);");

                return `
                    <div style="background: var(--bg-input); border: 1px solid var(--border-card); border-left: 5px solid ${finalizada ? 'var(--accent-green)' : (quitada ? 'var(--accent-blue)' : 'var(--accent-gold)')}; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span style="font-size: 0.95rem; font-weight: 700; color: var(--text-title);">🛒 ${escapeHtml(comp.nome || comp.chave)}</span>
                                <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${badgeColor}">${statusExibicao}</span>
                            </div>
                            <div style="display: flex; gap: 5px; align-items: center; flex-wrap: wrap;">
                                <button class="btn" style="background: rgba(46,196,182,0.15); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 4px 8px; font-size: 0.75rem;" onclick="alternarEntregueCompra('${k}')">${entregue ? '✅ Entregue' : '📦 Marcar Entregue'}</button>
                                <button class="btn" style="background: rgba(114,9,183,0.25); color: #e0aaff; border: 1px solid #7209b7; padding: 4px 8px; font-size: 0.75rem;" onclick="resumirCompraColetiva('${k}')">📊 Resumo</button>
                                <button class="btn" style="background: rgba(46,196,182,0.15); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 4px 8px; font-size: 0.75rem;" onclick="gerenciarCompraColetiva('${k}')">⚙️ Gerenciar</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            bodyEl.innerHTML = `
                <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">COMPRAS COLETIVAS</div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${cardsHtml}
                </div>
                <div class="config-panel" style="background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; padding: 12px; margin-top: 4px;">
                    <div class="config-panel-title" style="color: var(--accent-gold); border-bottom: none; padding-bottom: 0;">🔒 CRIAR NOVA COMPRA COLETIVA</div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
                        <input type="text" id="input-compra-item" class="config-input" placeholder="Nome da Compra (Ex: Peças RC)" style="flex: 2; background: var(--bg-input);">
                        <input type="number" step="0.01" id="input-compra-preco" class="config-input" placeholder="Preço (R$)" style="flex: 0.8; background: var(--bg-input);">
                        <input type="number" id="input-compra-qtd-min" class="config-input" placeholder="Qtd" style="flex: 0.8; background: var(--bg-input);">
                        <button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 7px 14px;" onclick="criarCompraColetiva()">Criar</button>
                    </div>
                </div>
            `;
        }

        window.resumirCompraColetiva = function(compraKey) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            sincronizarParticipantesCompra(comp);
            calcularValoresDevidosCompra(comp);

            let participantes = comp.participantes || {};
            let participantesAtivos = Object.values(participantes).filter(p => p && p.nome && p.nome.trim() !== "" && p.ativo);

            let modalTituloEl = document.getElementById('compra-resumo-titulo');
            let modalCorpoEl = document.getElementById('compra-resumo-corpo');
            if (!modalCorpoEl) return;

            if (modalTituloEl) modalTituloEl.innerHTML = `📊 Resumo: ${escapeHtml(comp.nome || comp.chave)}`;

            let chavePixBase = comp.chavePix || "00020126580014br.gov.pix.pix0136aac94da7-9d9a-463a-b33a-b974665b3022520400005303986540546.705802BR5925LUIS RAPHAEL";

            let participantesHtml = participantesAtivos.map(p => {
                let statusBadge = p.pago ? `<span style="color: var(--accent-green); font-weight: 700;">Pago ✅</span>` : `<span style="color: var(--accent-red); font-weight: 700;">Pendente ❌</span>`;
                let pixBoxHtml = "";
                if (!p.pago) {
                    let valorStr = (p.valorDevido || 0).toFixed(2);
                    let payloadPixPiloto = (p.pixPersonalizado && p.pixPersonalizado.trim() !== "") ? p.pixPersonalizado : `${chavePixBase} (Valor: R$ ${valorStr} - ${p.nome})`;
                    let qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(payloadPixPiloto)}`;

                    pixBoxHtml = `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-card); display: flex; flex-direction: column; align-items: center; gap: 6px; background: var(--bg-body); padding: 6px; border-radius: 6px;">
                            <span style="font-size: 0.72rem; color: var(--accent-gold); font-weight: 700;">Pix (R$ ${valorStr})</span>
                            <div style="background: #fff; padding: 3px; border-radius: 4px; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center;">
                                <img src="${escapeHtml(qrCodeUrl)}" alt="QR Code Pix" style="max-width: 100%; max-height: 100%;">
                            </div>
                            <div style="display: flex; gap: 4px; width: 100%;">
                                <input type="text" readonly class="config-input" id="pix-resumo-${p.nome.replace(/\s+/g, '')}" value="${escapeHtml(payloadPixPiloto)}" style="font-size: 0.68rem; text-align: center; color: var(--text-muted);">
                                <button class="btn-action-primary" style="padding: 3px 6px; font-size: 0.68rem;" onclick="navigator.clipboard.writeText(document.getElementById('pix-resumo-${p.nome.replace(/\s+/g, '')}').value); alert('Pix Copia e Cola copiado!');">Copiar</button>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div style="background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: var(--text-title); font-size: 0.85rem;">${escapeHtml(p.nome)}</strong>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="color: var(--accent-gold); font-weight: 700; font-size: 0.85rem;">R$ ${(p.valorDevido || 0).toFixed(2)}</span>
                                ${statusBadge}
                            </div>
                        </div>
                        ${pixBoxHtml}
                    </div>
                `;
            }).join('') || `<div style="text-align: center; color: var(--text-muted);">Nenhum participante.</div>`;

            modalCorpoEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 50vh; overflow-y: auto; padding-right: 4px;">
                    ${participantesHtml}
                </div>
            `;
            document.getElementById('compra-resumo-modal').style.display = 'flex';
        };

        window.fecharModalResumoCompra = function() {
            document.getElementById('compra-resumo-modal').style.display = 'none';
        };

