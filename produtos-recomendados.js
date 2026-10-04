/* CTAD - Central de Telemetria — Produtos Recomendados
   Depende de variáveis/funções globais do script principal:
   'db' (Firebase), 'produtosRecomendadosCache', 'comprasColetivasCache', 'escapeHtml()'.

   Cada entrada tem: { nome, linkImagem, linkSite, valorAprox, freteAprox,
   impostoAprox, origem: 'compra'|'manual', compraOrigemKey? }.

   Itens com origem 'compra' são criados/atualizados automaticamente por
   compras.js (ver sincronizarProdutosRecomendadosDaCompra) sempre que uma
   compra coletiva é salva — nome/imagem/link/valor vêm do item da compra.
   Frete e imposto são sempre preenchidos manualmente aqui, pois a compra não
   sabe o custo de frete/imposto por item individual. */

        // ===================== Painel de Administração (CRUD) =====================

        window.abrirModalProdutosRecomendados = function() {
            let modal = document.getElementById('produtos-recomendados-modal');
            if (modal) modal.style.display = 'flex';
            renderizarPainelProdutosRecomendados();
        };

        window.fecharModalProdutosRecomendados = function() {
            let modal = document.getElementById('produtos-recomendados-modal');
            if (modal) modal.style.display = 'none';
        };

        // Controla qual produto está em modo de edição no momento (só um por vez).
        let produtoEmEdicaoId = null;

        // Ordena pelo campo "ordem" (controlado pelas setas ▲▼); itens sem
        // "ordem" ainda definida (ex: recém-sincronizados de uma compra) ficam
        // no início, na ordem em que aparecem no objeto.
        function listarIdsProdutosRecomendadosOrdenados() {
            return Object.keys(produtosRecomendadosCache || {}).sort((a, b) => {
                let pa = produtosRecomendadosCache[a] || {}, pb = produtosRecomendadosCache[b] || {};
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

                // ---- Modo edição: mostra os campos + Salvar/Cancelar ----
                if (produtoEmEdicaoId === id) {
                    return `
                        <div class="config-panel" style="display:flex; flex-direction:row; gap:10px; align-items:flex-start;">
                            <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:56px; height:56px; object-fit:cover; border-radius:6px; background:var(--bg-body); flex-shrink:0;" onerror="this.style.visibility='hidden'">
                            <div style="flex:1; display:flex; flex-direction:column; gap:4px; min-width:0;">
                                <span style="font-size:0.65rem; color:var(--text-muted);">${origemTexto}</span>
                                <input type="text" id="edit-nome-${id}" class="config-input" value="${escapeHtml(p.nome || '')}" placeholder="Nome do item" style="font-size:0.78rem;">
                                <input type="text" id="edit-img-${id}" class="config-input" value="${escapeHtml(p.linkImagem || '')}" placeholder="Link da imagem" style="font-size:0.74rem;">
                                <input type="text" id="edit-link-${id}" class="config-input" value="${escapeHtml(p.linkSite || '')}" placeholder="Link do site" style="font-size:0.74rem;">
                                <div style="display:flex; gap:6px;">
                                    <input type="number" step="0.01" id="edit-valor-${id}" class="config-input" value="${p.valorAprox || 0}" placeholder="Valor aprox." title="Valor aproximado" style="font-size:0.74rem;">
                                    <input type="number" step="0.01" id="edit-frete-${id}" class="config-input" value="${p.freteAprox || 0}" placeholder="Frete aprox." title="Frete aproximado por unidade" style="font-size:0.74rem;">
                                    <input type="number" step="0.01" id="edit-imposto-${id}" class="config-input" value="${p.impostoAprox || 0}" placeholder="Imposto aprox." title="Imposto aproximado por unidade" style="font-size:0.74rem;">
                                </div>
                                <div style="display:flex; gap:6px; margin-top:4px;">
                                    <button class="btn-action-primary" style="padding:4px 12px; font-size:0.74rem;" onclick="salvarEdicaoProdutoRecomendado('${id}')">💾 Salvar</button>
                                    <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); padding:4px 12px; font-size:0.74rem;" onclick="cancelarEdicaoProdutoRecomendado()">✖️ Cancelar</button>
                                </div>
                            </div>
                        </div>`;
                }

                // ---- Modo compacto: resumo + Editar/Excluir/reordenar ----
                let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                return `
                    <div class="config-panel" style="display:flex; flex-direction:row; gap:10px; align-items:center;">
                        <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:6px; background:var(--bg-body); flex-shrink:0;" onerror="this.style.visibility='hidden'">
                        <div style="flex:1; min-width:0;">
                            <strong style="font-size:0.8rem; color:var(--text-title); display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nome || '(sem nome)')}</strong>
                            <span style="font-size:0.68rem; color:var(--text-muted);">${origemTexto} • ~R$ ${total.toFixed(2)}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px; flex-shrink:0;">
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); padding:1px 6px; font-size:0.62rem; line-height:1.3; ${idx === 0 ? 'opacity:0.3; cursor:default;' : 'cursor:pointer;'}" ${idx === 0 ? 'disabled' : ''} onclick="moverProdutoRecomendado('${id}', -1)">▲</button>
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); padding:1px 6px; font-size:0.62rem; line-height:1.3; ${idx === ids.length - 1 ? 'opacity:0.3; cursor:default;' : 'cursor:pointer;'}" ${idx === ids.length - 1 ? 'disabled' : ''} onclick="moverProdutoRecomendado('${id}', 1)">▼</button>
                        </div>
                        <button class="btn" style="background:rgba(58,134,255,0.15); color:#3a86ff; border:1px solid #3a86ff; padding:4px 8px; font-size:0.72rem; flex-shrink:0;" onclick="editarProdutoRecomendado('${id}')">✏️ Editar</button>
                        <button class="btn-action-danger" style="padding:4px 8px; flex-shrink:0;" onclick="excluirProdutoRecomendado('${id}')">🗑️</button>
                    </div>`;
            }).join('');

            corpo.innerHTML = `
                <div><button class="btn-action-primary" onclick="adicionarProdutoRecomendadoManual()">+ Adicionar Produto Manual</button></div>
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
            if (!db) return;
            let dados = {
                nome: document.getElementById(`edit-nome-${id}`)?.value || '',
                linkImagem: document.getElementById(`edit-img-${id}`)?.value || '',
                linkSite: document.getElementById(`edit-link-${id}`)?.value || '',
                valorAprox: parseFloat(document.getElementById(`edit-valor-${id}`)?.value) || 0,
                freteAprox: parseFloat(document.getElementById(`edit-frete-${id}`)?.value) || 0,
                impostoAprox: parseFloat(document.getElementById(`edit-imposto-${id}`)?.value) || 0
            };
            try {
                await db.ref(`produtosRecomendados/${id}`).update(dados);
                produtoEmEdicaoId = null;
            } catch (err) { alert("Erro: " + err.message); }
        };

        // Move um produto pra cima (-1) ou pra baixo (1) na lista, reatribuindo
        // o campo "ordem" de todo mundo de forma sequencial.
        window.moverProdutoRecomendado = async function(id, direcao) {
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

        window.atualizarCampoProdutoRecomendado = async function(id, campo, valor) {
            if (!db) return;
            try {
                await db.ref(`produtosRecomendados/${id}/${campo}`).set(valor);
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.atualizarCampoProdutoRecomendadoNum = async function(id, campo, valor) {
            await atualizarCampoProdutoRecomendado(id, campo, parseFloat(valor) || 0);
        };

        window.excluirProdutoRecomendado = async function(id) {
            if (!db) return;
            if (!confirm("Remover este produto da lista de recomendados? (isso não apaga nenhuma compra coletiva, só tira o item dessa vitrine)")) return;
            try {
                await db.ref(`produtosRecomendados/${id}`).remove();
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.adicionarProdutoRecomendadoManual = async function() {
            if (!db) return;
            let nome = prompt("Nome do produto:");
            if (!nome || !nome.trim()) return;
            let id = 'manual_' + Date.now();
            try {
                await db.ref(`produtosRecomendados/${id}`).set({
                    nome: nome.trim(),
                    linkImagem: '',
                    linkSite: '',
                    valorAprox: 0,
                    freteAprox: 0,
                    impostoAprox: 0,
                    origem: 'manual',
                    ordem: Date.now()
                });
            } catch (err) { alert("Erro: " + err.message); }
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

            let ids = listarIdsProdutosRecomendadosOrdenados();
            if (ids.length === 0) {
                corpo.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:24px;">Nenhum produto recomendado no momento.</div>`;
                return;
            }

            corpo.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px,1fr)); gap:12px;">` +
                ids.map(id => {
                    let p = produtosRecomendadosCache[id] || {};
                    let total = (Number(p.valorAprox) || 0) + (Number(p.freteAprox) || 0) + (Number(p.impostoAprox) || 0);
                    return `
                        <a href="${escapeHtml(p.linkSite || '#')}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit; background:var(--bg-input); border:1px solid var(--border-card); border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:6px; transition: transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                            <img src="${escapeHtml(p.linkImagem || '')}" alt="" style="width:100%; height:110px; object-fit:cover; border-radius:6px; background:var(--bg-body);" onerror="this.style.opacity='0.15'">
                            <strong style="font-size:0.78rem; color:var(--text-title); line-height:1.3;">${escapeHtml(p.nome || '')}</strong>
                            <span style="font-size:0.8rem; font-weight:700; color:var(--accent-gold);">~R$ ${total.toFixed(2)}</span>
                        </a>`;
                }).join('') + `</div>`;
        }
