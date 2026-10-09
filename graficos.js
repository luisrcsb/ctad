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
