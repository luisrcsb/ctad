/* CTAD - Central de Telemetria — Patch Notes (histórico de atualizações)
   Depende de: 'escapeHtml()' (script principal). Não depende de Firebase. */

        const VERSAO_ATUAL_SISTEMA = "v5.94.0";
        const TITULO_VERSAO_ATUAL = "Notas Pessoais e Compartilhamento do Dossiê";

        const historicoAtualizacoesDB = [
            {
                versao: "v5.94.0",
                data: "05 de Outubro de 2026",
                titulo: "Notas Pessoais e Compartilhamento do Dossiê",
                relevante: [
                    { tipo: "novo", texto: "Pilotos logados podem adicionar notas pessoais e privadas em qualquer corrida do próprio histórico, direto no Dossiê." },
                    { tipo: "novo", texto: "Botão de compartilhar o resumo do Dossiê (vitórias, pódios, melhor volta) pelo WhatsApp." }
                ]
            },
            {
                versao: "v5.93.0",
                data: "04 de Outubro de 2026",
                titulo: "Contas de Piloto (Fase 1: Cadastro e Aprovação)",
                relevante: [
                    { tipo: "novo", texto: "Pilotos agora podem criar uma conta própria (\"👤 Minha Conta\") e, após aprovação do admin, acessar seu dossiê pessoal direto pelo login." },
                    { tipo: "novo", texto: "Painel administrativo \"Solicitações de Acesso\" para vincular cada cadastro novo a um piloto já existente na base." },
                    { tipo: "correcao", texto: "Reforço de segurança: a checagem de administrador agora usa uma lista real de admins (nó \"admins\" no banco), em vez de assumir que qualquer login era o admin — necessário antes de abrir cadastro público." }
                ]
            },
            {
                versao: "v5.92.0",
                data: "04 de Outubro de 2026",
                titulo: "Produtos Recomendados",
                relevante: [
                    { tipo: "novo", texto: "Catálogo de Produtos Recomendados: itens de Compras Coletivas entram automaticamente (com opção de desmarcar por item)." },
                    { tipo: "novo", texto: "Painel de administração para editar, reordenar (▲▼) e cadastrar produtos manualmente, com vitrine pública acessível pelo botão \"🛍️ Recomendados\"." }
                ]
            },
            {
                versao: "v5.91.0",
                data: "04 de Outubro de 2026",
                titulo: "Links Diretos, Compartilhamento e Atalhos Personalizados",
                relevante: [
                    { tipo: "novo", texto: "Links diretos que abrem um modal específico (ex: inscrição de campeonato ou resumo de compra) direto pela URL." },
                    { tipo: "novo", texto: "Botão de compartilhar o resumo de uma Compra Coletiva pelo WhatsApp." },
                    { tipo: "melhoria", texto: "Atalhos de rastreio agora aceitam data/hora retroativa e podem ser personalizados (ícone + texto) pelo administrador." },
                    { tipo: "melhoria", texto: "Histórico de Compras Coletivas redesenhado em linha do tempo, com seções de Chave Pix, Rastreio e Histórico de Rastreio separadas na Gestão de Compra." }
                ]
            },
            {
                versao: "v5.90.0",
                data: "03 de Outubro de 2026",
                titulo: "Sistema de Tags dos Pilotos",
                relevante: [
                    { tipo: "novo", texto: "Sistema de tags automáticas e manuais para pilotos (🏆 Mais Vitórias, ⚡ Mais Rápido, 🎯 Mais Consistente e outras 13 categorias)." },
                    { tipo: "novo", texto: "Painel de administração \"Tags dos Pilotos\" para atribuir manualmente as tags que o sistema não calcula sozinho." },
                    { tipo: "melhoria", texto: "Ícones de tags exibidos ao lado do nome do piloto na lista de filtros, com balão explicativo ao passar o mouse." }
                ]
            },
            {
                versao: "v5.89.0",
                data: "02 de Outubro de 2026",
                titulo: "Sistema de Chaves no Championship Manager",
                relevante: [
                    { tipo: "novo", texto: "Divisão automática dos pilotos inscritos em chaves quando o total ultrapassa o limite máximo configurado por chave." },
                    { tipo: "melhoria", texto: "Regra de segurança: nenhum piloto corre sozinho — se sobrar 1 piloto isolado, ele é absorvido pela chave anterior." }
                ]
            },
            {
                versao: "v5.88.0",
                data: "01 de Outubro de 2026",
                titulo: "Grid de Treino e Compartilhamento",
                relevante: [
                    { tipo: "melhoria", texto: "Grid a partir de treino agora usa as 3 melhores voltas CONSECUTIVAS de cada piloto, com tabela mostrando as voltas usadas e a média." },
                    { tipo: "correcao", texto: "Corrigido o compartilhamento de campeonato pelo WhatsApp, que exibia símbolos corrompidos em vez de emojis e acentos." }
                ]
            },
            {
                versao: "v5.87.0",
                data: "23 de Setembro de 2026",
                titulo: "Autenticação Segura e Reorganização do Sistema",
                relevante: [
                    { tipo: "novo", texto: "Login de administrador migrado para Firebase Authentication, substituindo a senha fixa anterior." },
                    { tipo: "correcao", texto: "Regras do banco de dados ajustadas para permitir inscrição pública em campeonatos sem exigir login de admin." },
                    { tipo: "melhoria", texto: "Código-fonte reorganizado em múltiplos arquivos (módulos JS + CSS separado) para facilitar manutenção futura." },
                    { tipo: "novo", texto: "Cadastro e exclusão de pilotos centralizados na Gestão de Pilotos, com proteção contra exclusão acidental." },
                    { tipo: "novo", texto: "Histórico de atualizações e atalhos de rastreio manual adicionados às Compras Coletivas." }
                ]
            },
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

        // Preenche o badge "Versão Atual" no rodapé a partir das constantes acima,
        // pra nunca mais ficar desatualizado quando a versão mudar.
        (function atualizarBadgeVersaoAtual() {
            let el = document.getElementById('badge-versao-atual');
            if (el) el.textContent = `${VERSAO_ATUAL_SISTEMA} (${TITULO_VERSAO_ATUAL})`;
        })();

        window.abrirModalPatchNotes = function() {
            renderizarPatchNotesSteam();
            document.getElementById('patch-notes-modal').style.display = 'flex';
        };

        window.fecharModalPatchNotes = function() {
            document.getElementById('patch-notes-modal').style.display = 'none';
        };

        // Copia um texto para o clipboard, com fallback para navegadores que
        // bloqueiam a Clipboard API. Usado tanto para copiar uma atualização
        // única quanto (se precisar no futuro) o histórico inteiro.
        async function copiarTextoParaClipboard(texto) {
            try {
                await navigator.clipboard.writeText(texto);
                alert('✅ Atualização copiada! Agora é só colar no WhatsApp.');
                return;
            } catch (erro) {
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
        }

        function formatarTextoUmaAtualizacao(patch) {
            const linhas = [
                '🏎️ *KRATHUS RACING - CENTRAL DE TELEMETRIA*',
                `🚀 *${patch.versao} — ${patch.titulo}*`
            ];
            if (patch.data) linhas.push(`📅 ${patch.data}`);
            linhas.push('');

            (patch.relevante || []).forEach(item => {
                const icone = item.tipo === 'novo' ? '🆕' : item.tipo === 'correcao' ? '🛠️' : '🔧';
                linhas.push(`${icone} ${item.texto}`);
            });

            linhas.push('');
            linhas.push('━━━━━━━━━━━━━━━━━━━━');
            linhas.push('🔗 *ACESSE O SISTEMA:*');
            linhas.push('https://luisrcsb.github.io/ctad/');

            return linhas.join('\n').trim();
        }

        // Copia só UMA atualização específica (botão de cada card do histórico).
        window.copiarUmaAtualizacaoWhatsApp = async function(versao) {
            const patches = Array.isArray(historicoAtualizacoesDB) ? historicoAtualizacoesDB : [];
            const patch = patches.find(p => p.versao === versao);
            if (!patch) {
                alert('⚠️ Atualização não encontrada.');
                return;
            }
            await copiarTextoParaClipboard(formatarTextoUmaAtualizacao(patch));
        };

        // Copia o histórico de atualizações inteiro em formato pronto para WhatsApp.
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
            linhas.push('https://luisrcsb.github.io/ctad/');

            await copiarTextoParaClipboard(linhas.join('\n').trim());
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
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="steam-patch-date">📅 ${escapeHtml(patch.data)}</div>
                                <button type="button" onclick="copiarUmaAtualizacaoWhatsApp('${escapeHtml(patch.versao)}')" title="Copiar esta atualização para o WhatsApp" style="border:1px solid #25D366; background:rgba(37,211,102,0.12); color:#25D366; border-radius:6px; padding:3px 8px; font-weight:700; cursor:pointer; font-size:0.68rem; white-space:nowrap;">📋 Copiar</button>
                            </div>
                        </div>
                        <ul class="steam-patch-list">
                            ${tagsHtml}
                        </ul>
                    </div>
                `;
            }).join('');
        }
