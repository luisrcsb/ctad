/* CTAD - Central de Telemetria — Gerenciamento de Pilotos (apelidos, aliases, carros, dossiê)
   Depende de variáveis/funções globais do script principal: 'db' (Firebase),
   'pilotosMetadadosCache', 'mesclagensCache', 'listaJsonsCache', 'escapeHtml()',
   'obterTodosDadosConsolidados()', 'PILOTOS_CORE_PADRAO'. */

        window.abrirModalPilotos = function() {
            document.getElementById('pilotos-gestao-modal').style.display = 'flex';
            renderizarGerenciadorPilotos();
        };
        window.fecharModalPilotos = function() {
            document.getElementById('pilotos-gestao-modal').style.display = 'none';
        };

        window.abrirModalConfigurarPiloto = function(nomePiloto) {
            pilotoSendoConfigurado = nomePiloto;
            document.getElementById('modal-config-piloto-titulo').innerHTML = `⚙️ Configurar Piloto: <span style="color: var(--accent-gold);">${escapeHtml(nomePiloto)}</span>`;
            renderizarCorpoConfigurarPiloto();
            document.getElementById('piloto-config-modal').style.display = 'flex';
        };

        window.fecharModalConfigurarPiloto = function() {
            document.getElementById('piloto-config-modal').style.display = 'none';
            pilotoSendoConfigurado = null;
        };

        window.abrirModalCampeonatos = function() {
            document.getElementById('campeonatos-modal').style.display = 'flex';
            renderizarListaCampeonatosModal();
            preencherSelectPilotosGerais();
            preencherSelectProvasBancoPrincipal();
        };
        window.fecharModalCampeonatos = function() { document.getElementById('campeonatos-modal').style.display = 'none'; };


        window.cadastrarNovoPilotoGeral = async function() {
            if (!db) return;
            let inputEl = document.getElementById('input-novo-piloto-geral');
            let nomeP = inputEl ? inputEl.value.trim() : "";
            if (!nomeP) { alert("Digite o nome do piloto."); return; }

            let metaKey = nomeP.replace(/[.#$\/\[\]]/g, "_");
            let dadosBase = obterTodosDadosConsolidados();
            let jaExiste = Object.keys(pilotosMetadadosCache).some(p => p.toLowerCase() === metaKey.toLowerCase())
                || dadosBase.some(d => d.piloto && d.piloto.trim().toLowerCase() === nomeP.toLowerCase());
            if (jaExiste) { alert(`Já existe um piloto cadastrado como "${nomeP}".`); return; }

            try {
                await db.ref(`pilotosMetadados/${metaKey}`).update({ criadoEm: Date.now() });
                inputEl.value = "";
                alert(`Piloto "${nomeP}" cadastrado!`);
                renderizarGerenciadorPilotos();
            } catch (err) { alert("Erro: " + err.message); }
        };

        function renderizarGerenciadorPilotos() {
            let dadosBase = obterTodosDadosConsolidados();
            let pilotosSet = new Set(PILOTOS_CORE_PADRAO);
            dadosBase.forEach(d => { if (d.piloto && d.piloto.trim()) pilotosSet.add(d.piloto.trim()); });
            Object.keys(pilotosMetadadosCache).forEach(p => { if (p && p.trim()) pilotosSet.add(p.trim()); });

            let listaPilotos = Array.from(pilotosSet).filter(p => p && p.trim()).sort();
            let tbodyApelidos = document.getElementById('tabela-pilotos-apelidos');

            if (listaPilotos.length === 0) {
                tbodyApelidos.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhum piloto encontrado.</td></tr>`;
            } else {
                tbodyApelidos.innerHTML = listaPilotos.map(p => {
                    let meta = pilotosMetadadosCache[p] || {};
                    let apelidoVal = meta.apelido || "(Sem apelido)";
                    return `
                        <tr>
                            <td><strong>${escapeHtml(p)}</strong></td>
                            <td><span style="color: var(--accent-gold);">${escapeHtml(apelidoVal)}</span></td>
                            <td style="text-align: right;"><button class="btn-action-primary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="abrirModalConfigurarPiloto('${escapeHtml(p)}')">⚙️ Configurar</button></td>
                        </tr>`;
                }).join('');
            }
        }

        function renderizarCorpoConfigurarPiloto() {
            let nomePiloto = pilotoSendoConfigurado;
            if (!nomePiloto) return;
            let meta = pilotosMetadadosCache[nomePiloto] || {};
            let apelidoVal = meta.apelido || "";
            let carrosObj = meta.carros || {};
            let carrosArr = Object.keys(carrosObj).map(k => ({ key: k, ...carrosObj[k] }));

            let aliasesPiloto = Object.keys(mesclagensCache).filter(alias => mesclagensCache[alias] === nomePiloto);

            let dadosBaseHistorico = obterTodosDadosConsolidados();
            let qtdSessoesPiloto = dadosBaseHistorico.filter(d => d.piloto === nomePiloto && d.laps && d.laps.length > 0).length;
            let temHistoricoCorridas = qtdSessoesPiloto > 0;

            let aliasHtml = aliasesPiloto.length === 0 ? 
                `<div style="font-size: 0.78rem; color: var(--text-muted);">Nenhum nome alternativo mapeado.</div>` :
                aliasesPiloto.map(alias => `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border-card); margin-bottom: 3px;">
                        <span style="font-weight: 600; color: var(--accent-gold); font-size: 0.82rem;">${escapeHtml(alias)}</span>
                        <button class="btn-text-action" style="color: var(--accent-red);" onclick="removerAliasPiloto('${escapeHtml(alias)}')">Remover</button>
                    </div>
                `).join('');

            let carrosHtml = carrosArr.length === 0 ?
                `<div style="font-size: 0.78rem; color: var(--text-muted);">Nenhum carro cadastrado.</div>` :
                carrosArr.map(car => `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-card); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-card); margin-bottom: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${car.imagem ? `<div style="background: #fff; padding: 2px; border-radius: 4px; width: 40px; height: 28px; display: flex; align-items: center; justify-content: center;"><img src="${escapeHtml(car.imagem)}" style="max-width: 100%; max-height: 100%; object-fit: contain;"></div>` : `<div style="background: var(--bg-input); width: 40px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; color: var(--text-muted);">Foto</div>`}
                            <div>
                                <strong style="color: var(--text-title); font-size: 0.85rem;">${escapeHtml(car.modelo)}</strong>
                                <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(car.categoria || '1/28 4x4')}</div>
                            </div>
                        </div>
                        <button class="btn-action-danger" style="padding: 3px 6px; font-size: 0.72rem;" onclick="removerCarroPiloto('${escapeHtml(nomePiloto)}', '${car.key}')">🗑️</button>
                    </div>
                `).join('');

            let bodyEl = document.getElementById('modal-config-piloto-corpo');
            bodyEl.innerHTML = `
                <div class="config-panel">
                    <div class="config-panel-title">1. Apelido / Nome de Exibição</div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                        <input type="text" id="input-config-apelido" class="config-input" value="${escapeHtml(apelidoVal)}" placeholder="Digite o apelido...">
                        <button class="btn-action-primary" onclick="salvarApelidoPilotoModal('${escapeHtml(nomePiloto)}')">Salvar</button>
                    </div>
                </div>

                <div class="config-panel">
                    <div class="config-panel-title">2. Mesclagem de Nomes (Aliases)</div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                        <input type="text" id="input-config-alias" class="config-input" placeholder="Ex: Edgar">
                        <button class="btn-action-primary" onclick="adicionarAliasParaPiloto('${escapeHtml(nomePiloto)}')">Adicionar</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                        ${aliasHtml}
                    </div>
                </div>

                <div class="config-panel">
                    <div class="config-panel-title">3. Gestão de Carros</div>
                    <div style="display: flex; flex-direction: column; gap: 6px; background: var(--bg-card); padding: 8px; border-radius: 6px; border: 1px solid var(--border-card); margin-top: 2px;">
                        <input type="text" id="input-carro-modelo" class="config-input" placeholder="Modelo (Ex: WLtoys K989)">
                        <input type="text" id="input-carro-categoria" class="config-input" placeholder="Categoria (Ex: 1/28 4x4)">
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <input type="file" id="input-carro-foto" accept="image/*" style="background: var(--bg-body); padding: 4px; border-radius: 6px; border: 1px solid var(--border-card); color: var(--text-main); font-size: 0.75rem; flex: 1;">
                            <button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 5px 10px; font-size: 0.75rem;" onclick="adicionarCarroPiloto('${escapeHtml(nomePiloto)}')">+ Carro</button>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                        ${carrosHtml}
                    </div>
                </div>

                <div class="config-panel" style="border: 1px solid var(--accent-red); background: rgba(230, 57, 70, 0.06);">
                    <div class="config-panel-title" style="color: var(--accent-red);">⚠️ Zona de Perigo</div>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                        Isso apaga o cadastro deste piloto (apelido, aliases e carros).
                        ${temHistoricoCorridas
                            ? `Este piloto tem <strong>${qtdSessoesPiloto}</strong> sessão(ões) registrada(s) nos resultados — os resultados de corrida <strong>NÃO</strong> serão apagados, só o cadastro/apelido/aliases dele.`
                            : `Este piloto ainda não tem nenhuma corrida registrada.`}
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
                        <label style="font-size: 0.72rem; color: var(--text-muted);">Digite <strong>${escapeHtml(nomePiloto)}</strong> para confirmar:</label>
                        <input type="text" id="input-confirmar-exclusao-piloto" class="config-input" placeholder="Digite o nome exato do piloto" oninput="alternarBotaoExcluirPiloto('${escapeHtml(nomePiloto)}')">
                        <button id="btn-excluir-piloto-confirmado" class="btn-action-danger" disabled style="opacity: 0.5; cursor: not-allowed;" onclick="excluirPilotoDoGerenciador('${escapeHtml(nomePiloto)}')">🗑️ Excluir Cadastro Definitivamente</button>
                    </div>
                </div>
            `;
        }

        window.alternarBotaoExcluirPiloto = function(nomePiloto) {
            let inputEl = document.getElementById('input-confirmar-exclusao-piloto');
            let btn = document.getElementById('btn-excluir-piloto-confirmado');
            if (!inputEl || !btn) return;
            let ok = inputEl.value.trim() === nomePiloto;
            btn.disabled = !ok;
            btn.style.opacity = ok ? '1' : '0.5';
            btn.style.cursor = ok ? 'pointer' : 'not-allowed';
        };

        window.excluirPilotoDoGerenciador = async function(nomePiloto) {
            if (!db) return;
            let confirmado = confirm(
                `Tem certeza ABSOLUTA que deseja excluir o cadastro de "${nomePiloto}"?\n\n` +
                `Isso remove apelido, aliases e carros cadastrados. Os resultados de corrida já registrados NÃO serão apagados.\n\n` +
                `Essa ação não pode ser desfeita.`
            );
            if (!confirmado) return;

            let metaKey = nomePiloto.replace(/[.#$\/\[\]]/g, "_");
            try {
                await db.ref(`pilotosMetadados/${metaKey}`).remove();

                // Remove também os aliases que apontavam para esse piloto, para não
                // deixar referências "órfãs" apontando para um cadastro que não existe mais.
                let aliasesDoPiloto = Object.keys(mesclagensCache).filter(alias => mesclagensCache[alias] === nomePiloto);
                for (let aliasKey of aliasesDoPiloto) {
                    await db.ref(`mesclagensPilotos/${aliasKey}`).remove();
                }

                alert(`Cadastro de "${nomePiloto}" excluído.`);
                fecharModalConfigurarPiloto();
                renderizarGerenciadorPilotos();
                atualizarDashboard();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.salvarApelidoPilotoModal = async function(nomePiloto) {
            if (!db) return;
            let inputEl = document.getElementById('input-config-apelido');
            let novoApelido = inputEl ? inputEl.value.trim() : "";
            let metaKey = nomePiloto.replace(/[.#$\/\[\]]/g, "_");
            try {
                await db.ref(`pilotosMetadados/${metaKey}/apelido`).set(novoApelido);
                alert(`Apelido salvo com sucesso!`);
                renderizarGerenciadorPilotos();
                renderizarCorpoConfigurarPiloto();
                atualizarDashboard();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.adicionarAliasParaPiloto = async function(nomePiloto) {
            if (!db) return;
            let aliasInput = document.getElementById('input-config-alias').value.trim();
            if (!aliasInput) return;
            let aliasKey = aliasInput.replace(/[.#$\/\[\]]/g, "_");
            try {
                await db.ref(`mesclagensPilotos/${aliasKey}`).set(nomePiloto);
                document.getElementById('input-config-alias').value = "";
                renderizarCorpoConfigurarPiloto();
                atualizarDashboard();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.removerAliasPiloto = async function(aliasKey) {
            if (!db) return;
            let safeKey = aliasKey.replace(/[.#$\/\[\]]/g, "_");
            try {
                await db.ref(`mesclagensPilotos/${safeKey}`).remove();
                renderizarCorpoConfigurarPiloto();
                atualizarDashboard();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.adicionarCarroPiloto = async function(nomePiloto) {
            if (!db) return;
            let modeloInput = document.getElementById('input-carro-modelo').value.trim();
            let categoriaInput = document.getElementById('input-carro-categoria').value.trim();
            let fileInput = document.getElementById('input-carro-foto');
            if (!modeloInput) return;

            let imagemBase64 = "";
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                imagemBase64 = await arquivoParaBase64(fileInput.files[0]);
            }

            let metaKey = nomePiloto.replace(/[.#$\/\[\]]/g, "_");
            let carKey = "car_" + Date.now();
            try {
                await db.ref(`pilotosMetadados/${metaKey}/carros/${carKey}`).set({
                    modelo: modeloInput, categoria: categoriaInput || "1/28 4x4", imagem: imagemBase64
                });
                renderizarCorpoConfigurarPiloto();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.removerCarroPiloto = async function(nomePiloto, carKey) {
            if (!db) return;
            let metaKey = nomePiloto.replace(/[.#$\/\[\]]/g, "_");
            try {
                await db.ref(`pilotosMetadados/${metaKey}/carros/${carKey}`).remove();
                renderizarCorpoConfigurarPiloto();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.abrirDossiePiloto = function(nomePiloto) {
            const modal = document.getElementById('piloto-modal');
            let meta = pilotosMetadadosCache[nomePiloto] || {};
            let tituloNome = meta.apelido ? `${nomePiloto} (${meta.apelido})` : nomePiloto;
            document.getElementById('modal-piloto-nome').innerHTML = `🏎️ Resumo do Piloto: <span style="color: var(--accent-gold);">${escapeHtml(tituloNome)}</span>`;
            
            let dadosBase = obterTodosDadosConsolidados();
            let participacoes = dadosBase.filter(d => d.piloto === nomePiloto && d.laps && d.laps.length > 0);
            let bodyEl = document.getElementById('modal-piloto-corpo');

            if (participacoes.length === 0) {
                bodyEl.innerHTML = `<div style="text-align:center; padding: 16px; color: var(--text-muted);">Nenhum dado registrado.</div>`;
                modal.style.display = 'flex';
                return;
            }

            let totalSessoes = participacoes.length;
            let vitorias = 0, podios = 0, totalVoltasDadas = 0, melhorVoltaGeral = 999999, somaDesvios = 0;
            let historicoSessaoHtml = [];

            listaJsonsCache.forEach(arq => {
                let todosBat = (arq.dados || []).map(d => {
                    let pReal = d.piloto ? d.piloto.trim() : "";
                    let safeKey = pReal.replace(/[.#$\/\[\]]/g, "_");
                    if (mesclagensCache[safeKey]) pReal = mesclagensCache[safeKey];
                    return { ...d, piloto: pReal };
                }).filter(d => d.piloto && d.laps && d.laps.length > 0);

                let ordenados = ordenarParticipantesBateria(todosBat);
                let idxPiloto = ordenados.findIndex(o => o.piloto === nomePiloto);

                if (idxPiloto !== -1) {
                    let pos = idxPiloto + 1;
                    if (pos === 1) vitorias++;
                    if (pos <= 3) podios++;

                    let pData = ordenados[idxPiloto];
                    let melhorV = pData.melhorVoltaVal || 0;
                    if (melhorV > 0 && melhorV < melhorVoltaGeral) melhorVoltaGeral = melhorV;

                    let qtdV = pData.laps ? pData.laps.length : 0;
                    totalVoltasDadas += qtdV;
                    if (pData.desvioVal) somaDesvios += pData.desvioVal;

                    historicoSessaoHtml.push(`
                        <tr>
                            <td><span class="session-badge">${formatarNomeSessao(arq.sessao || arq.nomeArquivoOriginal)}</span></td>
                            <td><span class="pos-badge">${pos}º</span></td>
                            <td class="text-green">${pData.melhorVoltaTxt || '--'}</td>
                            <td>${qtdV}v</td>
                        </tr>
                    `);
                }
            });

            let velMax = melhorVoltaGeral < 999999 ? ((26 / melhorVoltaGeral) * 3.6 * 28).toFixed(1) : "0.0";
            let consistenciaMedia = totalSessoes > 0 ? (somaDesvios / totalSessoes).toFixed(3) : "0.000";

            let conquistasHtml = [];
            if (vitorias > 0) conquistasHtml.push(`<span class="session-podium-tag podium-gold">🏆 Vencedor (${vitorias}x)</span>`);
            if (podios > 0) conquistasHtml.push(`<span class="session-podium-tag podium-silver">🥈 Pódio (${podios}x)</span>`);
            if (totalVoltasDadas >= 50) conquistasHtml.push(`<span class="session-podium-tag podium-bronze">🏁 Maratonista (${totalVoltasDadas}v)</span>`);

            bodyEl.innerHTML = `
                <div class="dossier-grid">
                    <div class="dossier-kpi"><span class="dossier-kpi-label">Corridas</span><span class="dossier-kpi-value">${totalSessoes}</span></div>
                    <div class="dossier-kpi"><span class="dossier-kpi-label">Pódios</span><span class="dossier-kpi-value">${podios}</span></div>
                    <div class="dossier-kpi"><span class="dossier-kpi-label">Voltas</span><span class="dossier-kpi-value">${totalVoltasDadas}</span></div>
                    <div class="dossier-kpi"><span class="dossier-kpi-label">Velocidade Máxima</span><span class="dossier-kpi-value">${velMax} km/h</span></div>
                </div>

                <div class="dossier-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    <div class="dossier-kpi"><span class="dossier-kpi-label">Melhor Volta</span><span class="dossier-kpi-value" style="color: var(--accent-green);">${melhorVoltaGeral < 999999 ? melhorVoltaGeral.toFixed(3) + 's' : '--'}</span></div>
                    <div class="dossier-kpi"><span class="dossier-kpi-label">Consistência</span><span class="dossier-kpi-value" style="color: var(--accent-blue);">±${consistenciaMedia}s</span></div>
                </div>

                <div class="config-panel">
                    <div class="config-panel-title">🏅 Conquistas</div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">${conquistasHtml.join('') || '<span style="color:var(--text-muted); font-size:0.78rem;">Nenhuma conquista ainda.</span>'}</div>
                </div>

                <div class="card" style="padding: 10px;">
                    <div class="card-header" style="margin-bottom: 6px;">📜 Histórico de Corridas</div>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Sessão</th><th>Pos</th><th>Melhor Volta</th><th>Voltas</th></tr></thead>
                            <tbody>${historicoSessaoHtml.join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
            modal.style.display = 'flex';
        };

        window.fecharDossiePiloto = function() { document.getElementById('piloto-modal').style.display = 'none'; };
