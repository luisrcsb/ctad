/* CTAD - Central de Telemetria — conversão de PDF para texto (pdf.js) + utilitários
   Depende da biblioteca pdf.js (pdfjsLib), carregada via <script> antes deste arquivo. */

        // Calcula hash SHA-256 do arquivo (para deduplicação)
        async function calcularHash(arquivo) {
            const buffer = await arquivo.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function converterPdfParaTexto(arquivo) {
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
                Object.keys(linhasY).sort((a, b) => b - a).forEach(y => {
                    let linhaItens = linhasY[y].sort((a, b) => a.x - b.x);
                    textoCompleto += linhaItens.map(i => i.str).join(" | ") + "\n";
                });
            }
            return textoCompleto;
        }

        // Expõe funções globalmente
        if (typeof window !== 'undefined') {
            window.calcularHash = calcularHash;
            window.converterPdfParaTexto = converterPdfParaTexto;
        }
