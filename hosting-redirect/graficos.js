/* CTAD - Central de Telemetria — funções de renderização dos gráficos (Chart.js)
   Depende de: variável global 'chartInstances' (declarada no script principal),
   biblioteca Chart.js (carregada via <script> antes deste arquivo). */

        function renderizarGraficoRitmoPersonalizado(canvasId, ordenados) {
            let canvasEl = document.getElementById(canvasId);
            if (!canvasEl) return;
            let maxVoltas = Math.max(...ordenados.map(p => p.laps ? p.laps.length : 0));
            let labels = Array.from({ length: maxVoltas }, (_, i) => `Volta ${i + 1}`);

            let datasets = ordenados.map((p, idx) => {
                let cor = ["#2ec4b6", "#ffb703", "#e63946", "#3a86ff", "#ff006e", "#8338ec"][idx % 6];
                return {
                    label: p.piloto,
                    data: Array.from({ length: maxVoltas }, (_, i) => { let l = p.laps ? p.laps[i] : null; return l ? (typeof l === 'object' ? l.tempo : l) : null; }),
                    borderColor: cor, backgroundColor: cor, borderWidth: 3, tension: 0.1, spanGaps: true
                };
            });

            chartInstances.push(new Chart(canvasEl.getContext('2d'), {
                type: 'line', data: { labels, datasets },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#d0d7e3', font: { size: 14 } } } } }
            }));
        }

        function renderizarGraficoPosicaoPersonalizado(canvasId, ordenados) {
            let canvasEl = document.getElementById(canvasId);
            if (!canvasEl) return;
            let maxVoltas = Math.max(...ordenados.map(p => p.laps ? p.laps.length : 0));
            let labels = Array.from({ length: maxVoltas }, (_, i) => `Volta ${i + 1}`);

            let datasets = ordenados.map((p, idx) => {
                let cor = ["#2ec4b6", "#ffb703", "#e63946", "#3a86ff", "#ff006e", "#8338ec"][idx % 6];
                let posicoesVolta = [];
                for (let v = 0; v < maxVoltas; v++) {
                    let mapaVoltaPilotos = [];
                    ordenados.forEach(pilotoObj => {
                        let somaTemp = 0, valido = true;
                        for (let j = 0; j <= v; j++) {
                            let l = pilotoObj.laps ? pilotoObj.laps[j] : null;
                            if (l === undefined || l === null || l <= 0) { valido = false; break; }
                            somaTemp += (typeof l === 'object' ? l.tempo : l);
                        }
                        if (valido) mapaVoltaPilotos.push({ piloto: pilotoObj.piloto, tempoTotal: somaTemp, voltasCompletas: v + 1 });
                    });
                    mapaVoltaPilotos.sort((a, b) => a.voltasCompletas !== b.voltasCompletas ? b.voltasCompletas - a.voltasCompletas : a.tempoTotal - b.tempoTotal);
                    let pos = mapaVoltaPilotos.findIndex(item => item.piloto === p.piloto);
                    posicoesVolta.push(pos !== -1 ? pos + 1 : null);
                }
                return { label: p.piloto, data: posicoesVolta, borderColor: cor, backgroundColor: cor, borderWidth: 3, tension: 0.1, spanGaps: true };
            });

            chartInstances.push(new Chart(canvasEl.getContext('2d'), {
                type: 'line', data: { labels, datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#d0d7e3', font: { size: 14 } } } },
                    scales: { y: { reverse: true, min: 1, ticks: { stepSize: 1, font: { size: 14 } } }, x: { ticks: { font: { size: 14 } } } }
                }
            }));
        }

        /* ============================================================
           Impressão / PDF: as cores acima são feitas pro fundo escuro
           (legenda cinza-clara, etc). No momento de imprimir (beforeprint)
           os gráficos abertos são repintados com uma paleta escura mais
           forte, legível no papel branco, e voltam ao visual da tela
           sozinhos depois de imprimir (afterprint).
           ============================================================ */
        const PALETA_SERIE_TELA = ["#2ec4b6", "#ffb703", "#e63946", "#3a86ff", "#ff006e", "#8338ec"];
        const PALETA_SERIE_IMPRESSAO = ["#0f7c74", "#a87400", "#c1121f", "#1c5cd6", "#c2185b", "#5e35b1"];

        function repintarChartsParaImpressao(impressao) {
            if (typeof chartInstances === 'undefined' || !chartInstances) return;
            chartInstances.forEach(chart => {
                if (!chart || !chart.data || !chart.data.datasets) return;
                // Guarda as cores originais da tela na primeira repintagem
                if (!chart.__coresOriginais) {
                    chart.__coresOriginais = {
                        datasets: chart.data.datasets.map(ds => ({ b: ds.borderColor, bg: ds.backgroundColor })),
                        legenda: (chart.options && chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) ? chart.options.plugins.legend.labels.color : undefined,
                        escalas: {}
                    };
                    const esc0 = (chart.options && chart.options.scales) || {};
                    Object.keys(esc0).forEach(k => {
                        chart.__coresOriginais.escalas[k] = {
                            ticks: (esc0[k].ticks && esc0[k].ticks.color) || undefined,
                            grid: (esc0[k].grid && esc0[k].grid.color) || undefined
                        };
                    });
                }
                const orig = chart.__coresOriginais;
                const series = impressao ? PALETA_SERIE_IMPRESSAO : PALETA_SERIE_TELA;
                chart.data.datasets.forEach((ds, i) => {
                    const corTela = (orig.datasets[i] && orig.datasets[i].b) || series[i % series.length];
                    const cor = impressao ? series[i % series.length] : corTela;
                    ds.borderColor = cor;
                    ds.backgroundColor = impressao ? cor : ((orig.datasets[i] && orig.datasets[i].bg) || cor);
                });
                if (chart.options && chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
                    chart.options.plugins.legend.labels.color = impressao ? '#111111' : orig.legenda;
                }
                const esc = (chart.options && chart.options.scales) || {};
                Object.keys(esc).forEach(k => {
                    if (!esc[k].ticks) esc[k].ticks = {};
                    if (!esc[k].grid) esc[k].grid = {};
                    esc[k].ticks.color = impressao ? '#333333' : orig.escalas[k].ticks;
                    esc[k].grid.color = impressao ? 'rgba(0,0,0,0.15)' : orig.escalas[k].grid;
                });
                chart.update('none');
            });
        }

        window.addEventListener('beforeprint', function () { try { repintarChartsParaImpressao(true); } catch (e) { } });
        window.addEventListener('afterprint', function () { try { repintarChartsParaImpressao(false); } catch (e) { } });
