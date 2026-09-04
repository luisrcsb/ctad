import { listaJsonsCache, pilotosMetadadosCache, mesclagensCache, ALIAS_EDGARD_DJ_DEFAULTS } from './state.js';

export function formatarNomeSessao(sessaoStr) {
    if (!sessaoStr) return "Bateria";
    let match = sessaoStr.match(/(\d{2})[-/](\d{2})[-/](\d{2}).*?\((\d+)\)/);
    if (match) {
        let dia = match[1], mes = match[2], anoCompleto = "20" + match[3];
        let numBateria = match[4].padStart(2, '0');
        return `Bateria ${numBateria} (${dia}/${mes}/${anoCompleto})`;
    }
    let matchSeq = sessaoStr.match(/\((\d+)\)/);
    if (matchSeq) {
        let numBateria = matchSeq[1].padStart(2, '0');
        return `Bateria ${numBateria} - ${sessaoStr.replace(/\(?\d+[-/]\d+[-/]\d+\)?/, '').trim()}`;
    }
    return sessaoStr;
}

export function extrairPesoOrdenacao(sessaoStr) {
    if (!sessaoStr) return 0;
    let matchData = sessaoStr.match(/(\d{2})[-/](\d{2})[-/](\d{2})/);
    let timestampData = 0;
    if (matchData) {
        let dia = parseInt(matchData[1], 10);
        let mes = parseInt(matchData[2], 10) - 1;
        let ano = parseInt(matchData[3], 10) + 2000;
        timestampData = new Date(ano, mes, dia).getTime();
    }
    let matchSeq = sessaoStr.match(/\((\d+)\)/) || sessaoStr.match(/bateria\s*(\d+)/i) || sessaoStr.match(/(\d+)/);
    let sequencial = matchSeq ? parseInt(matchSeq[1], 10) : 0;
    return timestampData + sequencial;
}

export function ordenarParticipantesBateria(participantesValidos) {
    if (!participantesValidos || participantesValidos.length === 0) return [];
    const valorTempo = (l) => (l && typeof l === 'object') ? Number(l.tempo) : Number(l);
    const totalValido = (p) => (p.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0).reduce((acc, t) => acc + t, 0);

    return [...participantesValidos].sort((a, b) => {
        const voltasA = (a.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0).length;
        const voltasB = (b.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0).length;
        if (voltasA !== voltasB) return voltasB - voltasA;
        const tempoA = totalValido(a);
        const tempoB = totalValido(b);
        if (tempoA !== tempoB) return tempoA - tempoB;
        const melhorA = Math.min(...((a.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0)), Infinity);
        const melhorB = Math.min(...((b.laps || []).map(valorTempo).filter(t => Number.isFinite(t) && t > 0)), Infinity);
        return melhorA - melhorB;
    });
}

