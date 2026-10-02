/* CTAD - Central de Telemetria — Sistema de Tags de Pilotos
   Depende de variáveis/funções globais do script principal:
   'db' (Firebase), 'pilotosMetadadosCache', 'escapeHtml()',
   'obterTodosDadosConsolidados()', 'ordenarParticipantesBateria()',
   'calcularRelatorioUltrapassagens()'.

   Tags AUTOMÁTICAS (calculadas a partir dos dados de corrida, sempre ao vivo):
   vitorias, podios, maisRapido, consistente, voltasRapidas, lideradas, ultrapassagens.

   Tags MANUAIS (atribuídas pelo admin no painel "Tags dos Pilotos", guardadas em
   pilotosMetadados/{metaKey}/tagsManuais): poles, sequencia, recuperacao, velMax,
   largada, confiavel, reiPista, gestao, precisao. */

        // Fonte oficial das tags — ícones e textos não devem ser alterados sem confirmação.
        const TAGS_PILOTOS = {
            vitorias: { icone: '🏆', texto: 'Mais Vitórias' },
            lideradas: { icone: '⭐', texto: 'Mais Voltas Lideradas' },
            maisRapido: { icone: '⚡', texto: 'Mais Rápido' },
            consistente: { icone: '🎯', texto: 'Mais Consistente' },
            voltasRapidas: { icone: '⏱️', texto: 'Mais Voltas Rápidas' },
            recuperacao: { icone: '📈', texto: 'Maior Recuperação' },
            podios: { icone: '🥇', texto: 'Mais Pódios' },
            poles: { icone: '📍', texto: 'Mais Poles' },
            sequencia: { icone: '🔥', texto: 'Sequência Invicta' },
            velMax: { icone: '🚀', texto: 'Velocidade Máxima' },
            ultrapassagens: { icone: '💨', texto: 'Mais Ultrapassagens' },
            largada: { icone: '🟢', texto: 'Melhor Largada' },
            confiavel: { icone: '🛡️', texto: 'Mais Confiável' },
            reiPista: { icone: '👑', texto: 'Rei da Pista' },
            gestao: { icone: '🧠', texto: 'Melhor Gestão' },
            precisao: { icone: '✨', texto: 'Precisão Total' }
        };

        // As 7 tags acima são calculadas automaticamente pelos dados de corrida.
        // As demais (lista abaixo) dependem de informação que o sistema ainda não
        // rastreia (grid de largada avulso, telemetria de velocidade, confiabilidade
        // mecânica etc.) e por isso ficam disponíveis para atribuição manual no
        // painel de administração.
        const TAGS_AUTOMATICAS_CHAVES = ['vitorias', 'podios', 'maisRapido', 'consistente', 'voltasRapidas', 'lideradas', 'ultrapassagens'];
        const TAGS_MANUAIS_CHAVES = ['poles', 'sequencia', 'recuperacao', 'velMax', 'largada', 'confiavel', 'reiPista', 'gestao', 'precisao'];

        // Monta o HTML de um bloco de tags a partir de uma lista de chaves.
        // Use compacta=true para o estilo menor (ex: dentro de painéis administrativos).
        function renderizarTagsPilotoHtml(chaves, compacta) {
            if (!chaves || chaves.length === 0) return '';
            let classeExtra = compacta ? ' compacta' : '';
            return `<div class="piloto-tags">` + chaves.map(chave => {
                const tag = TAGS_PILOTOS[chave];
                if (!tag) return '';
                return `<span class="tag-piloto${classeExtra}"><span class="icone">${tag.icone}</span> ${escapeHtml(tag.texto)}</span>`;
            }).join('') + `</div>`;
        }

        // Calcula as tags automáticas de TODOS os pilotos a partir do histórico
        // completo de corridas. Retorna { nomePiloto: ['vitorias', 'maisRapido', ...] }.
        function calcularTagsAutomaticasPilotos() {
            let todosDados = obterTodosDadosConsolidados();
            if (todosDados.length === 0) return {};

            let porBateria = {};
            todosDados.forEach(d => {
                if (!porBateria[d.bateriaKey]) porBateria[d.bateriaKey] = [];
                porBateria[d.bateriaKey].push(d);
            });

            let contagem = {};
            function reg(piloto) {
                if (!contagem[piloto]) {
                    contagem[piloto] = { vitorias: 0, podios: 0, voltasRapidas: 0, ultrapassagens: 0, voltasLideradas: 0, totalVoltasConsistencia: 0, somaDesvioPonderada: 0 };
                }
                return contagem[piloto];
            }

            let melhorVoltaGeralAbs = Infinity;
            let pilotoMelhorVoltaGeralAbs = null;

            Object.values(porBateria).forEach(dadosSessao => {
                let ordenados = ordenarParticipantesBateria(dadosSessao);
                if (ordenados.length === 0) return;

                ordenados.forEach((p, idx) => {
                    let c = reg(p.piloto);
                    if (idx === 0) c.vitorias++;
                    if (idx <= 2) c.podios++;
                });

                let melhorDaSessao = Infinity, pilotoMelhorDaSessao = null;
                dadosSessao.forEach(d => {
                    (d.laps || []).forEach(lap => {
                        let t = Number(typeof lap === 'object' ? lap.tempo : lap);
                        if (Number.isFinite(t) && t > 0 && t < melhorDaSessao) { melhorDaSessao = t; pilotoMelhorDaSessao = d.piloto; }
                    });
                });
                if (pilotoMelhorDaSessao) {
                    reg(pilotoMelhorDaSessao).voltasRapidas++;
                    if (melhorDaSessao < melhorVoltaGeralAbs) { melhorVoltaGeralAbs = melhorDaSessao; pilotoMelhorVoltaGeralAbs = pilotoMelhorDaSessao; }
                }

                // Voltas lideradas: mesma lógica de tempo acumulado usada na
                // Tabela Geral Volta a Volta com Gaps.
                let maxVoltas = Math.max(0, ...dadosSessao.map(p => (p.laps || []).length));
                let acumulados = {};
                dadosSessao.forEach(p => {
                    let soma = 0;
                    acumulados[p.piloto] = [];
                    for (let i = 0; i < maxVoltas; i++) {
                        let lap = (p.laps || [])[i];
                        let t = (lap !== undefined && lap !== null) ? Number(typeof lap === 'object' ? lap.tempo : lap) : null;
                        if (!Number.isFinite(t) || t <= 0) { acumulados[p.piloto][i] = null; }
                        else { soma += t; acumulados[p.piloto][i] = soma; }
                    }
                });
                for (let v = 0; v < maxVoltas; v++) {
                    let liderPiloto = null, liderAcumulado = Infinity;
                    dadosSessao.forEach(p => {
                        let ac = acumulados[p.piloto][v];
                        if (ac !== null && ac !== undefined && ac < liderAcumulado) { liderAcumulado = ac; liderPiloto = p.piloto; }
                    });
                    if (liderPiloto) reg(liderPiloto).voltasLideradas++;
                }

                let logsUltrapassagens = calcularRelatorioUltrapassagens(ordenados, dadosSessao);
                Object.values(logsUltrapassagens).forEach(mudancas => {
                    mudancas.forEach(m => {
                        if (m.tipo === 'ganho') reg(m.piloto).ultrapassagens++;
                    });
                });
            });

            // Consistência: média do desvio padrão de cada piloto, ponderada pelo
            // número de voltas de cada sessão (sessões com mais voltas pesam mais).
            todosDados.forEach(d => {
                if (Number.isFinite(d.desvioVal) && d.voltasTotais >= 3) {
                    let c = reg(d.piloto);
                    c.somaDesvioPonderada += d.desvioVal * d.voltasTotais;
                    c.totalVoltasConsistencia += d.voltasTotais;
                }
            });

            let tagsPorPiloto = {};
            function adicionarTag(piloto, chave) {
                if (!piloto) return;
                if (!tagsPorPiloto[piloto]) tagsPorPiloto[piloto] = new Set();
                tagsPorPiloto[piloto].add(chave);
            }

            function vencedoresPorCampo(campo) {
                let melhorValor = 0, vencedores = [];
                Object.keys(contagem).forEach(p => {
                    let v = contagem[p][campo] || 0;
                    if (v > melhorValor) { melhorValor = v; vencedores = [p]; }
                    else if (v === melhorValor && v > 0) vencedores.push(p);
                });
                return vencedores;
            }

            vencedoresPorCampo('vitorias').forEach(p => adicionarTag(p, 'vitorias'));
            vencedoresPorCampo('podios').forEach(p => adicionarTag(p, 'podios'));
            vencedoresPorCampo('voltasRapidas').forEach(p => adicionarTag(p, 'voltasRapidas'));
            vencedoresPorCampo('voltasLideradas').forEach(p => adicionarTag(p, 'lideradas'));
            vencedoresPorCampo('ultrapassagens').forEach(p => adicionarTag(p, 'ultrapassagens'));

            if (pilotoMelhorVoltaGeralAbs) adicionarTag(pilotoMelhorVoltaGeralAbs, 'maisRapido');

            // Mais consistente exige um volume mínimo de voltas somadas, pra não
            // premiar quem correu uma única bateria curta por sorte.
            let melhorConsistencia = Infinity, pilotoConsistente = null;
            Object.keys(contagem).forEach(p => {
                let c = contagem[p];
                if (c.totalVoltasConsistencia >= 10) {
                    let media = c.somaDesvioPonderada / c.totalVoltasConsistencia;
                    if (media < melhorConsistencia) { melhorConsistencia = media; pilotoConsistente = p; }
                }
            });
            if (pilotoConsistente) adicionarTag(pilotoConsistente, 'consistente');

            let resultado = {};
            Object.keys(tagsPorPiloto).forEach(p => { resultado[p] = Array.from(tagsPorPiloto[p]); });
            return resultado;
        }

        // Junta as tags automáticas (calculadas ao vivo) com as manuais (salvas
        // no cadastro do piloto) pra exibir no dossiê ou em qualquer outra tela.
        function obterTodasTagsPiloto(pilotoNome, tagsAutomaticasGlobais) {
            let metaKey = pilotoNome.replace(/[.#$\/\[\]]/g, "_");
            let manuais = (pilotosMetadadosCache[metaKey] && pilotosMetadadosCache[metaKey].tagsManuais) || [];
            let automaticas = (tagsAutomaticasGlobais && tagsAutomaticasGlobais[pilotoNome]) || [];
            return Array.from(new Set([...automaticas, ...manuais]));
        }

        // ===================== Painel de Administração =====================

        window.abrirModalTagsPilotos = function() {
            let modal = document.getElementById('tags-config-modal');
            if (modal) modal.style.display = 'flex';
            renderizarPainelTagsPilotos();
        };

        window.fecharModalTagsPilotos = function() {
            let modal = document.getElementById('tags-config-modal');
            if (modal) modal.style.display = 'none';
        };

        function renderizarPainelTagsPilotos() {
            let corpo = document.getElementById('tags-config-corpo');
            if (!corpo) return;

            let tagsAutomaticas = calcularTagsAutomaticasPilotos();

            let nomesSet = new Set(Object.keys(pilotosMetadadosCache || {}));
            obterTodosDadosConsolidados().forEach(d => nomesSet.add(d.piloto));
            let nomes = Array.from(nomesSet).filter(n => n && n.trim()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

            if (nomes.length === 0) {
                corpo.innerHTML = `<div style="color: var(--text-muted);">Nenhum piloto cadastrado ainda.</div>`;
                return;
            }

            corpo.innerHTML = nomes.map(nome => {
                let metaKey = nome.replace(/[.#$\/\[\]]/g, "_");
                let manuaisAtuais = (pilotosMetadadosCache[metaKey] && pilotosMetadadosCache[metaKey].tagsManuais) || [];
                let automaticas = tagsAutomaticas[nome] || [];

                let autoHtml = automaticas.length > 0
                    ? renderizarTagsPilotoHtml(automaticas, true)
                    : `<span style="font-size: 0.72rem; color: var(--text-muted);">Nenhuma tag automática ainda.</span>`;

                let checkboxesHtml = TAGS_MANUAIS_CHAVES.map(chave => {
                    let tag = TAGS_PILOTOS[chave];
                    let marcado = manuaisAtuais.includes(chave);
                    return `
                        <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; background: var(--bg-body); border: 1px solid var(--border-card); border-radius: 4px; padding: 3px 8px; cursor: pointer;">
                            <input type="checkbox" ${marcado ? 'checked' : ''} onchange="alternarTagManualPiloto('${escapeHtml(nome)}', '${chave}', this)">
                            ${tag.icone} ${escapeHtml(tag.texto)}
                        </label>`;
                }).join('');

                return `
                    <div class="config-panel">
                        <div class="config-panel-title">${escapeHtml(nome)}</div>
                        <div style="margin: 6px 0;">${autoHtml}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Tags manuais (marque as conquistadas):</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">${checkboxesHtml}</div>
                    </div>`;
            }).join('');
        }

        window.alternarTagManualPiloto = async function(pilotoNome, chaveTag, checkbox) {
            if (!db) return;
            let metaKey = pilotoNome.replace(/[.#$\/\[\]]/g, "_");
            let atuais = (pilotosMetadadosCache[metaKey] && pilotosMetadadosCache[metaKey].tagsManuais) || [];
            let novas = checkbox.checked
                ? Array.from(new Set([...atuais, chaveTag]))
                : atuais.filter(c => c !== chaveTag);
            try {
                await db.ref(`pilotosMetadados/${metaKey}/tagsManuais`).set(novas);
            } catch (err) {
                alert("Erro: " + err.message);
                checkbox.checked = !checkbox.checked;
            }
        };
