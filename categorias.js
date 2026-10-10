/* CTAD — categorias.js
   Categorias de competição (ex: WLToys 1:28 4x4, Mini-Z, Livre).
   - Registro global em `categorias/{id} {nome, descricao, ativa}`.
   - Usado em: carros dos pilotos (sugestão), campeonatos (campo oficial + filtro).
   - Leitura pública; escrita só admin (rules).
*/
(function () {
    'use strict';

    window.categoriasCache = window.categoriasCache || {};

    var CATEGORIAS_PADRAO = [
        { id: 'wltoys-128-4x4', nome: 'WLToys 1:28 4x4', descricao: 'WLToys escala 1:28 tração 4x4' },
        { id: 'mini-z', nome: 'Mini-Z', descricao: 'Kyosho Mini-Z' },
        { id: 'livre', nome: 'Livre', descricao: 'Categoria aberta' }
    ];

    function getDb() {
        try { if (typeof db !== 'undefined' && db) return db; } catch (e) {}
        try { if (window.firebase) return window.firebase.database(); } catch (e) {}
        return null;
    }

    function esc(s) {
        if (typeof escapeHtml === 'function') { try { return escapeHtml(s); } catch (e) {} }
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    window.listaCategorias = function () {
        var todas = Object.keys(window.categoriasCache || {}).map(function (id) {
            var c = window.categoriasCache[id] || {};
            return { id: id, nome: c.nome || id, descricao: c.descricao || '', ativa: c.ativa !== false };
        }).filter(function (c) { return c.ativa; });
        todas.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
        return todas;
    };

    window.nomeCategoria = function (id) {
        if (!id) return '';
        var c = (window.categoriasCache || {})[id];
        return (c && c.nome) || id;
    };

    window.opcoesCategoriaHtml = function (selecionada) {
        var cats = window.listaCategorias();
        var html = '<option value="">Livre / sem categoria</option>' + cats.map(function (c) {
            return '<option value="' + esc(c.id) + '"' + (c.id === selecionada ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
        }).join('');
        return html;
    };

    window.datalistCategoriasHtml = function (listId) {
        var cats = window.listaCategorias();
        return '<datalist id="' + esc(listId || 'datalist-categorias') + '">' +
            cats.map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join('') + '</datalist>';
    };

    window.iniciarListenerCategorias = function () {
        var database = getDb();
        if (!database || window.__categoriasListenerOn) return;
        window.__categoriasListenerOn = true;
        try {
            database.ref('categorias').on('value', function (snap) {
                window.categoriasCache = snap.val() || {};
                if (typeof window.renderizarSecaoCategorias === 'function') window.renderizarSecaoCategorias();
                try { var dl = document.getElementById('datalist-categorias-carro'); if (!dl) { dl = document.createElement('span'); dl.id = 'datalist-categorias-carro-host'; dl.style.display = 'none'; document.body.appendChild(dl); } dl.innerHTML = window.datalistCategoriasHtml('datalist-categorias-carro'); } catch (e) {}
                if (typeof renderizarListaCampeonatosModal === 'function') { try { renderizarListaCampeonatosModal(); } catch (e) {} }
                if (typeof atualizarDashboard === 'function') { try { atualizarDashboard(); } catch (e) {} }
                if (typeof window.atualizarSelectsCategoria === 'function') window.atualizarSelectsCategoria();
            });
        } catch (e) {}
    };

    // Preenche os selects de categoria já renderizados (campeonato) sem recarregar a página.
    window.atualizarSelectsCategoria = function () {
        try {
            var sel = document.getElementById('zround-categoria');
            if (sel) {
                var atual = sel.value;
                sel.innerHTML = window.opcoesCategoriaHtml(atual);
            }
        } catch (e) {}
    };

    window.renderizarSecaoCategorias = function () {
        var host = document.getElementById('categorias-gerais-corpo');
        if (!host) return;
        var cats = window.listaCategorias();
        var todasIds = Object.keys(window.categoriasCache || {});
        var inativas = todasIds.filter(function (id) { return (window.categoriasCache[id] || {}).ativa === false; });
        var linhas = cats.map(function (c) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-bottom:1px dashed var(--border-card);">' +
                '<div style="min-width:0;"><strong style="font-size:0.82rem;">' + esc(c.nome) + '</strong>' +
                (c.descricao ? '<div style="font-size:0.7rem;color:var(--text-muted);">' + esc(c.descricao) + '</div>' : '') + '</div>' +
                '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                '<button class="btn-text-action" style="font-size:0.7rem;" onclick="editarCategoria(\'' + esc(c.id).replace(/'/g, "\\'") + '\')">Editar</button>' +
                '<button class="btn-text-action" style="color:var(--accent-red);font-size:0.7rem;" onclick="excluirCategoria(\'' + esc(c.id).replace(/'/g, "\\'") + '\')">Excluir</button>' +
                '</div></div>';
        }).join('') || '<div style="color:var(--text-muted);font-size:0.78rem;">Nenhuma categoria. Crie abaixo ou use o pacote padrão.</div>';
        host.innerHTML =
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<input type="text" id="input-nova-categoria-nome" class="config-input" placeholder="Nome (ex: Mini-Z)" style="flex:2;min-width:140px;">' +
            '<input type="text" id="input-nova-categoria-desc" class="config-input" placeholder="Descrição (opcional)" style="flex:2;min-width:140px;">' +
            '<button class="btn-action-primary" style="background:#2ec4b6;color:#000;font-weight:700;" onclick="criarCategoria()">Criar</button>' +
            '<button class="btn" style="background:transparent;border:1px dashed var(--border-card);" onclick="popularCategoriasPadrao()">Pacote padrão</button>' +
            '</div>' + linhas +
            (inativas.length ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;">' + inativas.length + ' desativada(s) (excluídas, mantidas para histórico).</div>' : '');
    };

    function slugCategoria(nome) {
        return String(nome || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('cat-' + Date.now());
    }

    function exigeAdminCat() {
        if (typeof exigirAcessoAdmin === 'function') return exigirAcessoAdmin('pilotos', 'gerenciar');
        if (typeof hasPerm === 'function') return hasPerm('pilotos', 'gerenciar');
        return true;
    }

    window.criarCategoria = async function () {
        if (!exigeAdminCat()) return;
        var database = getDb();
        if (!database) return;
        var nome = (document.getElementById('input-nova-categoria-nome')?.value || '').trim();
        var desc = (document.getElementById('input-nova-categoria-desc')?.value || '').trim();
        if (!nome) { alert('Digite o nome da categoria.'); return; }
        var id = slugCategoria(nome);
        var snap = await database.ref('categorias/' + id).once('value');
        if (snap.exists() && (snap.val() || {}).ativa !== false) { alert('Categoria já existe.'); return; }
        await database.ref('categorias/' + id).set({ nome: nome, descricao: desc, ativa: true, criadoEm: Date.now() });
        window.renderizarSecaoCategorias();
    };

    window.editarCategoria = async function (id) {
        if (!exigeAdminCat()) return;
        var database = getDb();
        if (!database) return;
        var atual = (window.categoriasCache || {})[id] || {};
        var nome = prompt('Nome da categoria:', atual.nome || '');
        if (nome === null) return;
        nome = nome.trim();
        if (!nome) return;
        var desc = prompt('Descrição (opcional):', atual.descricao || '');
        if (desc === null) desc = atual.descricao || '';
        await database.ref('categorias/' + id).update({ nome: nome, descricao: String(desc).trim() });
        window.renderizarSecaoCategorias();
    };

    window.excluirCategoria = async function (id) {
        if (!exigeAdminCat()) return;
        var database = getDb();
        if (!database) return;
        if (!confirm('Desativar a categoria "' + window.nomeCategoria(id) + '"? (campeonatos antigos mantêm o nome)')) return;
        await database.ref('categorias/' + id).update({ ativa: false });
        window.renderizarSecaoCategorias();
    };

    window.popularCategoriasPadrao = async function () {
        if (!exigeAdminCat()) return;
        var database = getDb();
        if (!database) return;
        for (var i = 0; i < CATEGORIAS_PADRAO.length; i++) {
            var c = CATEGORIAS_PADRAO[i];
            var snap = await database.ref('categorias/' + c.id).once('value');
            if (!snap.exists()) {
                await database.ref('categorias/' + c.id).set({ nome: c.nome, descricao: c.descricao, ativa: true, criadoEm: Date.now() });
            }
        }
        window.renderizarSecaoCategorias();
    };

    function boot() { try { window.iniciarListenerCategorias(); } catch (e) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    setTimeout(boot, 2000);
})();
