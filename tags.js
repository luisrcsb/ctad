/* CTAD - Central de Telemetria — Sistema de Tags de Pilotos
   Depende de variáveis/funções globais do script principal:
   'db' (Firebase), 'pilotosMetadadosCache', 'mesclagensCache', 'listaJsonsCache',
   'escapeHtml()', 'obterTodosDadosConsolidados()', 'ordenarParticipantesBateria()',
   'extrairPesoOrdenacao()', 'calcularRelatorioUltrapassagens()'.

   Tags AUTOMÁTICAS (calculadas só com dados de corrida — laps, posições e
   desvios — e sempre ao vivo): vitorias, podios, maisRapido, consistente,
   voltasRapidas, lideradas, ultrapassagens, velMax, precisao, recuperacao,
   sequencia, reiPista, poles, largada, confiavel, estreante, veterano,
   maratonista.

   Tags MANUAIS (atribuídas pelo admin na tela "⚙️ Configurar Piloto", guardadas
   em pilotosMetadados/{metaKey}/tagsManuais): gestao. */

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
            precisao: { icone: '✨', texto: 'Precisão Total' },
            estreante: { icone: '🌱', texto: 'Estreante' },
            veterano: { icone: '🎖️', texto: 'Veterano' },
            maratonista: { icone: '🏁', texto: 'Maratonista' }
        };

        // As tags abaixo são calculadas automaticamente pelos dados de corrida —
        // nenhuma delas é editada à mão. A única exceção é 'gestao' (lista
        // MANUAIS), marcada pelo admin na tela "⚙️ Configurar Piloto" porque
        // depende de informação que o sistema não rastreia (liderança de equipe,
        // estratégia de pneus, organização de treino etc.).
        const TAGS_AUTOMATICAS_CHAVES = [
            'vitorias', 'podios', 'maisRapido', 'consistente', 'voltasRapidas', 'lideradas',
            'ultrapassagens', 'velMax', 'precisao', 'recuperacao', 'sequencia', 'reiPista',
            'poles', 'largada', 'confiavel', 'estreante', 'veterano', 'maratonista'
        ];
        const TAGS_MANUAIS_CHAVES = ['gestao'];

        // Ordem fixa de exibição (automáticas na frente, manuais no fim).
        const ORDEM_EXIBICAO_TAGS = TAGS_AUTOMATICAS_CHAVES.concat(TAGS_MANUAIS_CHAVES);

        function ordenarChavesTags(chaves) {
            return chaves.slice().sort((a, b) => {
                let ia = ORDEM_EXIBICAO_TAGS.indexOf(a);
                let ib = ORDEM_EXIBICAO_TAGS.indexOf(b);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
        }

        // escJs(): canônico em Utils.escJsAttr (utils.js).

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
        // Regra geral: quem tem o melhor número (com vantagem clara) fica com a
        // tag; empate no topo = ninguém recebe. As tags de perfil (estreante,
        // veterano, maratonista) não disputam nada — todo piloto que atinge o
        // limiar as ganha.
        function calcularTagsAutomaticasPilotos() {
            let todosDados = obterTodosDadosConsolidados();
            if (todosDados.length === 0) return {};

            // Limiares mínimos: impedem que uma única corrida curta premie alguém
            // com tag de perfil ou de taxa.
            const MIN_VOLTAS_SESSAO_MEDIA = 3;
            const MIN_VOLTAS_SESSAO_DESVIO = 5;
            const MIN_SESSOES_LARGADA = 3;
            const MIN_CORRIDAS_TAXA = 3;
            const MIN_SEQUENCIA_VITORIAS = 2;
            const CORRIDAS_ESTREANTE_MAX = 3;
            const CORRIDAS_VETERANO = 20;
            const VOLTAS_MARATONISTA = 50;

            let porBateria = {};
            todosDados.forEach(d => {
                if (!porBateria[d.bateriaKey]) porBateria[d.bateriaKey] = [];
                porBateria[d.bateriaKey].push(d);
            });

            let contagem = {};
            function reg(piloto) {
                if (!contagem[piloto]) {
                    contagem[piloto] = {
                        vitorias: 0, podios: 0, voltasRapidas: 0, ultrapassagens: 0,
                        voltasLideradas: 0, totalVoltasConsistencia: 0, somaDesvioPonderada: 0,
                        poles: 0, corridas: 0, totalVoltas: 0,
                        somaPrimeiraVolta: 0, qtdPrimeiraVolta: 0
                    };
                }
                return contagem[piloto];
            }

            let melhorVoltaGeralAbs = Infinity;
            let pilotoMelhorVoltaGeralAbs = null;
            let empateVoltaGeralAbs = false;

            // velMax: menor tempo médio de sessão (ritmo mais rápido).
            let melhorMediaSessao = Infinity, pilotoMediaSessao = null, empateMedia = false;
            // precisao: menor desvio padrão de uma única sessão.
            let melhorDesvioSessao = Infinity, pilotoDesvioSessao = null, empateDesvio = false;
            // recuperacao: maior saldo de posições de uma sessão (1ª volta → final).
            let melhorRecuperacao = 0, pilotoRecuperacao = null, empateRecuperacao = false;
            // largada: menor média de primeira volta (poles conta quem mais teve
            // a melhor 1ª volta; largada olha a média de quem sempre arranca bem).
            let melhorMediaLargada = Infinity, pilotoLargada = null, empateLargada = false;

            // Sequência invicta precisa das sessões em ordem cronológica.
            let cronologia = [];
            let ordemSessao = 0;

            Object.values(porBateria).forEach(dadosSessao => {
                let ordenados = ordenarParticipantesBateria(dadosSessao);
                if (ordenados.length === 0) return;
                ordemSessao++;

                let participantes = [];
                ordenados.forEach((p, idx) => {
                    let c = reg(p.piloto);
                    if (idx === 0) c.vitorias++;
                    if (idx <= 2) c.podios++;
                    participantes.push(p.piloto);
                });
                cronologia.push({
                    peso: extrairPesoOrdenacao(dadosSessao[0].sessao || ''),
                    ordem: ordemSessao,
                    vencedor: ordenados[0].piloto,
                    participantes
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
                    if (melhorDaSessao < melhorVoltaGeralAbs) {
                        melhorVoltaGeralAbs = melhorDaSessao;
                        pilotoMelhorVoltaGeralAbs = pilotoMelhorDaSessao;
                        empateVoltaGeralAbs = false;
                    } else if (melhorDaSessao === melhorVoltaGeralAbs && pilotoMelhorDaSessao !== pilotoMelhorVoltaGeralAbs) {
                        empateVoltaGeralAbs = true;
                    }
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

                // ---- Métricas por sessão: primeira volta, média de volta e desvio ----
                let melhorPrimeira = Infinity, pilotoMelhorPrimeira = null, empatePrimeira = false;
                let temposPrimeira = {};

                dadosSessao.forEach(d => {
                    let c = reg(d.piloto);
                    c.corridas++;
                    c.totalVoltas += (d.laps || []).length;

                    let tempoPrimeira = null;
                    if (d.laps && d.laps.length > 0) {
                        let lap0 = d.laps[0];
                        let t0 = Number(typeof lap0 === 'object' ? lap0.tempo : lap0);
                        if (Number.isFinite(t0) && t0 > 0) tempoPrimeira = t0;
                    }
                    if (tempoPrimeira !== null) {
                        if (tempoPrimeira < melhorPrimeira) { melhorPrimeira = tempoPrimeira; pilotoMelhorPrimeira = d.piloto; empatePrimeira = false; }
                        else if (tempoPrimeira === melhorPrimeira && d.piloto !== pilotoMelhorPrimeira) empatePrimeira = true;
                        temposPrimeira[d.piloto] = tempoPrimeira;
                        c.somaPrimeiraVolta += tempoPrimeira;
                        c.qtdPrimeiraVolta++;
                    }

                    let validos = (d.laps || [])
                        .map(l => Number(typeof l === 'object' ? l.tempo : l))
                        .filter(t => Number.isFinite(t) && t > 0);
                    if (validos.length >= MIN_VOLTAS_SESSAO_MEDIA) {
                        let soma = validos.reduce((acc, t) => acc + t, 0);
                        let media = soma / validos.length;
                        if (media > 0) {
                            if (media < melhorMediaSessao) { melhorMediaSessao = media; pilotoMediaSessao = d.piloto; empateMedia = false; }
                            else if (media === melhorMediaSessao && d.piloto !== pilotoMediaSessao) empateMedia = true;
                        }
                        // desvioVal > 0: arquivos sem desvio entram como 0 no parser,
                        // e 0 real seria considerado "empatado" com todo mundo.
                        if (Number.isFinite(d.desvioVal) && d.desvioVal > 0 && d.voltasTotais >= MIN_VOLTAS_SESSAO_DESVIO) {
                            if (d.desvioVal < melhorDesvioSessao) { melhorDesvioSessao = d.desvioVal; pilotoDesvioSessao = d.piloto; empateDesvio = false; }
                            else if (d.desvioVal === melhorDesvioSessao && d.piloto !== pilotoDesvioSessao) empateDesvio = true;
                        }
                    }
                });

                // poles: quem teve a melhor 1ª volta desta sessão (1 ponto).
                if (pilotoMelhorPrimeira && !empatePrimeira) reg(pilotoMelhorPrimeira).poles++;

                // recuperacao: quem mais subiu da volta 1 classificada até o resultado
                // final da sessão. Quem não largou com volta válida fica de fora.
                let ordemPrimeira = Object.keys(temposPrimeira)
                    .sort((a, b) => temposPrimeira[a] - temposPrimeira[b]);
                let posPrimeira = {};
                ordemPrimeira.forEach((nome, i) => { posPrimeira[nome] = i + 1; });
                ordenados.forEach((p, idxFinal) => {
                    let p1 = posPrimeira[p.piloto];
                    if (!p1) return;
                    let saldo = p1 - (idxFinal + 1);
                    if (saldo > melhorRecuperacao) { melhorRecuperacao = saldo; pilotoRecuperacao = p.piloto; empateRecuperacao = false; }
                    else if (saldo === melhorRecuperacao && saldo > 0 && p.piloto !== pilotoRecuperacao) empateRecuperacao = true;
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

            // Regra: a tag só "fixa" em quem tem o maior número com vantagem clara.
            // Em caso de empate no topo, ninguém recebe a tag.
            function vencedoresPorCampo(campo) {
                let melhorValor = 0, vencedores = [];
                Object.keys(contagem).forEach(p => {
                    let v = contagem[p][campo] || 0;
                    if (v > melhorValor) { melhorValor = v; vencedores = [p]; }
                    else if (v === melhorValor && v > 0) vencedores.push(p);
                });
                if (vencedores.length !== 1) return [];
                return vencedores;
            }

            vencedoresPorCampo('vitorias').forEach(p => adicionarTag(p, 'vitorias'));
            vencedoresPorCampo('podios').forEach(p => adicionarTag(p, 'podios'));
            vencedoresPorCampo('voltasRapidas').forEach(p => adicionarTag(p, 'voltasRapidas'));
            vencedoresPorCampo('voltasLideradas').forEach(p => adicionarTag(p, 'lideradas'));
            vencedoresPorCampo('ultrapassagens').forEach(p => adicionarTag(p, 'ultrapassagens'));

            if (pilotoMelhorVoltaGeralAbs && !empateVoltaGeralAbs) adicionarTag(pilotoMelhorVoltaGeralAbs, 'maisRapido');

            // Mais consistente exige um volume mínimo de voltas somadas, pra não
            // premiar quem correu uma única bateria curta por sorte. Em empate
            // exato na média, ninguém recebe a tag (precisa de vantagem clara).
            let melhorConsistencia = Infinity, pilotoConsistente = null, empateConsistencia = false;
            Object.keys(contagem).forEach(p => {
                let c = contagem[p];
                if (c.totalVoltasConsistencia >= 10) {
                    let media = c.somaDesvioPonderada / c.totalVoltasConsistencia;
                    if (media < melhorConsistencia) { melhorConsistencia = media; pilotoConsistente = p; empateConsistencia = false; }
                    else if (media === melhorConsistencia) { empateConsistencia = true; }
                }
            });
            if (pilotoConsistente && !empateConsistencia) adicionarTag(pilotoConsistente, 'consistente');

            // velMax: melhor ritmo médio de uma sessão inteira (distinto de
            // 'maisRapido', que é a melhor volta isolada de todo o histórico).
            if (pilotoMediaSessao && !empateMedia) adicionarTag(pilotoMediaSessao, 'velMax');

            // precisao: a sessão mais "no trilho" de toda a base.
            if (pilotoDesvioSessao && !empateDesvio) adicionarTag(pilotoDesvioSessao, 'precisao');

            // recuperacao: só vale saldo positivo de subida de posição.
            if (pilotoRecuperacao && melhorRecuperacao > 0 && !empateRecuperacao) adicionarTag(pilotoRecuperacao, 'recuperacao');

            // largada: melhor média de primeira volta, quem larga bem sempre.
            // Exige no mínimo MIN_SESSOES_LARGADA largadas válidas.
            Object.keys(contagem).forEach(p => {
                let c = contagem[p];
                if (c.qtdPrimeiraVolta < MIN_SESSOES_LARGADA) return;
                let media = c.somaPrimeiraVolta / c.qtdPrimeiraVolta;
                if (media < melhorMediaLargada) { melhorMediaLargada = media; pilotoLargada = p; empateLargada = false; }
                else if (media === melhorMediaLargada && p !== pilotoLargada) empateLargada = true;
            });
            if (pilotoLargada && !empateLargada) adicionarTag(pilotoLargada, 'largada');

            // poles: quem mais arrancou em 1º na primeira volta.
            vencedoresPorCampo('poles').forEach(p => adicionarTag(p, 'poles'));

            // reiPista: maior taxa de vitória (vitórias ÷ corridas), exigindo
            // volume mínimo de corridas — purista em % pra não duplicar a tag
            // 'vitorias', que é por quantidade absoluta.
            let melhorTaxaVitoria = 0, pilotoRei = null, empateRei = false;
            Object.keys(contagem).forEach(p => {
                let c = contagem[p];
                if (c.corridas < MIN_CORRIDAS_TAXA) return;
                let taxa = c.vitorias / c.corridas;
                if (taxa > melhorTaxaVitoria) { melhorTaxaVitoria = taxa; pilotoRei = p; empateRei = false; }
                else if (taxa === melhorTaxaVitoria && taxa > 0 && p !== pilotoRei) empateRei = true;
            });
            if (pilotoRei && melhorTaxaVitoria > 0 && !empateRei) adicionarTag(pilotoRei, 'reiPista');

            // sequencia: maior sequência de vitórias consecutivas nas sessões em
            // que o piloto participou (sessão pulada não quebra a sequência).
            cronologia.sort((a, b) => (a.peso - b.peso) || (a.ordem - b.ordem));
            let sequencias = {};
            let melhorSequencia = 0, pilotoSequencia = null, empateSequencia = false;
            cronologia.forEach(sessao => {
                sessao.participantes.forEach(nome => {
                    sequencias[nome] = (nome === sessao.vencedor) ? (sequencias[nome] || 0) + 1 : 0;
                });
                Object.keys(sequencias).forEach(nome => {
                    let s = sequencias[nome];
                    if (s > melhorSequencia) { melhorSequencia = s; pilotoSequencia = nome; empateSequencia = false; }
                    else if (s === melhorSequencia && s > 0 && nome !== pilotoSequencia) empateSequencia = true;
                });
            });
            if (pilotoSequencia && melhorSequencia >= MIN_SEQUENCIA_VITORIAS && !empateSequencia) adicionarTag(pilotoSequencia, 'sequencia');

            // confiavel: maior taxa de sessões concluídas (com voltas válidas)
            // sobre as sessões em que o piloto aparece. Empate na taxa é
            // desempatado por quem tem mais sessões concluídas (mais evidência);
            // empate residual = ninguém.
            let visitas = {}, concluidas = {};
            if (typeof listaJsonsCache !== 'undefined' && Array.isArray(listaJsonsCache)) {
                listaJsonsCache.forEach(arq => {
                    (arq.dados || []).forEach(d => {
                        let nome = d.piloto ? String(d.piloto).trim() : '';
                        if (!nome) return;
                        let safeKey = nome.replace(/[.#$\/\[\]]/g, "_");
                        if (mesclagensCache[safeKey]) nome = mesclagensCache[safeKey];
                        visitas[nome] = (visitas[nome] || 0) + 1;
                        if (d.laps && d.laps.length > 0) concluidas[nome] = (concluidas[nome] || 0) + 1;
                    });
                });
            }
            let melhorConfiabilidade = 0, melhorQtdConcluidas = -1, pilotoConfiavel = null, empateConfiavel = false;
            Object.keys(visitas).forEach(p => {
                if (visitas[p] < MIN_CORRIDAS_TAXA) return;
                let taxa = (concluidas[p] || 0) / visitas[p];
                let qtd = concluidas[p] || 0;
                if (taxa > melhorConfiabilidade) { melhorConfiabilidade = taxa; melhorQtdConcluidas = qtd; pilotoConfiavel = p; empateConfiavel = false; }
                else if (taxa === melhorConfiabilidade) {
                    if (qtd > melhorQtdConcluidas) { melhorQtdConcluidas = qtd; pilotoConfiavel = p; empateConfiavel = false; }
                    else if (qtd === melhorQtdConcluidas && p !== pilotoConfiavel) empateConfiavel = true;
                }
            });
            if (pilotoConfiavel && melhorConfiabilidade > 0 && !empateConfiavel) adicionarTag(pilotoConfiavel, 'confiavel');

            // Tags de perfil: premiam o volume de corrida do próprio piloto,
            // sem disputa contra os outros.
            Object.keys(contagem).forEach(p => {
                let c = contagem[p];
                if (c.corridas >= 1 && c.corridas <= CORRIDAS_ESTREANTE_MAX) adicionarTag(p, 'estreante');
                if (c.corridas >= CORRIDAS_VETERANO) adicionarTag(p, 'veterano');
                if (c.totalVoltas >= VOLTAS_MARATONISTA && c.corridas > CORRIDAS_ESTREANTE_MAX) adicionarTag(p, 'maratonista');
            });

            let resultado = {};
            Object.keys(tagsPorPiloto).forEach(p => { resultado[p] = ordenarChavesTags(Array.from(tagsPorPiloto[p])); });
            return resultado;
        }

        // Monta um grupo compacto de ícones (sem texto) com um tooltip nativo do
        // navegador (atributo title) mostrando o nome completo de cada tag.
        // Usado em listas (ex: filtro de pilotos) onde não há espaço para o
        // texto completo de cada tag.
        function renderizarIconesTagsTooltipHtml(chaves) {
            if (!chaves || chaves.length === 0) return '';
            let icones = chaves.map(c => TAGS_PILOTOS[c] ? TAGS_PILOTOS[c].icone : '').filter(Boolean).join(' ');
            if (!icones) return '';
            let textoCompleto = chaves.map(c => TAGS_PILOTOS[c] ? `${TAGS_PILOTOS[c].icone} ${TAGS_PILOTOS[c].texto}` : '').filter(Boolean).join(' • ');
            return `<span class="piloto-tag-icones" title="${escapeHtml(textoCompleto)}">${icones}</span>`;
        }

        // Junta as tags automáticas (calculadas ao vivo) com as manuais (salvas
        // no cadastro do piloto) pra exibir no dossiê ou em qualquer outra tela.
        function obterTodasTagsPiloto(pilotoNome, tagsAutomaticasGlobais) {
            let metaKey = pilotoNome.replace(/[.#$\/\[\]]/g, "_");
            // .filter: cadastros antigos podem ter tags que viraram automáticas
            // gravadas aqui — elas são exibidas pelo cálculo, não pelo cache.
            let manuais = ((pilotosMetadadosCache[metaKey] && pilotosMetadadosCache[metaKey].tagsManuais) || [])
                .filter(c => TAGS_MANUAIS_CHAVES.includes(c));
            let automaticas = (tagsAutomaticasGlobais && tagsAutomaticasGlobais[pilotoNome]) || [];
            return ordenarChavesTags(Array.from(new Set([...automaticas, ...manuais])));
        }

        // ===================== Painel de Administração =====================

        window.abrirModalTagsPilotos = function() {
            abrirModalAdmin();
            irParaSecaoAdmin('tags');
        };

        window.fecharModalTagsPilotos = function() {
            fecharModalAdmin();
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

            // Visão geral somente leitura: a atribuição da única tag manual
            // acontece dentro de "⚙️ Configurar Piloto" (seção Pilotos).
            corpo.innerHTML = nomes.map(nome => {
                let todas = obterTodasTagsPiloto(nome, tagsAutomaticas);
                let html = todas.length > 0
                    ? renderizarTagsPilotoHtml(todas, true)
                    : `<span style="font-size: 0.72rem; color: var(--text-muted);">Nenhuma tag ainda.</span>`;
                return `
                    <div class="config-panel">
                        <div class="config-panel-title">${escapeHtml(nome)}</div>
                        <div>${html}</div>
                    </div>`;
            }).join('');
        }

        window.alternarTagManualPiloto = async function(pilotoNome, chaveTag, checkbox) {
            if (!exigirAcessoAdmin('tags', 'gerenciar')) return;
            if (!db) return;
            let metaKey = pilotoNome.replace(/[.#$\/\[\]]/g, "_");
            // Filtra chaves legadas: gravar de volta já normaliza o cadastro antigo.
            let atuais = ((pilotosMetadadosCache[metaKey] && pilotosMetadadosCache[metaKey].tagsManuais) || [])
                .filter(c => TAGS_MANUAIS_CHAVES.includes(c));
            let novas = checkbox.checked
                ? Array.from(new Set([...atuais, chaveTag]))
                : atuais.filter(c => c !== chaveTag);
            try {
                await db.ref(`pilotosMetadados/${metaKey}/tagsManuais`).set(novas);
                // Espelha a gravação no cache local: senão a tela re-renderiza com o
                // valor antigo caso o listener do Firebase ainda não tenha disparado.
                if (!pilotosMetadadosCache[metaKey]) pilotosMetadadosCache[metaKey] = {};
                pilotosMetadadosCache[metaKey].tagsManuais = novas;
                if (typeof renderizarCorpoConfigurarPiloto === 'function') renderizarCorpoConfigurarPiloto();
                renderizarPainelTagsPilotos();
            } catch (err) {
                alert("Erro: " + err.message);
                checkbox.checked = !checkbox.checked;
            }
        };
