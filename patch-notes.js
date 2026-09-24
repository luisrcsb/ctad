/* CTAD - Central de Telemetria — Patch Notes (histórico de atualizações)
   Depende de: 'escapeHtml()' (script principal). Não depende de Firebase. */

        const VERSAO_ATUAL_SISTEMA = "v5.86.2";
        const TITULO_VERSAO_ATUAL = "Tabela Geral Volta a Volta — Layout por Piloto";

        const historicoAtualizacoesDB = [
            {
                versao: "v5.86.2",
                data: "21 de Setembro de 2026",
                titulo: "Tabela Geral Volta a Volta — Layout por Piloto",
                relevante: [
                    { tipo: "novo", texto: "Tabela Geral Volta a Volta reorganizada para apresentar cada piloto em uma linha e cada volta em uma coluna." },
                    { tipo: "novo", texto: "Identificação da melhor volta de cada piloto diretamente na tabela." },
                    { tipo: "novo", texto: "Destaque em ouro para a melhor volta entre todos os pilotos da bateria." },
                    { tipo: "melhoria", texto: "Gaps e líder passaram a ser exibidos dentro de cada volta, facilitando a leitura da evolução da bateria." },
                    { tipo: "melhoria", texto: "Cabeçalho e identificação de piloto permanecem fixos durante a navegação horizontal da tabela." }
                ]
            },
            {
                versao: "v5.86.1",
                data: "19 de Setembro de 2026",
                titulo: "Seleção Inteligente de Baterias & Botão Todas",
                relevante: [
                    { tipo: "novo", texto: "Adicionado botão 'Todas' para seleção rápida de todas as baterias nos filtros." },
                    { tipo: "melhoria", texto: "Ajustada a dinâmica para selecionar automaticamente apenas a bateria mais recente no carregamento e em novos uploads." }
                ]
            },
            {
                versao: "v5.86.0",
                data: "19 de Setembro de 2026",
                titulo: "CTAD Rebranding & Pista Dinâmica (Telão 4K)",
                relevante: [
                    { tipo: "novo", texto: "Implementação do histórico de atualizações (Patch Notes) estilo Steam." },
                    { tipo: "novo", texto: "Modo Telão 4K reformulado do zero para exibição na pista com pódio dinâmico adaptativo." },
                    { tipo: "melhoria", texto: "Adição de escala de tamanho ajustável em tempo real para visualização a distância." }
                ]
            }
        ];

        window.abrirModalPatchNotes = function() {
            renderizarPatchNotesSteam();
            document.getElementById('patch-notes-modal').style.display = 'flex';
        };

        window.fecharModalPatchNotes = function() {
            document.getElementById('patch-notes-modal').style.display = 'none';
        };

        // Copia o histórico de atualizações em formato pronto para WhatsApp.
        // O texto termina com o endereço oficial do site para facilitar o acesso.
        window.copiarPatchNotesWhatsApp = async function() {
            const patches = Array.isArray(historicoAtualizacoesDB) ? historicoAtualizacoesDB : [];
            if (patches.length === 0) {
                alert('⚠️ Não há atualizações registradas para copiar.');
                return;
            }

            const linhas = [
                '🏎️ *KRATHUS RACING - CENTRAL DE TELEMETRIA*',
                '🎮 *REGISTO DE ATUALIZAÇÕES (PATCH NOTES)*',
                '',
                `📌 *Versão atual: ${VERSAO_ATUAL_SISTEMA || patches[0].versao}*`,
                ''
            ];

            patches.forEach((patch, index) => {
                linhas.push(`${index === 0 ? '🚀' : '📦'} *${patch.versao} — ${patch.titulo}*`);
                if (patch.data) linhas.push(`📅 ${patch.data}`);

                (patch.relevante || []).forEach(item => {
                    const icone = item.tipo === 'novo' ? '🆕' : item.tipo === 'correcao' ? '🛠️' : '🔧';
                    linhas.push(`${icone} ${item.texto}`);
                });
                linhas.push('');
            });

            linhas.push('━━━━━━━━━━━━━━━━━━━━');
            linhas.push('🔗 *ACESSE O SISTEMA:*');
            linhas.push('https://luisrcsb.github.io/krathus-racing/');

            const texto = linhas.join('\n').trim();

            try {
                await navigator.clipboard.writeText(texto);
                alert('✅ Atualização copiada! Agora é só colar no WhatsApp.');
            } catch (erro) {
                // Fallback para navegadores que bloqueiam a Clipboard API.
                const area = document.createElement('textarea');
                area.value = texto;
                area.style.position = 'fixed';
                area.style.left = '-9999px';
                area.style.top = '0';
                document.body.appendChild(area);
                area.focus();
                area.select();

                try {
                    document.execCommand('copy');
                    alert('✅ Atualização copiada! Agora é só colar no WhatsApp.');
                } catch (e) {
                    alert('⚠️ Não foi possível copiar automaticamente. O texto será mostrado para você copiar manualmente.');
                    window.prompt('Copie o texto abaixo:', texto);
                } finally {
                    area.remove();
                }
            }
        };

        function renderizarPatchNotesSteam() {
            let container = document.getElementById('steam-patch-lista-conteudo');
            if (!container) return;

            // A lista já é mantida da versão mais nova para a mais antiga.
            // A cópia evita qualquer alteração acidental no array original.
            const patchesOrdenados = [...historicoAtualizacoesDB];

            container.innerHTML = patchesOrdenados.map((patch, index) => {
                let isLatest = index === 0;
                let tagsHtml = patch.relevante.map(item => `
                    <li>
                        <span class="patch-tag ${item.tipo}">${item.tipo}</span>
                        <span>${escapeHtml(item.texto)}</span>
                    </li>
                `).join('');

                return `
                    <div class="steam-patch-card ${isLatest ? 'latest' : ''}">
                        <div class="steam-patch-header">
                            <div class="steam-patch-version">
                                🚀 ${escapeHtml(patch.versao)} — ${escapeHtml(patch.titulo)}
                                ${isLatest ? '<span style="font-size: 0.65rem; background: var(--accent-gold); color: #000; padding: 2px 6px; border-radius: 4px; font-weight: 700;">ATUAL</span>' : ''}
                            </div>
                            <div class="steam-patch-date">📅 ${escapeHtml(patch.data)}</div>
                        </div>
                        <ul class="steam-patch-list">
                            ${tagsHtml}
                        </ul>
                    </div>
                `;
            }).join('');
        }
