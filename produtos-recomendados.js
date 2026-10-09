/* CTAD - Central de Telemetria — Produtos Recomendados
   Depende de variáveis/funções globais do script principal:
   'db' (Firebase), 'produtosRecomendadosCache', 'comprasColetivasCache', 'escapeHtml()',
   'usuarioAtual', 'pilotoVinculadoAoUsuario'.

   Cada entrada tem: { nome, linkImagem, linkSite, descricao, valorAprox, freteAprox,
   impostoAprox, origem: 'compra'|'manual', compraOrigemKey?, ordem, favoritadoPor?: {uid: true} }.

   Itens com origem 'compra' são criados/atualizados automaticamente por
   compras.js (ver sincronizarProdutosRecomendadosDaCompra) sempre que uma
   compra coletiva é salva — nome/imagem/link/valor vêm do item da compra.
   Frete, imposto e descrição são sempre preenchidos manualmente aqui.

   Ordenação: o painel ADMIN usa o campo "ordem" (setas ▲▼, controle manual).
   A VITRINE pública usa favoritos primeiro (mais "❤️ Lista de Desejos" no
   topo) e "ordem" como critério de desempate. */

        // escJs(): canônico em Utils.escJsAttr (utils.js).

        // ===================== Painel de Administração (CRUD) =====================

        window.abrirModalProdutosRecomendados = function() {
            abrirModalAdmin();
            irParaSecaoAdmin('recomendados');
        };

        window.fecharModalProdutosRecomendados = function() {
            fecharModalAdmin();
        };

        let produtoEmEdicaoId = null;

        function contarFavoritosProduto(p) {
            return p && p.favoritadoPor ? Object.keys(p.favoritadoPor).length : 0;
        }

        // Ordenação manual (admin): campo "ordem", controlado pelas setas ▲▼.
        function listarIdsProdutosRecomendadosOrdenados() {
            return Object.keys(produtosRecomendadosCache || {}).sort((a, b) => {
                let pa = produtosRecomendadosCache[a] || {}, pb = produtosRecomendadosCache[b] || {};
                return (Number(pa.ordem) || 0) - (Number(pb.ordem) || 0);
            });
        }

        // Ordenação pública (vitrine): mais favoritados primeiro, "ordem" desempata.
        function listarIdsProdutosRecomendadosPorFavoritos() {
            return Object.keys(produtosRecomendadosCache || {}).sort((a, b) => {
                let pa = produtosRecomendadosCache[a] || {}, pb = produtosRecomendadosCache[b] || {};
                let favA = contarFavoritosProduto(pa), favB = contarFavoritosProduto(pb);
                if (favB !== favA) return favB - favA;
                return (Number(pa.ordem) || 0) - (Number(pb.ordem) || 0);
            });
        }

        function renderizarPainelProdutosRecomendados() {
            let corpo = document.getElementById('produtos-recomendados-corpo');
            if (!corpo) return;

            let ids = listarIdsProdutosRecomendadosOrdenados();

            let listaHtml = ids.map((id, idx) => {
                let p = produtosRecomendadosCache[id] || {};
                let ehDeCompra = p.origem === 'compra';
                let nomeCompraOrigem = ehDeCompra && p.compraOrigemKey && comprasColetivasCache[p.compraOrigemKey]
                    ? (comprasColetivasCache[p.compraOrigemKey].nome || p.compraOrigemKey)
                    : (p.compraOrigemKey || '');
                let origemTexto = ehDeCompra ? `🔗 Da compra: ${escapeHtml(nomeCompraOrigem)}` : `✏️ Cadastro manual`;
                let qtdFavoritos = contarFavoritosProduto(p);

                if (produtoEmEdicaoId === id) {
                    return `
                        <div class="config-panel" style="display:flex; flex-direction:row; gap:10px; align-items:flex-start;">
                            <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:56px; height:56px; object-fit:cover; border-radius:6px; background:var(--bg-body); flex-shrink:0;" onerror="this.style.visibility='hidden'">
                            <div style="flex:1; display:flex; flex-direction:column; gap:4px; min-width:0;">
                                <span style="font-size:0.65rem; color:var(--text-muted);">${origemTexto}</span>
                                <input type="text" id="edit-nome-${id}" class="config-input" value="${escapeHtml(p.nome || '')}" placeholder="Nome do item" style="font-size:0.78rem;">
                                <input type="text" id="edit-img-${id}" class="config-input" value="${escapeHtml(p.linkImagem || '')}" placeholder="Link da imagem" style="font-size:0.74rem;">
                                <input type="text" id="edit-link-${id}" class="config-input" value="${escapeHtml(p.linkSite || '')}" placeholder="Link do site" style="font-size:0.74rem;">
                                <textarea id="edit-descricao-${id}" class="config-input" placeholder="Descrição do produto (opcional — vai junto quando compartilhado)" style="font-size:0.74rem; min-height:50px; resize:vertical;">${escapeHtml(p.descricao || '')}</textarea>
                                <div style="display:flex; gap:6px;">
                                    <input type="number" step="0.01" id="edit-valor-${id}" class="config-input" value="${p.valorAprox || 0}" placeholder="Valor aprox." title="Valor aproximado" style="font-size:0.74rem;">
                                    <input type="number" step="0.01" id="edit-frete-${id}" class="config-input" value="${p.freteAprox || 0}" placeholder="Frete aprox." title="Frete aproximado por unidade" style="font-size:0.74rem;">
                                    <input type="number" step="0.01" id="edit-imposto-${id}" class="config-input" value="${p.impostoAprox || 0}" placeholder="Imposto aprox." title="Imposto aproximado por unidade" style="font-size:0.74rem;">
                                </div>
                                <div style="display:flex; gap:6px; margin-top:4px;">
                                    <button class="btn-action-primary" style="padding:4px 12px; font-size:0.74rem;" onclick="salvarEdicaoProdutoRecomendado('${escJs(id)}')">💾 Salvar</button>
                                    <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); padding:4px 12px; font-size:0.74rem; color:#fff;" onclick="cancelarEdicaoProdutoRecomendado()">✖️ Cancelar</button>
                                </div>
                            </div>
                        </div>`;
                }

                let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                return `
                    <div class="config-panel" style="display:flex; flex-direction:row; gap:10px; align-items:center;">
                        <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:6px; background:var(--bg-body); flex-shrink:0;" onerror="this.style.visibility='hidden'">
                        <div style="flex:1; min-width:0;">
                            <strong style="font-size:0.8rem; color:var(--text-title); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nome || '(sem nome)')}</strong>
                            <span style="font-size:0.68rem; color:var(--text-muted);">${origemTexto} • ~R$ ${total.toFixed(2)}${qtdFavoritos > 0 ? ` • ❤️ ${qtdFavoritos}` : ''}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px; flex-shrink:0;">
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); padding:1px 6px; font-size:0.62rem; line-height:1.3; color:#fff; ${idx === 0 ? 'opacity:0.3; cursor:default;' : 'cursor:pointer;'}" ${idx === 0 ? 'disabled' : ''} onclick="moverProdutoRecomendado('${escJs(id)}', -1)">▲</button>
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); padding:1px 6px; font-size:0.62rem; line-height:1.3; color:#fff; ${idx === ids.length - 1 ? 'opacity:0.3; cursor:default;' : 'cursor:pointer;'}" ${idx === ids.length - 1 ? 'disabled' : ''} onclick="moverProdutoRecomendado('${escJs(id)}', 1)">▼</button>
                        </div>
                        <button class="btn" style="background:rgba(37,211,102,0.15); color:#25D366; border:1px solid #25D366; padding:4px 8px; font-size:0.72rem; flex-shrink:0;" onclick="compartilharProdutoRecomendado('${escJs(id)}')">📤</button>
                        <button class="btn" style="background:rgba(58,134,255,0.15); color:#3a86ff; border:1px solid #3a86ff; padding:4px 8px; font-size:0.72rem; flex-shrink:0;" onclick="editarProdutoRecomendado('${escJs(id)}')">✏️ Editar</button>
                        <button class="btn-action-danger" style="padding:4px 8px; flex-shrink:0;" onclick="excluirProdutoRecomendado('${escJs(id)}')">🗑️</button>
                    </div>`;
            }).join('');

            corpo.innerHTML = `
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-action-primary" onclick="adicionarProdutoRecomendadoManual()">+ Adicionar Produto Manual</button>
                    <button class="btn" style="background:rgba(37,211,102,0.15); color:#25D366; border:1px solid #25D366;" onclick="compartilharVitrineProdutos()">📤 Compartilhar Lista Toda</button>
                </div>
                ${listaHtml || `<div style="color:var(--text-muted);">Nenhum produto recomendado cadastrado ainda.</div>`}
            `;
        }

        window.editarProdutoRecomendado = function(id) {
            produtoEmEdicaoId = id;
            renderizarPainelProdutosRecomendados();
        };

        window.cancelarEdicaoProdutoRecomendado = function() {
            produtoEmEdicaoId = null;
            renderizarPainelProdutosRecomendados();
        };

        window.salvarEdicaoProdutoRecomendado = async function(id) {
            if (!exigirAcessoAdmin('produtos', 'editar')) return;
            if (!db) return;
            let dados = {
                nome: document.getElementById(`edit-nome-${id}`)?.value || '',
                linkImagem: document.getElementById(`edit-img-${id}`)?.value || '',
                linkSite: document.getElementById(`edit-link-${id}`)?.value || '',
                descricao: document.getElementById(`edit-descricao-${id}`)?.value || '',
                valorAprox: parseFloat(document.getElementById(`edit-valor-${id}`)?.value) || 0,
                freteAprox: parseFloat(document.getElementById(`edit-frete-${id}`)?.value) || 0,
                impostoAprox: parseFloat(document.getElementById(`edit-imposto-${id}`)?.value) || 0
            };
            try {
                await db.ref(`produtosRecomendados/${id}`).update(dados);
                produtoEmEdicaoId = null;
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.moverProdutoRecomendado = async function(id, direcao) {
            if (!exigirAcessoAdmin('produtos', 'editar')) return;
            if (!db) return;
            let ids = listarIdsProdutosRecomendadosOrdenados();
            let idxAtual = ids.indexOf(id);
            let idxAlvo = idxAtual + direcao;
            if (idxAlvo < 0 || idxAlvo >= ids.length) return;

            let idsReordenados = [...ids];
            [idsReordenados[idxAtual], idsReordenados[idxAlvo]] = [idsReordenados[idxAlvo], idsReordenados[idxAtual]];

            let updates = {};
            idsReordenados.forEach((pid, novoIdx) => {
                updates[`produtosRecomendados/${pid}/ordem`] = novoIdx;
            });
            try {
                await db.ref().update(updates);
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.excluirProdutoRecomendado = async function(id) {
            if (!exigirAcessoAdmin('produtos', 'excluir')) return;
            if (!db) return;
            if (!confirm("Remover este produto da lista de recomendados? (isso não apaga nenhuma compra coletiva, só tira o item dessa vitrine)")) return;
            try {
                await db.ref(`produtosRecomendados/${id}`).remove();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.adicionarProdutoRecomendadoManual = async function() {
            if (!exigirAcessoAdmin('produtos', 'criar')) return;
            if (!db) return;
            let nome = prompt("Nome do produto:");
            if (!nome || !nome.trim()) return;
            let id = 'manual_' + Date.now();
            try {
                await db.ref(`produtosRecomendados/${id}`).set({
                    nome: nome.trim(),
                    linkImagem: '',
                    linkSite: '',
                    descricao: '',
                    valorAprox: 0,
                    freteAprox: 0,
                    impostoAprox: 0,
                    origem: 'manual',
                    ordem: Date.now()
                });
            } catch (err) { alert("Erro: " + err.message); }
        };

        // ===================== Compartilhamento =====================

        async function compartilharTexto(texto) {
            if (navigator.share) {
                try { await navigator.share({ text: texto }); return; }
                catch (err) { if (err && err.name === 'AbortError') return; }
            }
            if (navigator.clipboard) {
                try {
                    await navigator.clipboard.writeText(texto);
                    alert("Texto copiado! Cole (Ctrl+V) na conversa do WhatsApp.");
                    return;
                } catch (err) { /* segue pro último recurso */ }
            }
            window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
        }

        // Monta o link direto para a modal de detalhes de um produto —
        // funciona em qualquer host onde o site esteja publicado.
        function linkDetalheProduto(id) {
            return window.location.origin + window.location.pathname + '#produto=' + encodeURIComponent(id);
        }

        // Compartilha UM produto: nome, foto (link), valores (com aviso de que
        // são estimativa), descrição (se preenchida) e link que abre a MODAL
        // de detalhes aqui no site (não o site externo direto).
        window.compartilharProdutoRecomendado = async function(id) {
            let p = produtosRecomendadosCache[id];
            if (!p) return;
            let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
            let linhas = [
                `🛍️ *${p.nome || 'Produto'}*`,
                ''
            ];
            if (p.linkImagem) linhas.push(`📷 ${p.linkImagem}`, '');
            if (p.descricao && p.descricao.trim()) linhas.push(p.descricao.trim(), '');
            linhas.push(`💰 Valor aproximado: R$ ${total.toFixed(2)}`);
            linhas.push(`_(estimativa — pode variar por data, modelo e quantidade)_`);
            linhas.push('', `🔗 ${linkDetalheProduto(id)}`);
            await compartilharTexto(linhas.join('\n'));
        };

        // Compartilha a vitrine inteira (lista resumida de todos os produtos).
        window.compartilharVitrineProdutos = async function() {
            let ids = listarIdsProdutosRecomendadosPorFavoritos();
            if (ids.length === 0) { alert("Nenhum produto recomendado pra compartilhar."); return; }
            let linhas = [`🛍️ *Produtos Recomendados — CTAD*`, ''];
            ids.forEach(id => {
                let p = produtosRecomendadosCache[id];
                let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                linhas.push(`• ${p.nome || 'Produto'} — ~R$ ${total.toFixed(2)}`);
            });
            linhas.push('', `_Valores são estimativa — podem variar por data, modelo e quantidade._`);
            linhas.push('', `🔗 ${window.location.origin}${window.location.pathname}#modal=recomendados`);
            await compartilharTexto(linhas.join('\n'));
        };

        // ===================== Lista de Desejos (favoritos) =====================

        window.alternarFavoritoProduto = async function(id) {
            if (!db) return;
            if (!usuarioAtual || !pilotoVinculadoAoUsuario) {
                alert("Entre em \"Minha Conta\" (com cadastro aprovado) pra favoritar produtos.");
                return;
            }
            let p = produtosRecomendadosCache[id] || {};
            let jaFavoritado = !!(p.favoritadoPor && p.favoritadoPor[usuarioAtual.uid]);
            try {
                if (jaFavoritado) {
                    await db.ref(`produtosRecomendados/${id}/favoritadoPor/${usuarioAtual.uid}`).remove();
                } else {
                    await db.ref(`produtosRecomendados/${id}/favoritadoPor/${usuarioAtual.uid}`).set(true);
                }
            } catch (err) { alert("Erro: " + err.message); }
        };

        // Monta a seção "Minha Lista de Desejos" pra inserir dentro de "Minha Conta".
        // Sempre visível pra conta vinculada (mesmo vazia) pra que o piloto
        // consiga encontrar a vitrine e montar a própria lista.
        function renderizarListaDesejosMinhaConta() {
            if (!usuarioAtual || !pilotoVinculadoAoUsuario) return '';
            let ids = Object.keys(produtosRecomendadosCache || {}).filter(id => {
                let p = produtosRecomendadosCache[id];
                return p.favoritadoPor && p.favoritadoPor[usuarioAtual.uid];
            });

            let itensHtml = ids.length > 0 ? ids.map(id => {
                let p = produtosRecomendadosCache[id];
                let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                return `
                    <div style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px dashed var(--border-card);">
                        <div onclick="fecharModalMinhaConta(); abrirProdutoDetalhe('${escJs(id)}')" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; cursor:pointer;">
                            <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:34px; height:34px; object-fit:cover; border-radius:5px; background:var(--bg-body); flex-shrink:0;" onerror="this.style.visibility='hidden'">
                            <span style="flex:1; font-size:0.76rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nome || '')}</span>
                            <span style="font-size:0.72rem; color:var(--accent-gold); white-space:nowrap;">~R$ ${total.toFixed(2)}</span>
                        </div>
                        <button class="btn" style="background:transparent; border:none; color:var(--accent-red); font-size:0.9rem; padding:2px;" onclick="alternarFavoritoProduto('${escJs(id)}')" title="Remover da lista">❤️</button>
                    </div>`;
            }).join('') : `
                    <div style="font-size:0.75rem; color:var(--text-muted);">Nenhum produto favoritado ainda. Toque no 🤍 de um item na vitrine pra montar sua lista.</div>`;

            return `
                <div class="config-panel">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div class="config-panel-title" style="border-bottom:none; padding-bottom:0; margin:0;">❤️ Minha Lista de Desejos${ids.length > 0 ? ` <span style="font-size:0.7rem; color:var(--text-muted); font-weight:400;">(${ids.length})</span>` : ''}</div>
                        <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:3px 8px; font-size:0.7rem; flex-shrink:0;" onclick="fecharModalMinhaConta(); abrirVitrineProdutosRecomendados()">🛍️ Vitrine</button>
                    </div>
                    <div style="margin-top:4px;">${itensHtml}</div>
                </div>`;
        }

        // Card compacto do dashboard (ao lado de "Desafios Ativos"): mostra os
        // produtos mais favoritados; clicar no card abre a vitrine completa.
        function renderizarWidgetRecomendadosDashboard() {
            let container = document.getElementById('kpi-recomendados-conteudo');
            if (!container) return;

            let ids = listarIdsProdutosRecomendadosPorFavoritos();
            if (ids.length === 0) {
                container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem;">Nenhum produto recomendado no momento.</div>`;
                return;
            }

            container.innerHTML = ids.slice(0, 3).map(id => {
                let p = produtosRecomendadosCache[id] || {};
                let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                let qtdFavoritos = contarFavoritosProduto(p);
                return `
                    <div style="display:flex; align-items:center; gap:8px; background:var(--bg-input); padding:6px 10px; border-radius:6px; border:1px solid var(--border-card);">
                        <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:32px; height:32px; object-fit:cover; border-radius:5px; background:var(--bg-body); flex-shrink:0;" onerror="this.style.visibility='hidden'">
                        <span style="flex:1; font-size:0.78rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nome || '')}</span>
                        <span style="font-size:0.75rem; color:var(--accent-gold); white-space:nowrap;">~R$ ${total.toFixed(2)}</span>
                        ${qtdFavoritos > 0 ? `<span style="font-size:0.7rem; color:var(--accent-red); white-space:nowrap;">❤️${qtdFavoritos}</span>` : ''}
                    </div>`;
            }).join('') + `<div style="font-size:0.72rem; color:var(--text-muted); text-align:center; margin-top:2px;">Ver todos (${ids.length}) →</div>`;
        }

        // ===================== Detalhes do Produto =====================

        // Id do produto com a modal de detalhes aberta (null = fechada).
        // O listener de produtosRecomendados re-renderiza a modal quando os
        // dados mudam, mantendo placar de favoritos sempre certo.
        let produtoDetalheAbertoId = null;

        // Modal única de detalhes: usada pela vitrine, pelos favoritos de
        // "Minha Conta" e por links de compartilhamento (#produto=id).
        window.abrirProdutoDetalhe = function(id) {
            let modal = document.getElementById('produto-detalhe-modal');
            let corpo = document.getElementById('produto-detalhe-corpo');
            if (!modal || !corpo) return;
            produtoDetalheAbertoId = id;
            let p = produtosRecomendadosCache && produtosRecomendadosCache[id];
            if (!p) {
                corpo.innerHTML = `<div style="color:var(--text-muted);">Produto não encontrado.</div>`;
                modal.style.display = 'flex';
                return;
            }

            let valor = Number(p.valorAprox) || 0;
            let frete = Number(p.freteAprox) || 0;
            let imposto = Number(p.impostoAprox) || 0;
            let total = valor + frete + imposto;
            let qtdFavoritos = contarFavoritosProduto(p);
            let jaFavoritado = !!(usuarioAtual && p.favoritadoPor && p.favoritadoPor[usuarioAtual.uid]);

            corpo.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:100%; height:200px; object-fit:cover; border-radius:8px; background:var(--bg-body);" onerror="this.style.opacity='0.15'">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                        <strong style="font-size:0.95rem; color:var(--text-title); line-height:1.3;">${escapeHtml(p.nome || '(sem nome)')}</strong>
                        <span style="font-size:1.05rem; font-weight:700; color:var(--accent-gold); white-space:nowrap;">~R$ ${total.toFixed(2)}</span>
                    </div>
                    <div style="font-size:0.72rem; color:var(--text-muted);">
                        Valor ~R$ ${valor.toFixed(2)} • Frete ~R$ ${frete.toFixed(2)} • Imposto ~R$ ${imposto.toFixed(2)}<br>
                        (estimativas — podem variar por data, modelo e quantidade)
                    </div>
                    ${p.descricao && p.descricao.trim() ? `<div style="font-size:0.82rem; color:var(--text-main); white-space:pre-wrap; border-top:1px dashed var(--border-card); padding-top:8px;">${escapeHtml(p.descricao)}</div>` : ''}
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${p.linkSite ? `<button class="btn-action-primary" style="flex:1; min-width:160px;" onclick="window.open('${escJs(p.linkSite)}', '_blank', 'noopener')">🛍️ Acessar o site</button>` : `<span style="flex:1; min-width:160px; font-size:0.72rem; color:var(--text-muted); align-self:center;">Link do site não informado.</span>`}
                        <button class="btn" style="background:rgba(37,211,102,0.15); color:#25D366; border:1px solid #25D366;" onclick="compartilharProdutoRecomendado('${escJs(id)}')">📤 Compartilhar</button>
                        <button class="btn" style="background:transparent; border:1px solid ${jaFavoritado ? 'var(--accent-red)' : 'var(--border-card)'}; color:${jaFavoritado ? 'var(--accent-red)' : '#fff'};" onclick="alternarFavoritoProduto('${escJs(id)}')" title="${jaFavoritado ? 'Remover da lista de desejos' : 'Favoritar'}">${jaFavoritado ? '❤️' : '🤍'} ${qtdFavoritos > 0 ? qtdFavoritos : ''}</button>
                    </div>
                </div>`;
            modal.style.display = 'flex';
        };

        window.fecharProdutoDetalhe = function() {
            produtoDetalheAbertoId = null;
            let modal = document.getElementById('produto-detalhe-modal');
            if (modal) modal.style.display = 'none';
        };

        // ===================== Vitrine pública =====================

        window.abrirVitrineProdutosRecomendados = function() {
            let modal = document.getElementById('vitrine-produtos-modal');
            if (modal) modal.style.display = 'flex';
            renderizarVitrineProdutosRecomendados();
        };

        window.fecharVitrineProdutosRecomendados = function() {
            let modal = document.getElementById('vitrine-produtos-modal');
            if (modal) modal.style.display = 'none';
        };

        function renderizarVitrineProdutosRecomendados() {
            let corpo = document.getElementById('vitrine-produtos-corpo');
            if (!corpo) return;

            let ids = listarIdsProdutosRecomendadosPorFavoritos();
            if (ids.length === 0) {
                corpo.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:24px;">Nenhum produto recomendado no momento.</div>`;
                return;
            }

            corpo.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px,1fr)); gap:12px;">` +
                ids.map(id => {
                    let p = produtosRecomendadosCache[id] || {};
                    let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                    let jaFavoritado = !!(usuarioAtual && p.favoritadoPor && p.favoritadoPor[usuarioAtual.uid]);
                    let qtdFavoritos = contarFavoritosProduto(p);
                    return `
                        <div style="background:var(--bg-input); border:1px solid var(--border-card); border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:6px;">
                            <div onclick="abrirProdutoDetalhe('${escJs(id)}')" style="cursor:pointer;">
                                <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:100%; height:110px; object-fit:cover; border-radius:6px; background:var(--bg-body);" onerror="this.style.opacity='0.15'">
                                <strong style="display:block; font-size:0.78rem; color:var(--text-title); line-height:1.3; margin-top:6px;">${escapeHtml(p.nome || '')}</strong>
                            </div>
                            <span style="font-size:0.8rem; font-weight:700; color:var(--accent-gold);">~R$ ${total.toFixed(2)}</span>
                            <div style="display:flex; gap:4px;">
                                <button class="btn" style="flex:1; background:transparent; border:1px solid ${jaFavoritado ? 'var(--accent-red)' : 'var(--border-card)'}; color:${jaFavoritado ? 'var(--accent-red)' : '#fff'}; padding:4px 6px; font-size:0.68rem;" onclick="alternarFavoritoProduto('${escJs(id)}')">${jaFavoritado ? '❤️' : '🤍'} ${qtdFavoritos > 0 ? qtdFavoritos : ''}</button>
                                <button class="btn" style="background:rgba(37,211,102,0.15); color:#25D366; border:1px solid #25D366; padding:4px 8px; font-size:0.68rem;" onclick="compartilharProdutoRecomendado('${escJs(id)}')">📤</button>
                                <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:4px 8px; font-size:0.68rem;" onclick="abrirProdutoDetalhe('${escJs(id)}')" title="Ver detalhes">ℹ️</button>
                            </div>
                        </div>`;
                }).join('') + `</div>`;
        }
