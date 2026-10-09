/* CTAD — utils.js (Fase 2 / Fase 5 antecipada)
   Fonte única de utilitários compartilhados. Carregado ANTES dos demais
   scripts. Expõe o namespace `Utils` e, somente se ainda não existirem,
   os atalhos globais — os duplicados legados (index.html, pilotos.js,
   compras.js, tags.js, piloto-conta.js) continuam funcionando e podem
   migrar para cá gradualmente.
   - Utils.escapeHtml: & < > " ' -> entidades (igual ao index.html)
   - Utils.escJsAttr: escapa valor interpolado em string JS dentro de
     atributo onclick="..." (superset das 8 variantes legadas: escapa
     \ & < > " ' \r \n — valores decodificados idênticos em todos os casos)
   - Utils.sanitizeId: [^\w-] -> _ (igual ao compras.js)
   - Utils.debounce / Utils.memoize: helpers genéricos */

(function () {
    'use strict';

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, function (m) { return map[m]; });
    }

    function escJsAttr(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/\\/g, '\\\\')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, "\\'")
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
    }

    function sanitizeId(s) {
        if (!s) return '';
        return String(s).replace(/[^\w-]/g, '_');
    }

    function debounce(fn, wait) {
        var t = null;
        return function () {
            var ctx = this, args = arguments;
            if (t) clearTimeout(t);
            t = setTimeout(function () { t = null; fn.apply(ctx, args); }, wait || 200);
        };
    }

    function memoize(fn, keyFn) {
        var lastKey = null, lastVal, hasVal = false;
        return function () {
            var k = keyFn ? keyFn.apply(this, arguments) : JSON.stringify(Array.prototype.slice.call(arguments));
            if (hasVal && k === lastKey) return lastVal;
            lastKey = k; lastVal = fn.apply(this, arguments); hasVal = true;
            return lastVal;
        };
    }

    window.Utils = {
        escapeHtml: escapeHtml,
        escJsAttr: escJsAttr,
        escJs: escJsAttr,
        sanitizeId: sanitizeId,
        debounce: debounce,
        memoize: memoize
    };

    // Atalhos globais apenas se o legado ainda não os definiu.
    if (typeof window.escapeHtml !== 'function') window.escapeHtml = escapeHtml;
    if (typeof window.escJs !== 'function') window.escJs = escJsAttr;
    if (typeof window.sanitizeId !== 'function') window.sanitizeId = sanitizeId;

    /* ---------------------------------------------------------------
       Error boundary unificado (Fase 5)
       - Utils.toast(msg, type): aviso não-bloqueante (error|ok|info).
         Não substitui os alerts de confirmação — só erros de render.
       - Utils.guard(fn, label): embrulha abertura de modal/render com
         try/catch (+ rejection de promise): loga, exibe toast e engole
         o erro pra não quebrar o caller (ex: callback do Firebase).
       - Boot: aplica guard só em ABERTURA/RENDER (leitura). Mutação
         (salvar/excluir) continua com alert explícito de propósito. */
    function toast(msg, type) {
        try {
            var box = document.getElementById('ctad-toast-box');
            if (!box) {
                box = document.createElement('div');
                box.id = 'ctad-toast-box';
                document.body.appendChild(box);
            }
            var d = document.createElement('div');
            d.className = 'ctad-toast ctad-toast-' + (type || 'info');
            d.textContent = String(msg === null || msg === undefined ? '' : msg).slice(0, 300);
            box.appendChild(d);
            while (box.children.length > 4) {
                try { box.removeChild(box.firstChild); } catch (e) { break; }
            }
            setTimeout(function () {
                try { d.classList.add('hide'); } catch (e) {}
                setTimeout(function () { try { d.remove(); } catch (e) {} }, 400);
            }, 4200);
        } catch (e) {
            try { console.error('[ctad-toast]', msg); } catch (e2) {}
        }
    }

    function guard(fn, label) {
        var f = fn;
        return function () {
            try {
                var r = f.apply(this, arguments);
                if (r && typeof r.then === 'function') {
                    return r.catch(function (err) {
                        console.error('[ctad:' + label + ']', err);
                        toast('Erro em ' + label + ': ' + (err && err.message ? err.message : err), 'error');
                    });
                }
                return r;
            } catch (err) {
                console.error('[ctad:' + label + ']', err);
                toast('Erro em ' + label + ': ' + (err && err.message ? err.message : err), 'error');
            }
        };
    }

    window.Utils.toast = toast;
    window.Utils.guard = guard;

    var CTAD_GUARDED_OPENERS = [
        'atualizarDashboard',
        'abrirModalCampeonatos',
        'abrirDossiePiloto',
        'resumirCompraColetiva',
        'gerenciarCompraColetiva',
        'abrirModalParticipar',
        'abrirVitrineProdutosRecomendados',
        'abrirModalMinhaConta'
    ];

    function wrapModalOpeners() {
        if (!window.__ctadGuarded) window.__ctadGuarded = {};
        CTAD_GUARDED_OPENERS.forEach(function (name) {
            if (window.__ctadGuarded[name]) return;
            var fn = null;
            try { fn = window[name]; } catch (e) { fn = null; }
            if (typeof fn !== 'function') return;
            try {
                window[name] = guard(fn, name);
                window.__ctadGuarded[name] = true;
            } catch (e) {}
        });
    }

    function bootGuards() {
        try { wrapModalOpeners(); } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(bootGuards, 0); });
    } else {
        setTimeout(bootGuards, 0);
    }
    setTimeout(bootGuards, 800);
})();
