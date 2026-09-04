export function gerarPayloadPixBRCode(chave, nomeRecebedor, cidade, valor) {
    function formatEmv(id, val) {
        let s = String(val);
        return id + String(s.length).padStart(2, '0') + s;
    }

    let nomeLimpo = (nomeRecebedor || "CTAD RACING").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 25).trim();
    let cidadeLimpa = (cidade || "MACEIO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 15).trim();
    let chaveLimpa = String(chave).trim();

    if (chaveLimpa.startsWith("000201")) {
        return chaveLimpa;
    }

    let gui = formatEmv("00", "br.gov.bcb.pix") + formatEmv("01", chaveLimpa);
    let merchantAccount = formatEmv("26", gui);
    
    let valStr = (valor !== undefined && valor !== null && Number(valor) > 0) ? Number(valor).toFixed(2) : "";
    let field54 = valStr ? formatEmv("54", valStr) : "";
    let field62 = formatEmv("62", formatEmv("05", "***"));

    let payloadSemCrc = (
        formatEmv("00", "01") +
        merchantAccount +
        formatEmv("52", "0000") +
        formatEmv("53", "986") +
        field54 +
        formatEmv("58", "BR") +
        formatEmv("59", nomeLimpo) +
        formatEmv("60", cidadeLimpa) +
        field62 +
        "6304"
    );

    let crc = 0xFFFF;
    for (let i = 0; i < payloadSemCrc.length; i++) {
        let b = payloadSemCrc.charCodeAt(i) & 0xFF;
        crc ^= (b << 8);
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = ((crc << 1)) & 0xFFFF;
            }
        }
    }
    let crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
    return payloadSemCrc + crcHex;
}