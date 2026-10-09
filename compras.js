/* CTAD - Central de Telemetria — Compras Coletivas
   Depende de variáveis globais do script principal:
   'db' (Firebase), 'comprasColetivasCache', 'compraGerenciandoKey', 'escapeHtml()'. */

        // escJs/sanitizeId: canônicos em Utils (utils.js). Ver comentário histórico no git.

        // Retorna o timestamp de referência pra ordenar as compras: usa a última
        // atualização registrada (status, pagamento, rastreio...) e cai para a
        // data de criação em compras antigas que ainda não têm esse campo.
        function obterTimestampAtualizacaoCompra(comp) {
            return Number(comp && comp.ultimaAtualizacao) || Number(comp && comp.criadoEm) || 0;
        }

        // Ordena uma lista de chaves de comprasColetivasCache da atualização
        // mais recente para a mais antiga. Usada tanto na Gestão (admin)
        // quanto na área pública do dashboard, pra manter a mesma ordem nos dois lugares.
        function ordenarChavesComprasPorAtualizacao(chaves) {
            return chaves.slice().sort((a, b) =>
                obterTimestampAtualizacaoCompra(comprasColetivasCache[b]) - obterTimestampAtualizacaoCompra(comprasColetivasCache[a])
            );
        }

        // Registra uma entrada no histórico de uma compra (mudança de status,
        // pagamento confirmado, rastreio atualizado etc). "dataCustom" (timestamp
        // em ms) permite lançar um evento retroativo com a data real do ocorrido
        // — nesse caso a lista é reordenada pela data do evento, mas a "última
        // atualização" da compra (usada para ordenar a lista de compras) sempre
        // reflete o momento em que o admin mexeu no registro.
        function registrarHistoricoCompra(comp, tipo, descricao, dataCustom) {
            if (!comp.historico || !Array.isArray(comp.historico)) comp.historico = [];
            let ts = dataCustom || Date.now();
            comp.historico.push({ data: ts, tipo, descricao });
            comp.historico.sort((a, b) => b.data - a.data);
            // Limite configurável (compras-v2: obterLimiteHistoricoCompra,
            // configuracoesGlobais/comprasHistoricoLimite, fallback 30).
            let limiteHist = 30;
            try {
                if (typeof obterLimiteHistoricoCompra === 'function') limiteHist = obterLimiteHistoricoCompra();
            } catch (e) {}
            if (comp.historico.length > limiteHist) comp.historico = comp.historico.slice(0, limiteHist);
            comp.ultimaAtualizacao = Date.now();
        }

        // Monta a linha do tempo visual (estilo rastreador de encomendas) a partir
        // do array de histórico de uma compra. Reaproveitada tanto nos cards da
        // Gestão de Compras quanto no modal de Resumo.
        function renderizarHistoricoTimelineHtml(historico, limite) {
            if (!historico || historico.length === 0) {
                return `<div style="font-size: 0.72rem; color: var(--text-muted); padding: 4px 0;">Nenhuma atualização registrada ainda.</div>`;
            }
            let itens = historico.slice(0, limite || historico.length).map(h => {
                let palavras = (h.descricao || '').trim().split(' ');
                let icone = palavras[0] || '🔔';
                let textoSemIcone = palavras.slice(1).join(' ') || h.descricao || '';
                let classeTipo = `tipo-${h.tipo || 'status'}`;
                return `
                    <div class="historico-timeline-item">
                        <div class="historico-timeline-icone ${classeTipo}">${icone}</div>
                        <div class="historico-timeline-data">${formatarDataHistoricoCompra(h.data)}</div>
                        <div class="historico-timeline-texto">${escapeHtml(textoSemIcone)}</div>
                    </div>`;
            }).join('');
            return `<div class="historico-timeline">${itens}</div>`;
        }

        // Retorna a atualização mais recente especificamente do tipo "rastreio"
        // (ex: Postado, Em trânsito), ignorando mudanças de status/pagamento.
        function obterUltimoEventoRastreio(historico) {
            if (!historico || historico.length === 0) return null;
            return historico.find(h => h.tipo === 'rastreio') || null;
        }

        // Sincroniza os itens de uma compra (marcados como "recomendar") com o
        // catálogo de Produtos Recomendados. Cada item vira (ou atualiza) uma
        // entrada própria; itens desmarcados ou removidos da compra têm sua
        // entrada correspondente apagada. Não mexe em freteAprox/impostoAprox,
        // que são preenchidos manualmente pelo admin no painel de recomendados.
        async function sincronizarProdutosRecomendadosDaCompra(compraKey, comp) {
            if (!db) return;
            let itens = (comp && comp.itens) || [];
            let updates = {};

            itens.forEach((it, idx) => {
                let id = `compra_${compraKey}_${idx}`;
                if (it.recomendar !== false && it.descricao && it.descricao.trim()) {
                    updates[`produtosRecomendados/${id}/nome`] = it.descricao;
                    updates[`produtosRecomendados/${id}/linkImagem`] = it.imagem || '';
                    updates[`produtosRecomendados/${id}/linkSite`] = it.link || '';
                    updates[`produtosRecomendados/${id}/valorAprox`] = it.valor || 0;
                    updates[`produtosRecomendados/${id}/origem`] = 'compra';
                    updates[`produtosRecomendados/${id}/compraOrigemKey`] = compraKey;
                    if (!produtosRecomendadosCache[id]) {
                        updates[`produtosRecomendados/${id}/ordem`] = Date.now();
                    }
                } else {
                    updates[`produtosRecomendados/${id}`] = null;
                }
            });

            // Limpa entradas órfãs (itens que existiam antes e foram removidos da compra).
            let prefixo = `compra_${compraKey}_`;
            Object.keys(produtosRecomendadosCache || {}).forEach(id => {
                if (!id.startsWith(prefixo)) return;
                let idx = parseInt(id.substring(prefixo.length), 10);
                if (!Number.isFinite(idx) || idx >= itens.length) {
                    updates[`produtosRecomendados/${id}`] = null;
                }
            });

            if (Object.keys(updates).length === 0) return;
            try { await db.ref().update(updates); } catch (err) { console.warn('Erro ao sincronizar recomendados:', err); }
        }

        function formatarDataHistoricoCompra(ts) {
            if (!ts) return "";
            try {
                return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch (e) { return ""; }
        }

        window.abrirModalCompras = function() {
            compraGerenciandoKey = null;
            abrirModalAdmin();
            irParaSecaoAdmin('compras');
        };

        window.fecharModalCompras = function() { fecharModalAdmin(); };

        window.criarCompraColetiva = async function() {
            if (!exigirAcessoAdmin('compras', 'criar')) return;
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
                    nome: pNome, ativo: true, comprador: false, valorDevido: 0, pago: false, pixPersonalizado: ""
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

        // Sincroniza pilotos conhecidos na compra SEM criar "fantasmas" no
        // rateio: recém-chegados entram inativos (autoSync) e só afetam os
        // valores quando o admin ativá-los. Nunca altera quem já está salvo.
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
                    comp.participantes[pKey] = { nome: pNome.trim(), ativo: false, comprador: false, valorDevido: 0, pago: false, pixPersonalizado: "", autoSync: true };
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
                // atribuidoA pode ser 'TODOS', nome legado ou 'key:<pKey>' (novo).
                let specificCost = itens.filter(it => it.atribuidoA === p.nome || it.atribuidoA === ('key:' + pk)).reduce((acc, it) => acc + ((it.valor || 0) * (it.qtd || 1)), 0);
                let sharedCost = p.ativo ? valorTodosPorAtivo : 0;
                let adjCost = p.ativo ? ajustePorAtivo : 0;
                p.valorDevido = parseFloat((specificCost + sharedCost + adjCost).toFixed(2));
            });
        }

        window.alternarEntregueCompra = async function(compraKey) {
            if (!exigirAcessoAdmin('compras', 'gerenciar')) return;
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

            registrarHistoricoCompra(comp, 'status', comp.entregue ? '📦 Marcado como entregue' : 'Desmarcado como entregue');

            try {
                await db.ref(`comprasColetivas/${compraKey}`).update({
                    entregue: comp.entregue, status: comp.status,
                    historico: comp.historico || [], ultimaAtualizacao: comp.ultimaAtualizacao || Date.now()
                });
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.salvarCompraGerenciada = async function(compraKey) {
            if (!exigirAcessoAdmin('compras', 'editar')) return;
            if (!db) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;

            // Guarda o "antes" pra detectar o que realmente mudou e registrar no histórico.
            let statusAntigo = comp.status;
            let rastreioAntigo = comp.rastreio || "";
            let entregueAntigo = !!comp.entregue;
            let pagosAntigos = Object.values(comp.participantes || {}).filter(p => p && p.pago).map(p => p.nome);

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
                    atribuidoA: document.getElementById(`item-atr-${idx}`)?.value || "TODOS",
                    recomendar: document.getElementById(`item-rec-${idx}`)?.checked !== false
                });
            });
            comp.itens = novasItens;
            // Normaliza atribuidoA legado (nome do piloto) para 'key:<pKey>',
            // estável a renomeações. Mapa direto do DOM (pkey + nome da linha).
            let nomeParaKeySalva = {};
            document.querySelectorAll('.det-part-row').forEach(row => {
                nomeParaKeySalva[row.getAttribute('data-nome')] = row.getAttribute('data-pkey');
            });
            comp.itens.forEach(it => {
                if (it.atribuidoA && it.atribuidoA !== 'TODOS' && it.atribuidoA.indexOf('key:') !== 0 && nomeParaKeySalva[it.atribuidoA]) {
                    it.atribuidoA = 'key:' + nomeParaKeySalva[it.atribuidoA];
                }
            });
            // Subtotal é calculado, não editável: ignora o input readonly.
            comp.financeiro.subtotal = comp.itens.reduce((acc, it) => acc + ((it.valor || 0) * (it.qtd || 1)), 0);

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
            // Qtd mínima (definida na criação): só avisa, não bloqueia.
            let qtdMinima = parseInt(comp.qtdMinima, 10) || 0;
            if (qtdMinima > 0 && ativos.length < qtdMinima) {
                if (!confirm(`Atenção: só ${ativos.length} participante(s) ativo(s), abaixo da qtd. mínima (${qtdMinima}). Salvar mesmo assim?`)) return;
            }
            if (quitada && comp.entregue) comp.status = "FINALIZADA / CONCLUÍDA";
            else if (comp.entregue) comp.status = "ENTREGUE";
            else if (quitada) comp.status = "QUITADA";
            else comp.status = "EM ANDAMENTO / PENDENTE";

            // Registra no histórico só o que de fato mudou nessa edição.
            if ((comp.rastreio || "") !== rastreioAntigo && comp.rastreio) {
                registrarHistoricoCompra(comp, 'rastreio', `🔎 Código de rastreio atualizado: ${comp.rastreio}`);
            }
            let pagosNovos = Object.values(novosParticipantes).filter(p => p && p.pago).map(p => p.nome);
            let novosPagamentos = pagosNovos.filter(n => !pagosAntigos.includes(n));
            if (novosPagamentos.length > 0) {
                registrarHistoricoCompra(comp, 'pagamento', `💰 Pagamento confirmado: ${novosPagamentos.join(', ')}`);
            }
            if (!!comp.entregue !== entregueAntigo) {
                registrarHistoricoCompra(comp, 'status', comp.entregue ? '📦 Marcado como entregue' : 'Desmarcado como entregue');
            } else if (comp.status !== statusAntigo) {
                registrarHistoricoCompra(comp, 'status', `Status alterado para "${comp.status}"`);
            }

            try {
                // Update parcial por campo: edições concorrentes em campos
                // diferentes (ex: rastreio rápido vs. gestão) não se apagam.
                let base = `comprasColetivas/${compraKey}`;
                let paths = {};
                paths[`${base}/nome`] = comp.nome;
                paths[`${base}/entregue`] = comp.entregue;
                paths[`${base}/financeiro`] = comp.financeiro;
                paths[`${base}/chavePix`] = comp.chavePix;
                paths[`${base}/rastreio`] = comp.rastreio;
                paths[`${base}/itens`] = comp.itens;
                paths[`${base}/participantes`] = comp.participantes;
                paths[`${base}/status`] = comp.status;
                paths[`${base}/historico`] = comp.historico || [];
                paths[`${base}/ultimaAtualizacao`] = comp.ultimaAtualizacao || Date.now();
                await db.ref().update(paths);
                await sincronizarProdutosRecomendadosDaCompra(compraKey, comp);
                alert("Salvo com sucesso!");
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.adicionarItemCompra = async function(compraKey) {
            if (!exigirAcessoAdmin('compras', 'editar')) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            if (!comp.itens) comp.itens = [];
            comp.itens.push({ imagem: "", descricao: "Novo Item", link: "", valor: 0.0, qtd: 1, atribuidoA: "TODOS" });
            try {
                await db.ref(`comprasColetivas/${compraKey}/itens`).set(comp.itens);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.removerItemCompra = async function(compraKey, index) {
            if (!exigirAcessoAdmin('compras', 'editar')) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp || !comp.itens) return;
            comp.itens.splice(index, 1);
            try {
                await db.ref(`comprasColetivas/${compraKey}`).update({ itens: comp.itens, ultimaAtualizacao: Date.now() });
                await sincronizarProdutosRecomendadosDaCompra(compraKey, comp);
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.adicionarParticipanteCompra = async function(compraKey) {
            if (!exigirAcessoAdmin('compras', 'gerenciar')) return;
            let nomeInput = document.getElementById('input-novo-participante-compra');
            let nome = nomeInput ? nomeInput.value.trim() : "";
            if (!nome) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            if (!comp.participantes) comp.participantes = {};
            let pKey = "part_" + nome.toLowerCase().replace(/[^a-z0-9]/g, "_");
            comp.participantes[pKey] = { nome, ativo: true, comprador: false, valorDevido: 0, pago: false, pixPersonalizado: "" };
            try {
                await db.ref(`comprasColetivas/${compraKey}/participantes/${pKey}`).set(comp.participantes[pKey]);
                if (nomeInput) nomeInput.value = "";
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.removerParticipanteCompra = async function(compraKey, pKey) {
            if (!exigirAcessoAdmin('compras', 'gerenciar')) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp || !comp.participantes) return;
            delete comp.participantes[pKey];
            try {
                await db.ref(`comprasColetivas/${compraKey}/participantes/${pKey}`).remove();
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        // Atalho de 1 clique pra registrar um evento comum de rastreio no histórico,
        // sem precisar digitar nada. Não depende de nenhuma API externa.
        // "evento" pode ser uma das chaves padrão (postado/transito/...) ou, para
        // atalhos personalizados, a própria descrição pronta (ex: "🧾 Nota fiscal emitida").
        // Se o campo de data/hora do card estiver preenchido, usa essa data no
        // lugar de "agora" (pra lançar atualizações retroativas).
        window.registrarEventoRastreioCompra = async function(compraKey, evento) {
            if (!exigirAcessoAdmin('compras', 'gerenciar')) return;
            if (!db) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;

            let textos = {
                postado: '📮 Objeto postado nos Correios',
                transito: '🚚 Objeto em trânsito',
                saiu_entrega: '📦 Saiu para entrega',
                entregue: '✅ Objeto entregue (rastreio)'
            };
            let descricao = textos[evento] || evento || 'Atualização de rastreio';

            let dataInputEl = document.getElementById(`det-rastreio-data-${compraKey}`);
            let dataCustom = (dataInputEl && dataInputEl.value) ? new Date(dataInputEl.value).getTime() : null;

            registrarHistoricoCompra(comp, 'rastreio', descricao, dataCustom);

            try {
                await db.ref(`comprasColetivas/${compraKey}`).update({ historico: comp.historico || [], ultimaAtualizacao: comp.ultimaAtualizacao || Date.now() });
                if (dataInputEl) dataInputEl.value = '';
                renderizarModalComprasColetivas();
            } catch (err) { alert("Erro: " + err.message); }
        };

        // Cria um novo atalho de rastreio personalizado (ícone + texto), salvo
        // globalmente em configuracoesGlobais — fica disponível em todas as compras.
        window.adicionarAtalhoRastreioCustom = async function() {
            if (!exigirAcessoAdmin('compras', 'gerenciar')) return;
            if (!db) return;
            let icone = prompt("Ícone do atalho (um emoji, ex: 🧾):", "🔖");
            if (icone === null) return;
            let texto = prompt("Texto do atalho (ex: Nota fiscal emitida):", "");
            if (texto === null || !texto.trim()) return;

            let atalhos = Array.isArray(atalhosRastreioCustomCache) ? [...atalhosRastreioCustomCache] : [];
            atalhos.push({ icone: icone.trim() || '🔖', texto: texto.trim() });
            try {
                await db.ref('configuracoesGlobais/atalhosRastreioCustom').set(atalhos);
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.finalizarCompraColetivaStatus = async function(compraKey) {
            if (!exigirAcessoAdmin('compras', 'excluir')) return;
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            let ativosFin = Object.values(comp.participantes || {}).filter(p => p && p.ativo);
            let qtdMinFin = parseInt(comp.qtdMinima, 10) || 0;
            if (qtdMinFin > 0 && ativosFin.length < qtdMinFin) {
                if (!confirm(`Atenção: só ${ativosFin.length} participante(s) ativo(s), abaixo da qtd. mínima (${qtdMinFin}). Concluir mesmo assim?`)) return;
            }
            comp.entregue = true;
            comp.status = "FINALIZADA / CONCLUÍDA";
            registrarHistoricoCompra(comp, 'status', '🏁 Compra finalizada manualmente');
            try {
                await db.ref(`comprasColetivas/${compraKey}`).update({
                    entregue: true, status: comp.status,
                    historico: comp.historico || [], ultimaAtualizacao: comp.ultimaAtualizacao || Date.now()
                });
                renderizarModalComprasColetivas();
            } catch(err) { alert("Erro: " + err.message); }
        };

        window.excluirCompraColetiva = async function(compraKey) {
            if (!hasPerm('compras', 'gerenciar')) { alert("🔒 Faça login como administrador primeiro."); return; }
            if (confirm("Excluir esta compra coletiva?")) {
                try {
                    await db.ref(`comprasColetivas/${compraKey}`).remove();
                    await sincronizarProdutosRecomendadosDaCompra(compraKey, { itens: [] });
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
                    // value 'key:<pKey>' (estável a renomeações); legado por nome ainda lido.
                    let optionsPilotos = `<option value="TODOS" ${it.atribuidoA === 'TODOS' ? 'selected' : ''}>TODOS</option>` +
                        listaPilotosDisponiveis.map(p => {
                            let pkOpt = "part_" + p.toLowerCase().replace(/[^a-z0-9]/g, "_");
                            let sel = (it.atribuidoA === ('key:' + pkOpt) || it.atribuidoA === p) ? 'selected' : '';
                            return `<option value="key:${pkOpt}" ${sel}>${escapeHtml(p)}</option>`;
                        }).join('');
                    
                    return `
                        <div class="det-item-row" data-index="${idx}" style="display: grid; grid-template-columns: 1fr 1.8fr 1.2fr 75px 45px 85px 1.2fr 28px 32px; gap: 6px; align-items: center; margin-bottom: 6px;">
                            <input type="text" id="item-img-${idx}" class="config-input" value="${escapeHtml(it.imagem || '')}" placeholder="Img URL" style="font-size: 0.75rem;">
                            <input type="text" id="item-desc-${idx}" class="config-input" value="${escapeHtml(it.descricao || '')}" placeholder="Descrição" style="font-size: 0.75rem;">
                            <input type="text" id="item-link-${idx}" class="config-input" value="${escapeHtml(it.link || '')}" placeholder="Link" style="font-size: 0.75rem;">
                            <input type="number" step="0.001" id="item-val-${idx}" class="config-input" value="${it.valor || 0}" placeholder="Valor" style="font-size: 0.75rem;">
                            <input type="number" id="item-qtd-${idx}" class="config-input" value="${it.qtd || 1}" placeholder="Qtd" style="font-size: 0.75rem;">
                            <span style="color: var(--accent-gold); font-weight: 700; font-size: 0.78rem;">R$ ${subtotalItem.toFixed(2)}</span>
                            <select id="item-atr-${idx}" class="config-select" style="font-size: 0.75rem;">${optionsPilotos}</select>
                            <input type="checkbox" id="item-rec-${idx}" ${it.recomendar !== false ? 'checked' : ''} title="Incluir nos Produtos Recomendados" style="width: 16px; height: 16px; accent-color: var(--accent-gold); cursor: pointer; justify-self: center;">
                            <button class="btn-action-danger" style="padding: 3px 6px;" onclick="removerItemCompra('${escJs(compraGerenciandoKey)}', ${idx})">🗑️</button>
                        </div>
                    `;
                }).join('');

                let participantesHtml = Object.keys(participantes).filter(pk => participantes[pk] && participantes[pk].nome).map(pk => {
                    let p = participantes[pk];
                    return `
                        <div class="det-part-row" data-pkey="${pk}" data-nome="${escapeHtml(p.nome)}" style="display: grid; grid-template-columns: 40px 1.8fr 60px 80px 60px 2fr 32px; gap: 6px; align-items: center; background: rgba(21,28,40,0.6); padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-card); margin-bottom: 4px;">
                            <div style="text-align: center;"><input type="checkbox" id="part-ativo-${pk}" ${p.ativo ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent-green); cursor: pointer;"></div>
                            <div><strong style="font-size: 0.82rem;">${escapeHtml(p.nome)}</strong>${(p.autoSync && !p.ativo) ? ' <span style="font-size: 0.65rem; color: var(--accent-gold); font-weight: 700;">🆕 novo</span>' : ''}</div>
                            <div style="text-align: center;"><input type="radio" name="comprador_radio" id="part-comprador-${pk}" ${p.comprador ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent-blue); cursor: pointer;"></div>
                            <div style="color: var(--accent-gold); font-weight: 700; font-size: 0.82rem;">R$ ${(p.valorDevido || 0).toFixed(2)}</div>
                            <div style="text-align: center;"><input type="checkbox" id="part-pago-${pk}" ${p.pago ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--accent-green); cursor: pointer;"></div>
                            <div><input type="text" id="part-recibo-${pk}" class="config-input" value="${escapeHtml(p.pixPersonalizado || '')}" placeholder="Pix Copia e Cola" style="width: 100%; font-size: 0.75rem;"></div>
                            <div style="text-align: right;"><button class="btn-action-danger" style="padding: 3px 6px;" onclick="removerParticipanteCompra('${escJs(compraGerenciandoKey)}', '${escJs(pk)}')">🗑️</button></div>
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
                        <p style="font-size: 0.68rem; color: var(--text-muted); margin: 0 0 2px;">A caixinha dourada de cada item controla se ele entra nos Produtos Recomendados (marcada por padrão).</p>
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                            ${itensHtml}
                        </div>
                        <div><button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 5px 10px; font-size: 0.75rem;" onclick="adicionarItemCompra('${escJs(compraGerenciandoKey)}')">+ Item</button></div>
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
                        <div class="config-panel-title">4. Participantes & Rateio${comp.qtdMinima ? ` <span style="font-size: 0.68rem; color: var(--text-muted); font-weight: 400;">(qtd. mínima: ${comp.qtdMinima})</span>` : ''}</div>
                        <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px; flex-wrap: wrap;">
                            <input type="text" id="input-novo-participante-compra" class="config-input" placeholder="Novo participante (Ex: Carlos)" style="max-width: 220px; font-size: 0.78rem;">
                            <button class="btn-action-primary" style="background: #2ec4b6; color: #000; font-weight: 700; padding: 5px 10px; font-size: 0.75rem;" onclick="adicionarParticipanteCompra('${escJs(compraGerenciandoKey)}')">+ Participante</button>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
                            ${participantesHtml}
                        </div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">5. Chave Pix</div>
                        <div style="margin-top: 2px;">
                            <input type="text" id="det-chave-pix" class="config-input" value="${escapeHtml(comp.chavePix || '')}" placeholder="Chave Pix Copia e Cola Global" style="font-size: 0.78rem;">
                        </div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">6. Rastreio</div>
                        <div style="display: flex; gap: 6px; margin-top: 2px;">
                            <input type="text" id="det-rastreio" class="config-input" value="${escapeHtml(comp.rastreio || '')}" placeholder="Código de Rastreio (Ex: NN374569092BR)" style="font-size: 0.78rem; flex: 1;" oninput="document.getElementById('btn-verificar-rastreio-${escJs(compraGerenciandoKey)}').style.display = this.value.trim() ? 'inline-flex' : 'none';">
                            <button id="btn-verificar-rastreio-${compraGerenciandoKey}" class="btn" style="background: rgba(58,134,255,0.15); color: #3a86ff; border: 1px solid #3a86ff; padding: 4px 10px; font-size: 0.72rem; white-space: nowrap; ${comp.rastreio ? '' : 'display: none;'}" onclick="window.open('https://rastreamento.correios.com.br/app/index.php?objetos=' + encodeURIComponent(document.getElementById('det-rastreio').value.trim()), '_blank')">🔎 Verificar</button>
                        </div>
                    </div>

                    <div class="config-panel">
                        <div class="config-panel-title">7. Histórico de Rastreio</div>
                        <div style="margin: 4px 0 8px;">
                            <label style="font-size: 0.7rem; color: var(--text-muted);">Data/hora do evento (opcional — deixe vazio para usar "agora"):</label>
                            <input type="datetime-local" id="det-rastreio-data-${compraGerenciandoKey}" class="config-input" style="font-size: 0.78rem; margin-top: 2px;">
                        </div>
                        <p style="font-size: 0.7rem; color: var(--text-muted); margin: 2px 0 6px;">Atalho pra registrar a atualização no histórico com 1 clique (salva na hora):</p>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                            <button class="btn" style="background: var(--bg-body); border: 1px solid var(--border-card); padding: 3px 8px; font-size: 0.7rem; color: #fff;" onclick="registrarEventoRastreioCompra('${escJs(compraGerenciandoKey)}', 'postado')">📮 Postado</button>
                            <button class="btn" style="background: var(--bg-body); border: 1px solid var(--border-card); padding: 3px 8px; font-size: 0.7rem; color: #fff;" onclick="registrarEventoRastreioCompra('${escJs(compraGerenciandoKey)}', 'transito')">🚚 Em trânsito</button>
                            <button class="btn" style="background: var(--bg-body); border: 1px solid var(--border-card); padding: 3px 8px; font-size: 0.7rem; color: #fff;" onclick="registrarEventoRastreioCompra('${escJs(compraGerenciandoKey)}', 'saiu_entrega')">📦 Saiu p/ entrega</button>
                            <button class="btn" style="background: var(--bg-body); border: 1px solid var(--border-card); padding: 3px 8px; font-size: 0.7rem; color: #fff;" onclick="registrarEventoRastreioCompra('${escJs(compraGerenciandoKey)}', 'entregue')">✅ Entregue</button>
                            ${(atalhosRastreioCustomCache || []).map(a => {
                                let descricaoCompleta = `${a.icone || '🔖'} ${a.texto || ''}`.trim();
                                return `<button class="btn" data-descricao="${escapeHtml(descricaoCompleta)}" style="background: var(--bg-body); border: 1px solid var(--border-card); padding: 3px 8px; font-size: 0.7rem; color: #fff;" onclick="registrarEventoRastreioCompra('${escJs(compraGerenciandoKey)}', this.dataset.descricao)">${a.icone || '🔖'} ${escapeHtml(a.texto || '')}</button>`;
                            }).join('')}
                            <button class="btn" style="background: transparent; border: 1px dashed var(--border-card); color: #fff; padding: 3px 8px; font-size: 0.7rem;" onclick="adicionarAtalhoRastreioCustom()">➕ Novo atalho</button>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap; gap: 6px;">
                        <button class="btn-action-danger" style="padding: 7px 14px; font-size: 0.78rem;" onclick="excluirCompraColetiva('${escJs(compraGerenciandoKey)}')">🗑️ Excluir</button>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn-action-primary" style="background: #3a86ff; padding: 7px 14px; font-size: 0.78rem;" onclick="finalizarCompraColetivaStatus('${escJs(compraGerenciandoKey)}')">✔️ Concluir</button>
                            <button class="btn-action-primary" style="background: #2ec4b6; color: #000; padding: 7px 14px; font-size: 0.78rem;" onclick="salvarCompraGerenciada('${escJs(compraGerenciandoKey)}')">💾 Salvar</button>
                        </div>
                    </div>
                `;
                return;
            }

            if (tituloEl) tituloEl.innerHTML = `🛒 Gestão de Compras Coletivas`;

            // As compras são exibidas da mais recentemente ATUALIZADA para a mais antiga
            // (mudança de status, pagamento ou rastreio conta como atualização).
            let keys = ordenarChavesComprasPorAtualizacao(Object.keys(comprasColetivasCache));

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

                let ultimaAtualizacaoTs = obterTimestampAtualizacaoCompra(comp);
                let historico = Array.isArray(comp.historico) ? comp.historico : [];
                let historicoItensHtml = renderizarHistoricoTimelineHtml(historico, 8);

                return `
                    <div style="background: var(--bg-input); border: 1px solid var(--border-card); border-left: 5px solid ${finalizada ? 'var(--accent-green)' : (quitada ? 'var(--accent-blue)' : 'var(--accent-gold)')}; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span style="font-size: 0.95rem; font-weight: 700; color: var(--text-title);">🛒 ${escapeHtml(comp.nome || comp.chave)}</span>
                                <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${badgeColor}">${statusExibicao}</span>
                            </div>
                            <div style="display: flex; gap: 5px; align-items: center; flex-wrap: wrap;">
                                <button class="btn" style="background: rgba(46,196,182,0.15); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 4px 8px; font-size: 0.75rem;" onclick="alternarEntregueCompra('${escJs(k)}')">${entregue ? '✅ Entregue' : '📦 Marcar Entregue'}</button>
                                <button class="btn" style="background: rgba(114,9,183,0.25); color: #e0aaff; border: 1px solid #7209b7; padding: 4px 8px; font-size: 0.75rem;" onclick="resumirCompraColetiva('${escJs(k)}')">📊 Resumo</button>
                                <button class="btn" style="background: rgba(37,211,102,0.15); color: #25D366; border: 1px solid #25D366; padding: 4px 8px; font-size: 0.75rem;" onclick="compartilharResumoCompra('${escJs(k)}')">📤</button>
                                <button class="btn" style="background: rgba(46,196,182,0.15); color: var(--accent-green); border: 1px solid var(--accent-green); padding: 4px 8px; font-size: 0.75rem;" onclick="gerenciarCompraColetiva('${escJs(k)}')">⚙️ Gerenciar</button>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-size: 0.7rem; color: var(--text-muted);">🕘 Última atualização: ${ultimaAtualizacaoTs ? formatarDataHistoricoCompra(ultimaAtualizacaoTs) : '—'}</span>
                            <button class="btn" style="background: transparent; color: var(--accent-blue); border: 1px solid var(--accent-blue); padding: 2px 8px; font-size: 0.7rem;" onclick="let el = document.getElementById('historico-compra-${escJs(k)}'); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';">Ver Histórico (${historico.length})</button>
                        </div>
                        ${(() => {
                            let ultimoRastreio = obterUltimoEventoRastreio(historico);
                            if (!ultimoRastreio) return '';
                            let partes = (ultimoRastreio.descricao || '').trim().split(' ');
                            let icone = partes[0] || '🚚';
                            let textoSemIcone = partes.slice(1).join(' ') || ultimoRastreio.descricao;
                            return `<div style="font-size: 0.7rem; color: var(--accent-gold);">${icone} Rastreio: ${escapeHtml(textoSemIcone)} <span style="color: var(--text-muted);">(${formatarDataHistoricoCompra(ultimoRastreio.data)})</span></div>`;
                        })()}
                        <div id="historico-compra-${k}" style="display: none; background: var(--bg-body); border-radius: 6px; padding: 10px 14px; max-height: 260px; overflow-y: auto;">
                            ${historicoItensHtml}
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

        // Compartilha o resumo financeiro de uma compra coletiva (igual ao
        // compartilhamento de campeonato: nativo > clipboard > link do WhatsApp).
        window.compartilharResumoCompra = async function(compraKey) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            sincronizarParticipantesCompra(comp);
            calcularValoresDevidosCompra(comp);

            let participantes = Object.values(comp.participantes || {}).filter(p => p && p.nome && p.nome.trim() !== "" && p.ativo);
            let linhas = [
                `🛒 *${comp.nome || comp.chave}*`,
                `Status: ${comp.status || '—'}`,
                ''
            ];
            participantes.forEach(p => {
                linhas.push(`${p.pago ? '✅' : '❌'} ${p.nome} — R$ ${(p.valorDevido || 0).toFixed(2)} ${p.pago ? '(Pago)' : '(Pendente)'}`);
            });
            linhas.push('');
            linhas.push(`🔗 https://luisrcsb.github.io/ctad/#compra=${compraKey}`);
            const texto = linhas.join('\n');

            if (navigator.share) {
                try {
                    await navigator.share({ text: texto });
                    return;
                } catch (err) {
                    if (err && err.name === 'AbortError') return;
                }
            }
            if (navigator.clipboard) {
                try {
                    await navigator.clipboard.writeText(texto);
                    alert("Texto copiado! Cole (Ctrl+V) na conversa do WhatsApp.");
                    return;
                } catch (err) { /* segue pro último recurso abaixo */ }
            }
            const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        };

        window.resumirCompraColetiva = function(compraKey) {
            let comp = comprasColetivasCache[compraKey];
            if (!comp) return;
            compraResumoAtualKey = compraKey;
            sincronizarParticipantesCompra(comp);
            calcularValoresDevidosCompra(comp);

            let participantes = comp.participantes || {};

            let modalTituloEl = document.getElementById('compra-resumo-titulo');
            let modalCorpoEl = document.getElementById('compra-resumo-corpo');
            if (!modalCorpoEl) return;

            if (modalTituloEl) modalTituloEl.innerHTML = `📊 Resumo: ${escapeHtml(comp.nome || comp.chave)}`;

            let chavePixBase = (comp.chavePix || "").trim();

            let participantesHtml = Object.keys(participantes).filter(pk => {
                let p = participantes[pk];
                return p && p.nome && p.nome.trim() !== "" && p.ativo;
            }).map(pk => {
                let p = participantes[pk];
                let statusBadge = p.pago ? `<span style="color: var(--accent-green); font-weight: 700;">Pago ✅</span>` : `<span style="color: var(--accent-red); font-weight: 700;">Pendente ❌</span>`;
                // Toggle rápido de pagamento (admin): transação atômica + histórico.
                let togglePagoHtml = (typeof hasPerm === 'function' && hasPerm('compras', 'editar'))
                    ? `<button class="btn-text-action" style="font-size: 0.7rem;" onclick="alternarPagoCompraRapido('${escJs(compraKey)}', '${escJs(pk)}')">${p.pago ? '↩️ desfazer' : '✔️ confirmar'}</button>`
                    : '';
                let pixBoxHtml = "";
                if (!p.pago) {
                    let valorStr = (p.valorDevido || 0).toFixed(2);
                    let payloadPixPiloto = (p.pixPersonalizado && p.pixPersonalizado.trim() !== "") ? p.pixPersonalizado : (chavePixBase ? `${chavePixBase} (Valor: R$ ${valorStr} - ${p.nome})` : "");
                    if (payloadPixPiloto) {
                        let qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(payloadPixPiloto)}`;
                        let pixInputId = 'pix-resumo-' + sanitizeId(p.nome);

                        pixBoxHtml = `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-card); display: flex; flex-direction: column; align-items: center; gap: 6px; background: var(--bg-body); padding: 6px; border-radius: 6px;">
                            <span style="font-size: 0.72rem; color: var(--accent-gold); font-weight: 700;">Pix (R$ ${valorStr})</span>
                            <div style="background: #fff; padding: 3px; border-radius: 4px; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center;">
                                <img src="${escapeHtml(qrCodeUrl)}" alt="QR Code Pix" style="max-width: 100%; max-height: 100%;" onerror="qrFallback(this)">
                            </div>
                            <div style="display: flex; gap: 4px; width: 100%;">
                                <input type="text" readonly class="config-input" id="${pixInputId}" value="${escapeHtml(payloadPixPiloto)}" style="font-size: 0.68rem; text-align: center; color: var(--text-muted);">
                                <button class="btn-action-primary" style="padding: 3px 6px; font-size: 0.68rem;" data-pix-input="${pixInputId}" onclick="navigator.clipboard.writeText(document.getElementById(this.dataset.pixInput).value); alert('Pix Copia e Cola copiado!');">Copiar</button>
                            </div>
                        </div>
                    `;
                    } else {
                        pixBoxHtml = `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-card); font-size: 0.72rem; color: var(--text-muted); text-align: center;">
                            Pix ainda não configurado pelo administrador desta compra.
                        </div>`;
                    }
                }

                return `
                    <div style="background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: var(--text-title); font-size: 0.85rem;">${escapeHtml(p.nome)}</strong>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="color: var(--accent-gold); font-weight: 700; font-size: 0.85rem;">R$ ${(p.valorDevido || 0).toFixed(2)}</span>
                                ${statusBadge}
                                ${togglePagoHtml}
                            </div>
                        </div>
                        ${pixBoxHtml}
                    </div>
                `;
            }).join('') || `<div style="text-align: center; color: var(--text-muted);">Nenhum participante.</div>`;

            let historicoHtml = renderizarHistoricoTimelineHtml(comp.historico, 20);

            modalCorpoEl.innerHTML = `
                <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 6px; max-height: 55vh; overflow-y: auto; padding-right: 4px;">
                        <div class="config-panel-title" style="font-size: 0.78rem;">💰 Financeiro</div>
                        ${participantesHtml}
                    </div>
                    <div style="flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 6px; max-height: 55vh; overflow-y: auto; padding-right: 4px; border-left: 1px solid var(--border-card); padding-left: 16px;">
                        <div class="config-panel-title" style="font-size: 0.78rem;">🕘 Histórico de Movimentação</div>
                        ${historicoHtml}
                    </div>
                </div>
            `;
            document.getElementById('compra-resumo-modal').style.display = 'flex';
        };

        window.fecharModalResumoCompra = function() {
            document.getElementById('compra-resumo-modal').style.display = 'none';
        };

