"""Cobre o caminho PDF (nunca testado): gera PDF mínimo válido com texto
estilo ZRound, extrai com pdf_para_texto() e parseia. Falha se extração ou
parse não achar os 2 pilotos."""
import os
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)

from ctad_upload import pdf_para_texto
from parsers import parsear_texto


def construir_pdf(linhas):
    partes = [b"%PDF-1.4\n"]
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>")
    txt = "BT /F1 12 Tf 72 750 Td 14 TL\n"
    for i, linha in enumerate(linhas):
        segura = linha.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        txt += f"({segura}) Tj T*\n"
    txt += "ET"
    objs.append(b"<< /Length " + str(len(txt)).encode() + b" >>\nstream\n"
                + txt.encode("latin-1") + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    offsets = []
    for n, corpo in enumerate(objs, start=1):
        offsets.append(len(b"".join(partes)))
        partes.append(f"{n} 0 obj\n".encode() + corpo + b"\nendobj\n")
    ini_xref = len(b"".join(partes))
    partes.append(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        partes.append(f"{off:010d} 00000 n \n".encode())
    partes.append(f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n".encode()
                + str(ini_xref).encode() + b"\n%%EOF")
    return b"".join(partes)


def main():
    pdf = construir_pdf([
        "ZRound", "Pos Piloto Voltas Tempo",
        "1 EDGARD 3 8,123", "2 LUIS 3 8,456",
        "Volta por piloto",
        "1 8,500 8,700", "2 8,300 8,600", "3 8,123 8,456",
    ])
    texto = pdf_para_texto(pdf)
    assert "EDGARD" in texto and "Volta por piloto" in texto, repr(texto[:200])
    formato, dados = parsear_texto(texto, "teste-pdf", "bat_teste")
    assert formato == "zround", formato
    assert len(dados) == 2, dados
    nomes = sorted(d["piloto"] for d in dados)
    assert nomes == ["EDGARD", "LUIS"], nomes
    print(f"PDF-OK: formato={formato}, pilotos={nomes}")


if __name__ == "__main__":
    main()
