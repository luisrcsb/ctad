/* CTAD - Central de Telemetria — Comentários e Curtidas
   Depende de variáveis/funções globais do script principal: 'db' (Firebase), 'escapeHtml()'. */

        window.curtirSessao = function(bateriaKey) {
            if (!db) return;
            db.ref('likes/' + bateriaKey.replace(/[.#$\/\[\]]/g, "_")).transaction(c => (c || 0) + 1);
        };

        let _listenersCurtidas = {};
        let _listenersComentarios = {};

        function escutarCurtidas(bateriaKey) {
            if (!db) return;
            let safeKey = bateriaKey.replace(/[.#$\/\[\]]/g, "_");
            let ref = db.ref('likes/' + safeKey);
            if (_listenersCurtidas[safeKey]) {
                try { ref.off('value', _listenersCurtidas[safeKey]); } catch (e) {}
            }
            let cb = snap => {
                let el = document.getElementById(`like-count-${safeKey}`);
                if (el) el.innerText = snap.val() || 0;
            };
            _listenersCurtidas[safeKey] = cb;
            ref.on('value', cb);
        }

        window.enviarComentario = function(bateriaKey) {
            if (!db) return;
            let safeKey = bateriaKey.replace(/[.#$\/\[\]]/g, "_");
            let autor = document.getElementById(`comment-name-${safeKey}`).value.trim() || "Convidado";
            let texto = document.getElementById(`comment-text-${safeKey}`).value.trim();
            if (!texto) return;
            db.ref('comments/' + safeKey).push({ autor, texto, timestamp: Date.now(), likes: 0, dislikes: 0 });
            document.getElementById(`comment-text-${safeKey}`).value = "";
        };

        window.reagirComentario = function(bateriaKey, comId, tipo) {
            if (!db) return;
            db.ref(`comments/${bateriaKey.replace(/[.#$\/\[\]]/g, "_")}/${comId}/${tipo}`).transaction(c => (c || 0) + 1);
        };

        function escutarComentarios(bateriaKey) {
            if (!db) return;
            let safeKey = bateriaKey.replace(/[.#$\/\[\]]/g, "_");

            // Escapa valor para uso dentro de atributo HTML onclick="...('...')".
            // Contexto: string JS entre aspas simples, dentro de atributo entre aspas duplas.
            function escJs(v) {
                return String(v == null ? '' : v)
                    .replace(/\\/g, '\\\\')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, "\\'")
                    .replace(/\r/g, '\\r')
                    .replace(/\n/g, '\\n');
            }

            let ref = db.ref('comments/' + safeKey);
            if (_listenersComentarios[safeKey]) {
                try { ref.off('value', _listenersComentarios[safeKey]); } catch (e) {}
            }
            let cb = snap => {
                let container = document.getElementById(`comments-list-${safeKey}`);
                if (!container) return;
                let html = '';
                if (!snap.exists()) {
                    container.innerHTML = `<div style="font-size:0.78rem; color: var(--text-muted); text-align:center;">Nenhum comentário.</div>`;
                    return;
                }
                snap.forEach(child => {
                    let c = child.val();
                    html += `
                        <div class="comment-item">
                            <div class="comment-header-row"><span class="comment-author">${escapeHtml(c.autor)}</span></div>
                            <div class="comment-text">${escapeHtml(c.texto)}</div>
                            <div class="comment-reactions">
                                <button class="btn-comment-reaction" onclick="reagirComentario('${escJs(bateriaKey)}', '${escJs(child.key)}', 'likes')">👍 (${c.likes || 0})</button>
                                <button class="btn-comment-reaction" onclick="reagirComentario('${escJs(bateriaKey)}', '${escJs(child.key)}', 'dislikes')">👎 (${c.dislikes || 0})</button>
                            </div>
                        </div>`;
                });
                container.innerHTML = html;
            };
            _listenersComentarios[safeKey] = cb;
            ref.on('value', cb);
        }

        // Limpa todos os listeners ativos ao sair da página (prevenção extra de vazamentos)
        try {
            window.addEventListener('beforeunload', function() {
                try {
                    Object.keys(_listenersCurtidas).forEach(k => {
                        let cb = _listenersCurtidas[k];
                        if (cb) db.ref('likes/' + k).off('value', cb);
                    });
                    Object.keys(_listenersComentarios).forEach(k => {
                        let cb = _listenersComentarios[k];
                        if (cb) db.ref('comments/' + k).off('value', cb);
                    });
                } catch (e) {}
            });
        } catch (e) {}

