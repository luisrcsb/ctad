/* CTAD - Central de Telemetria — Conta do Piloto (Fase 1: cadastro + aprovação)
   Depende de variáveis/funções globais do script principal:
   'db', 'auth' (Firebase), 'escapeHtml()', 'isAdminLogado', 'usuarioAtual',
   'pilotoVinculadoAoUsuario', 'solicitacoesCadastroCache', 'pilotosMetadadosCache',
   'obterTodosDadosConsolidados()', 'abrirDossiePiloto()'.

   Modelo de dados:
   - solicitacoesCadastro/{uid} = { email, nomeSolicitado, status: 'pendente'|'aprovado'|'rejeitado', criadoEm }
   - usuariosPilotos/{uid} = { piloto: "Nome Exato do Piloto", vinculadoEm }
   - admins/{uid} = true (gerenciado só manualmente pelo console do Firebase) */

        // ===================== Modal "Minha Conta" (público) =====================

        window.abrirModalMinhaConta = function() {
            let modal = document.getElementById('minha-conta-modal');
            if (modal) modal.style.display = 'flex';
            atualizarUiContaPiloto();
        };

        window.fecharModalMinhaConta = function() {
            let modal = document.getElementById('minha-conta-modal');
            if (modal) modal.style.display = 'none';
        };

        // Redesenha o conteúdo do modal conforme o estado: deslogado, logado e
        // aprovado, logado e aguardando aprovação, ou logado como admin.
        function atualizarUiContaPiloto() {
            let corpo = document.getElementById('minha-conta-corpo');
            if (!corpo) return;

            if (!usuarioAtual) {
                corpo.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:14px;">
                        <div class="config-panel">
                            <div class="config-panel-title">Já tenho conta</div>
                            <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                                <input type="email" id="conta-login-email" class="config-input" placeholder="E-mail">
                                <input type="password" id="conta-login-senha" class="config-input" placeholder="Senha">
                                <button class="btn-action-primary" onclick="fazerLoginPiloto()">Entrar</button>
                            </div>
                        </div>
                        <div class="config-panel">
                            <div class="config-panel-title">Ainda não tenho conta</div>
                            <p style="font-size:0.72rem; color:var(--text-muted); margin:2px 0 6px;">Depois de se cadastrar, o administrador precisa vincular sua conta a um piloto já existente na base antes de você ver seu painel pessoal.</p>
                            <div style="display:flex; flex-direction:column; gap:6px;">
                                <input type="text" id="conta-cadastro-nome" class="config-input" placeholder="Seu nome (como é conhecido nas corridas)">
                                <input type="email" id="conta-cadastro-email" class="config-input" placeholder="E-mail">
                                <input type="password" id="conta-cadastro-senha" class="config-input" placeholder="Crie uma senha (mín. 6 caracteres)">
                                <button class="btn-action-primary" style="background:#2ec4b6; color:#000;" onclick="cadastrarPiloto()">Cadastrar</button>
                            </div>
                        </div>
                        ${renderizarSecaoAcessibilidadeMinhaConta()}
                    </div>`;
                return;
            }

            if (isAdminLogado) {
                corpo.innerHTML = `
                    ${renderizarLinhaContaLogada('🔐 Logado como administrador', usuarioAtual.email)}
                    ${renderizarSecaoAcessibilidadeMinhaConta()}`;
                return;
            }

            if (pilotoVinculadoAoUsuario) {
                let secaoDesafios = typeof renderizarSecaoDesafiosMinhaConta === 'function' ? renderizarSecaoDesafiosMinhaConta() : '';
                let secaoDesejos = typeof renderizarListaDesejosMinhaConta === 'function' ? renderizarListaDesejosMinhaConta() : '';
                corpo.innerHTML = `
                    ${renderizarLinhaContaLogada(`👋 Bem-vindo, <strong>${escapeHtml(pilotoVinculadoAoUsuario)}</strong>!`, usuarioAtual.email)}
                    <div style="display:flex; gap:8px; margin-top:12px; margin-bottom: 14px;">
                        <button class="btn-action-primary" onclick="fecharModalMinhaConta(); abrirDossiePiloto('${escapeHtml(pilotoVinculadoAoUsuario)}')">📊 Ver Meu Dossiê</button>
                    </div>
                    ${secaoDesejos}
                    ${secaoDesafios}
                    ${renderizarSecaoAcessibilidadeMinhaConta()}`;
                return;
            }

            corpo.innerHTML = `
                ${renderizarLinhaContaLogada('✅ Cadastro recebido', usuarioAtual.email)}
                <div style="color:var(--text-muted); font-size:0.82rem; margin-top:8px;">
                    Assim que o administrador vincular sua conta a um piloto, seu painel pessoal aparece aqui.
                </div>
                ${renderizarSecaoAcessibilidadeMinhaConta()}`;
        }

        // Linha de topo da conta logada: texto + e-mail à esquerda e o botão
        // "Deslogar" à direita, ao lado do e-mail.
        function renderizarLinhaContaLogada(tituloHtml, email) {
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="min-width:0;">
                        <div style="font-size:0.9rem; color:var(--text-title);">${tituloHtml}</div>
                        <div style="font-size:0.74rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(email || '')}</div>
                    </div>
                    <button class="btn-action-danger" style="flex-shrink:0;" onclick="logoutContaPiloto()">Deslogar</button>
                </div>`;
        }

        // Seção de acessibilidade embutida em "Minha Conta" — abre o modal de
        // acessibilidade já existente (alto contraste, filtros de daltonismo).
        // Disponível em qualquer estado de login, já que é uma preferência do
        // navegador/visitante, não do piloto.
        function renderizarSecaoAcessibilidadeMinhaConta() {
            return `
                <div class="config-panel" style="margin-top:14px;">
                    <div class="config-panel-title">♿ Acessibilidade</div>
                    <p style="font-size:0.72rem; color:var(--text-muted); margin:2px 0 6px;">Alto contraste e filtros de daltonismo.</p>
                    <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff;" onclick="abrirModalAcessibilidade()">♿ Abrir Configurações de Acessibilidade</button>
                </div>`;
        }

        window.fazerLoginPiloto = async function() {
            if (!auth) { alert("❌ Autenticação indisponível no momento."); return; }
            let email = document.getElementById('conta-login-email')?.value.trim();
            let senha = document.getElementById('conta-login-senha')?.value;
            if (!email || !senha) { alert("Preencha e-mail e senha."); return; }
            try {
                await auth.signInWithEmailAndPassword(email, senha);
                atualizarUiContaPiloto();
            } catch (err) {
                alert("❌ E-mail ou senha incorretos.");
            }
        };

        window.cadastrarPiloto = async function() {
            if (!auth || !db) { alert("❌ Autenticação indisponível no momento."); return; }
            let nome = document.getElementById('conta-cadastro-nome')?.value.trim();
            let email = document.getElementById('conta-cadastro-email')?.value.trim();
            let senha = document.getElementById('conta-cadastro-senha')?.value;
            if (!nome || !email || !senha) { alert("Preencha todos os campos."); return; }
            if (senha.length < 6) { alert("A senha precisa ter pelo menos 6 caracteres."); return; }

            try {
                let cred = await auth.createUserWithEmailAndPassword(email, senha);
                await db.ref(`solicitacoesCadastro/${cred.user.uid}`).set({
                    email: email,
                    nomeSolicitado: nome,
                    status: 'pendente',
                    criadoEm: Date.now()
                });
                atualizarUiContaPiloto();
            } catch (err) {
                if (err.code === 'auth/email-already-in-use') alert("❌ Esse e-mail já tem cadastro. Tente entrar em vez de cadastrar.");
                else alert("❌ Erro ao cadastrar: " + err.message);
            }
        };

        window.logoutContaPiloto = function() {
            if (auth) auth.signOut();
            fecharModalMinhaConta();
        };

        // ===================== Painel Admin: Solicitações de Acesso =====================

        window.abrirModalSolicitacoesCadastro = function() {
            let modal = document.getElementById('solicitacoes-cadastro-modal');
            if (modal) modal.style.display = 'flex';
            renderizarPainelSolicitacoesCadastro();
        };

        window.fecharModalSolicitacoesCadastro = function() {
            let modal = document.getElementById('solicitacoes-cadastro-modal');
            if (modal) modal.style.display = 'none';
        };

        function renderizarPainelSolicitacoesCadastro() {
            let corpo = document.getElementById('solicitacoes-cadastro-corpo');
            if (!corpo) return;

            let ids = Object.keys(solicitacoesCadastroCache || {}).sort((a, b) =>
                (solicitacoesCadastroCache[b]?.criadoEm || 0) - (solicitacoesCadastroCache[a]?.criadoEm || 0)
            );

            // Monta a lista de pilotos já conhecidos (cadastrados ou que já correram)
            // pra popular o select de vínculo.
            let nomesSet = new Set(Object.keys(pilotosMetadadosCache || {}));
            (typeof obterTodosDadosConsolidados === 'function' ? obterTodosDadosConsolidados() : []).forEach(d => nomesSet.add(d.piloto));
            let nomesPilotos = Array.from(nomesSet).filter(n => n && n.trim()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            let optionsPilotos = `<option value="">Selecione o piloto...</option>` + nomesPilotos.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

            let listaHtml = ids.map(uid => {
                let s = solicitacoesCadastroCache[uid] || {};
                let corStatus = s.status === 'aprovado' ? 'var(--accent-green)' : s.status === 'rejeitado' ? 'var(--accent-red)' : 'var(--accent-gold)';
                let dataFormatada = s.criadoEm ? new Date(s.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

                let acoesHtml = s.status === 'pendente' ? `
                    <div style="display:flex; gap:6px; margin-top:6px;">
                        <select id="select-vincular-${uid}" class="config-select" style="font-size:0.75rem; flex:1;">${optionsPilotos}</select>
                        <button class="btn-action-primary" style="padding:4px 10px; font-size:0.74rem;" onclick="aprovarSolicitacaoCadastro('${uid}')">✅ Vincular</button>
                        <button class="btn-action-danger" style="padding:4px 10px; font-size:0.74rem;" onclick="rejeitarSolicitacaoCadastro('${uid}')">❌ Rejeitar</button>
                    </div>` : '';

                return `
                    <div class="config-panel">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:0.85rem; color:var(--text-title);">${escapeHtml(s.nomeSolicitado || '(sem nome)')}</strong>
                            <span style="font-size:0.68rem; font-weight:700; color:${corStatus};">${(s.status || 'pendente').toUpperCase()}</span>
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(s.email || '')} • ${dataFormatada}</div>
                        ${acoesHtml}
                    </div>`;
            }).join('');

            corpo.innerHTML = listaHtml || `<div style="color:var(--text-muted);">Nenhuma solicitação de cadastro ainda.</div>`;
        }

        window.aprovarSolicitacaoCadastro = async function(uid) {
            if (!db) return;
            let select = document.getElementById(`select-vincular-${uid}`);
            let piloto = select ? select.value : '';
            if (!piloto) { alert("Selecione um piloto pra vincular antes de aprovar."); return; }
            try {
                await db.ref(`usuariosPilotos/${uid}`).set({ piloto: piloto, vinculadoEm: Date.now() });
                await db.ref(`solicitacoesCadastro/${uid}/status`).set('aprovado');
                alert(`Conta vinculada a "${piloto}"!`);
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.rejeitarSolicitacaoCadastro = async function(uid) {
            if (!db) return;
            if (!confirm("Rejeitar esta solicitação de cadastro?")) return;
            try {
                await db.ref(`solicitacoesCadastro/${uid}/status`).set('rejeitado');
            } catch (err) { alert("Erro: " + err.message); }
        };
