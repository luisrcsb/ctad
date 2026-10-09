/* CTAD — compras-v2.js (Fase 4)
   Melhorias de Compras Coletivas. Carregado DEPOIS do inline.
   - alternarPagoCompraRapido: toggle de pagamento via TRANSACTION no nó
     da compra (pago + histórico + status numa escrita atômica; idempotente
     por estado-desejado — retry/concorrência não duplicam).
   - qrFallback: degradação graciosa do QR externo (api.qrserver) quando
     offline/bloqueado — o botão Copiar continua funcionando.
   - obterLimiteHistoricoCompra: limite do timeline configurável em
     configuracoesGlobais/comprasHistoricoLimite (seed 30, teto 500).
   NOTA: `db`, `comprasColetivasCache`, `compraResumoAtualKey` são `let` no
   inline — referência lexical direta, nunca window.X. */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Limite do histórico (4.7)
    // ---------------------------------------------------------------
    window.obterLimiteHistoricoCompra = function () {
        var v = parseInt(window.comprasHistoricoLimiteCache, 10);
        return (v > 0 && v <= 500) ? v : 30;
    };

    async function semearLimiteHistorico() {
        if (typeof db === 'undefined' || !db) return;
        try {
            var ref = db.ref('configuracoesGlobais/comprasHistoricoLimite');
            var snap = await ref.once('value');
            if (!snap.exists()) {
                var pode = true;
                try { pode = typeof hasPerm !== 'function' || hasPerm('config', 'editar') || hasPerm('compras', 'gerenciar'); } catch (e) {}
                if (pode) { try { await ref.set(30); } catch (e) {} }
                window.comprasHistoricoLimiteCache = 30;
            } else {
                window.comprasHistoricoLimiteCache = snap.val();
            }
        } catch (e) {}
    }

    // ---------------------------------------------------------------
    // Pagamento atômico via transação (4.3)
    // ---------------------------------------------------------------
    window.alternarPagoCompraRapido = async function (compraKey, pKey) {
        if (typeof exigirAcessoAdmin === 'function' && !exigirAcessoAdmin('compras', 'editar')) return;
        if (typeof db === 'undefined' || !db) return;
        var atual = null;
        try {
            var cached = (typeof comprasColetivasCache !== 'undefined' && comprasColetivasCache[compraKey]) || null;
            atual = cached && cached.participantes && cached.participantes[pKey] ? !!cached.participantes[pKey].pago : null;
        } catch (e) {}
        if (atual === null) return;
        var desejado = !atual;

        try {
            var res = await db.ref('comprasColetivas/' + compraKey).transaction(function (comp) {
                if (!comp) return; // abort: compra sumiu
                if (!comp.participantes || !comp.participantes[pKey]) return; // abort
                if (!!comp.participantes[pKey].pago === desejado) return; // abort: já aplicado
                comp.participantes[pKey].pago = desejado;
                var nome = comp.participantes[pKey].nome || pKey;
                if (typeof registrarHistoricoCompra === 'function') {
                    registrarHistoricoCompra(comp, 'pagamento',
                        desejado ? ('💰 Pagamento confirmado: ' + nome) : ('↩️ Pagamento desfeito: ' + nome));
                } else {
                    comp.ultimaAtualizacao = Date.now();
                }
                var ativos = Object.values(comp.participantes).filter(function (p) { return p && p.ativo; });
                var quitada = ativos.length > 0 && ativos.filter(function (p) { return p.pago; }).length === ativos.length;
                if (quitada && comp.entregue) comp.status = 'FINALIZADA / CONCLUÍDA';
                else if (comp.entregue) comp.status = 'ENTREGUE';
                else if (quitada) comp.status = 'QUITADA';
                else comp.status = 'EM ANDAMENTO / PENDENTE';
                return comp;
            });
            if (res && res.committed && res.snapshot) {
                try { comprasColetivasCache[compraKey] = res.snapshot.val(); } catch (e) {}
                try {
                    if (typeof compraResumoAtualKey !== 'undefined' && compraResumoAtualKey === compraKey &&
                        typeof resumirCompraColetiva === 'function') resumirCompraColetiva(compraKey);
                } catch (e) {}
                try { if (typeof renderizarModalComprasColetivas === 'function') renderizarModalComprasColetivas(); } catch (e) {}
            }
        } catch (err) { alert('Erro: ' + err.message); }
    };

    // ---------------------------------------------------------------
    // QR fallback (4.6)
    // ---------------------------------------------------------------
    window.qrFallback = function (img) {
        if (!img || (img.dataset && img.dataset.qrFallbackDone)) return;
        try { img.dataset.qrFallbackDone = '1'; } catch (e) {}
        var box = img.parentNode;
        if (box) {
            box.innerHTML = '<div style="font-size: 0.65rem; color: var(--text-muted); text-align: center; padding: 6px;">QR indisponível<br>offline — use Copiar</div>';
        }
    };

    setTimeout(function () { try { semearLimiteHistorico(); } catch (e) {} }, 1500);
})();
