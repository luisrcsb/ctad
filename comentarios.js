/* CTAD - Central de Telemetria — Comentários e Curtidas
   Depende de variáveis/funções globais do script principal: 'db' (Firebase), 'escapeHtml()'. */

        window.curtirSessao = function(bateriaKey) {
            if (!db) return;
            db.ref('likes/' + bateriaKey.replace(/[.#$\/\[\]]/g, "_")).transaction(c => (c || 0) + 1);
        };

        function escutarCurtidas(bateriaKey) {
            if (!db) return;
            let safeKey = bateriaKey.replace(/[.#$\/\[\]]/g, "_");
            db.ref('likes/' + safeKey).on('value', snap => {
                let el = document.getElementById(`like-count-${safeKey}`);
                if (el) el.innerText = snap.val() || 0;
            });
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
            let container = document.getElementById(`comments-list-${safeKey}`);
            db.ref('comments/' + safeKey).on('value', snap => {
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
                                <button class="btn-comment-reaction" onclick="reagirComentario('${bateriaKey}', '${child.key}', 'likes')">👍 (${c.likes || 0})</button>
                                <button class="btn-comment-reaction" onclick="reagirComentario('${bateriaKey}', '${child.key}', 'dislikes')">👎 (${c.dislikes || 0})</button>
                            </div>
                        </div>`;
                });
                container.innerHTML = html;
            });
        }