export function obterTodosDadosConsolidados() {
    let consolidado = [];
    if (listaJsonsCache && Array.isArray(listaJsonsCache)) {
        listaJsonsCache.forEach(arq => {
            if (arq.dados && Array.isArray(arq.dados)) {
                arq.dados.forEach(d => {
                    if (!d.laps || d.laps.length === 0) return;
                    let pilotoReal = d.piloto;
                    let safeNomeKey = pilotoReal.replace(/[.#$\/\[\]]/g, "_");
                    if (mesclagensCache[safeNomeKey]) pilotoReal = mesclagensCache[safeNomeKey];
                    let meta = pilotosMetadadosCache[pilotoReal] || {};
                    consolidado.push({
                        ...d, piloto: pilotoReal, pilotoOriginal: d.piloto, bateriaKey: arq.firebaseKey,
                        pilotoExibicao: meta.apelido ? `${pilotoReal} (${meta.apelido})` : pilotoReal, apelido: meta.apelido || ''
                    });
                });
            }
        });
    }
    return consolidado;
}

export function parsearTextoConvertido(texto, sessaoNome, batKey) {
    let pilotosMap = {};
    let linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    let ordemPilotos = [];
    let capturandoResumo = false;
    let capturandoVoltas = false;

    linhas.forEach(linha => {
        let linhaLimpa = linha.replace(/\|/g, ' ').trim();
        let partes = linhaLimpa.split(/\s+/).filter(Boolean);
        if (partes.length === 0) return;

        let linhaLower = linhaLimpa.toLowerCase();
        if (linhaLower.startsWith("top ") || linhaLower.includes("top 10") || linhaLower.includes("top 5")) {
            capturandoResumo = false;
            capturandoVoltas = false;
            return;
        }

        if ((linhaLimpa.includes("Piloto") || linhaLimpa.includes("Pos")) && (linhaLimpa.includes("Voltas") || linhaLimpa.includes("Tempo") || linhaLimpa.includes("Melhor"))) {
            capturandoResumo = true;
            capturandoVoltas = false;
            return;
        }

        if (linhaLower.includes("volta por piloto") || linhaLower.includes("voltas por piloto") || linhaLower.includes("lap by lap") || (partes[0] === "Num." && capturandoResumo)) {
            capturandoResumo = false;
            capturandoVoltas = true;
            return;
        }

        if (capturandoResumo) {
            let posDetectada = null;
            let startIndex = 0;

            if (/^\d{1,2}º?$/.test(partes[0])) {
                posDetectada = partes[0].includes('º') ? partes[0] : partes[0] + 'º';
                startIndex = 1;
                if (/^\d+$/.test(partes[1])) startIndex = 2;
            } else if (partes.length >= 2 && /^\d+$/.test(partes[0]) && /^\d{1,2}º?$/.test(partes[1])) {
                posDetectada = partes[1].includes('º') ? partes[1] : partes[1] + 'º';
                startIndex = 2;
            } else if (partes.length >= 1 && /^\d{1,2}$/.test(partes[0].replace('º', ''))) {
                posDetectada = partes[0].includes('º') ? partes[0] : partes[0] + 'º';
                startIndex = 1;
                if (/^\d+$/.test(partes[1])) startIndex = 2;
            }

            if (!posDetectada && partes.length >= 1 && !/\d+:\d+/.test(partes[0]) && isNaN(partes[0])) {
                startIndex = 0;
                posDetectada = (ordemPilotos.length + 1) + 'º';
            }

            if (posDetectada || startIndex >= 0) {
                let nomePartes = [];
                for (let i = startIndex; i < partes.length; i++) {
                    let p = partes[i];
                    if (/^\d+$/.test(p) && i > startIndex + 1) break;
                    if (/^\d+[:.,]\d+/.test(p)) break;
                    if (p.includes('s') && /^\d+[,.]\d+s?$/.test(p)) break;
                    if (p === 'º' || p === '°') continue;
                    nomePartes.push(p);
                }

                if (nomePartes.length > 0) {
                    let pilotoNome = nomePartes.join(' ');
                    pilotoNome = pilotoNome.replace(/\s+\d+$/, '').trim();

                    if (pilotoNome && !pilotosMap[pilotoNome]) {
                        pilotosMap[pilotoNome] = {
                            pos: posDetectada || ((ordemPilotos.length + 1) + 'º'),
                            piloto: pilotoNome,
                            bateriaKey: batKey,
                            sessao: sessaoNome,
                            voltasTotais: 0,
                            tempoTotal: "00:00,000",
                            melhorVoltaVal: 0,
                            melhorVoltaTxt: "00,000s",
                            mediaVal: 0,
                            mediaTxt: "00,000s",
                            desvioVal: 0,
                            desvio: "±0,000s",
                            badgeColor: "#ffb703",
                            laps: []
                        };
                        ordemPilotos.push(pilotoNome);
                    }
                }
            }
        }

        if (capturandoVoltas && (/^\d+$/.test(partes[0]) || /^\d+[º°]?$/.test(partes[0]))) {
            let numVolta = parseInt(partes[0].replace(/[º°]/g, ''), 10);
            if (isNaN(numVolta)) return;
            let temposLinha = [];

            for (let i = 1; i < partes.length; i++) {
                let token = partes[i].split('-')[0].trim();
                token = token.replace(/[^\d:,.]/g, '');
                
                if (token && (/\d+[,.]\d+/.test(token) || /\d+:\d+[,.]\d+/.test(token))) {
                    let tempoNum = 0;
                    if (token.includes(':')) {
                        let partesTempo = token.split(':');
                        let minutos = parseInt(partesTempo[0], 10);
                        let segundos = parseFloat(partesTempo[1].replace(',', '.'));
                        tempoNum = (minutos * 60) + segundos;
                    } else {
                        tempoNum = parseFloat(token.replace(',', '.'));
                    }
                    if (!isNaN(tempoNum) && tempoNum > 0) temposLinha.push(parseFloat(tempoNum.toFixed(3)));
                }
            }

            temposLinha.forEach((tempoVal, idx) => {
                if (ordemPilotos[idx]) {
                    let pName = ordemPilotos[idx];
                    if (!pilotosMap[pName].laps) pilotosMap[pName].laps = [];
                    pilotosMap[pName].laps[numVolta - 1] = tempoVal;
                }
            });
        }
    });

    let resultadoFinal = [];
    let coresBadge = ["#ffb703", "#e76f51", "#2ec4b6", "#0077b6", "#d90429", "#8338ec"];
    let contador = 0;

    Object.keys(pilotosMap).forEach(pName => {
        let pObj = pilotosMap[pName];
        let lapsLimpos = [];
        if (Array.isArray(pObj.laps)) {
            for (let i = 0; i < pObj.laps.length; i++) {
                if (pObj.laps[i] !== undefined && !isNaN(pObj.laps[i])) {
                    lapsLimpos.push(pObj.laps[i]);
                }
            }
        }
        pObj.laps = lapsLimpos;
        if (pObj.laps.length === 0) return; 

        let melhor = Math.min(...pObj.laps);
        let soma = pObj.laps.reduce((a, b) => a + b, 0);
        let media = soma / pObj.laps.length;
        let variancia = pObj.laps.reduce((sum, t) => sum + Math.pow(t - media, 2), 0) / pObj.laps.length;
        let desvio = Math.sqrt(variancia);

        pObj.melhorVoltaVal = parseFloat(melhor.toFixed(3));
        pObj.melhorVoltaTxt = melhor.toFixed(3).replace('.', ',') + 's';
        pObj.mediaVal = parseFloat(media.toFixed(3));
        pObj.mediaTxt = media.toFixed(3).replace('.', ',') + 's';
        pObj.desvioVal = parseFloat(desvio.toFixed(3));
        pObj.desvio = `±${desvio.toFixed(3).replace('.', ',')}s`;
        pObj.voltasTotais = pObj.laps.length;
        pObj.badgeColor = coresBadge[contador % coresBadge.length];
        contador++;
        resultadoFinal.push(pObj);
    });

    return resultadoFinal;
}

export async function converterPdfParaTexto(arquivo) {
    const arrayBuffer = await arquivo.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    let textoCompleto = "";

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const pagina = await pdfDoc.getPage(pageNum);
        const tokenTextos = await pagina.getTextContent();
        let linhasY = {};
        
        tokenTextos.items.forEach(item => {
            let y = Math.round(item.transform[5] / 3) * 3;
            if (!linhasY[y]) linhasY[y] = [];
            linhasY[y].push({ x: item.transform[4], str: item.str });
        });

        let coordenadasYOrdenadas = Object.keys(linhasY).sort((a, b) => b - a);
        coordenadasYOrdenadas.forEach(y => {
            let linhaItens = linhasY[y].sort((a, b) => a.x - b.x);
            let linhaStr = linhaItens.map(i => i.str).join(" | ");
            textoCompleto += linhaStr + "\n";
        });
    }
    return textoCompleto;
}

export async function arquivoParaBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}