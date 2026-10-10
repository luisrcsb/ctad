"""Port fiel dos parsers do site CTAD (index.html) para Python.

Detecta o formato do relatorio (zround/csv/mylaps), extrai pilotos e voltas,
e gera o resumo leve da vitrine publica (port de portal-pistas.js).
"""
import re

PARSER_VERSION = 2  # mesma versao do site (v2 atual)


def detectar_formato(texto):
    t = texto.lower()
    if ("zround" in t or "z-round" in t
            or ("piloto" in t and "voltas" in t and "tempo" in t and "volta por piloto" in t)):
        return "zround"
    if ("mylaps" in t or "my laps" in t
            or ("track" in t and "sector" in t)
            or ("best lap" in t and "sector" in t)):
        return "mylaps"
    if "," in texto and any(len(l.split(",")) >= 4 and re.match(r"^\d+,\s*.+,\s*\d+,\s*[\d:.,]+", l)
                            for l in texto.split("\n")):
        return "csv"
    return "zround"


def _tempo_para_seg(token):
    token = token.replace(",", ".")
    if ":" in token:
        minutos, resto = token.split(":", 1)
        return int(minutos) * 60 + float(resto)
    return float(token)


def parsear_csv(texto, sessao, bat_key):
    linhas = [l.strip() for l in texto.splitlines() if l.strip()]
    if len(linhas) < 2:
        return []
    cab = [h.strip().lower() for h in linhas[0].split(",")]
    def achar(*chaves):
        for i, h in enumerate(cab):
            if any(c in h for c in chaves):
                return i
        return -1
    i_piloto = achar("piloto", "driver", "name")
    i_pos = achar("pos", "rank")
    i_voltas = achar("volta", "lap")
    i_melhor = achar("best", "melhor", "fastest")
    if i_piloto == -1:
        return []
    resultado = []
    for linha in linhas[1:]:
        cols = [c.strip() for c in linha.split(",")]
        if len(cols) <= i_piloto or not cols[i_piloto]:
            continue
        pos = len(resultado) + 1
        if i_pos != -1 and i_pos < len(cols) and cols[i_pos]:
            try:
                pos = int(re.sub(r"[º°]", "", cols[i_pos])) or pos
            except ValueError:
                pass
        voltas = 0
        if i_voltas != -1 and i_voltas < len(cols) and cols[i_voltas]:
            try:
                voltas = int(cols[i_voltas])
            except ValueError:
                pass
        melhor = 0.0
        if i_melhor != -1 and i_melhor < len(cols) and cols[i_melhor]:
            try:
                melhor = _tempo_para_seg(cols[i_melhor])
            except ValueError:
                pass
        resultado.append({"piloto": cols[i_piloto], "pos": f"{pos}º",
                          "bateriaKey": bat_key, "sessao": sessao,
                          "voltasTotais": voltas, "melhorVoltaVal": melhor,
                          "melhorVoltaTxt": f"{melhor:.3f}s".replace(".", ",") if melhor else "00,000s",
                          "mediaVal": 0, "mediaTxt": "00,000s",
                          "desvioVal": 0, "desvio": "±0,000s", "laps": []})
    return resultado


def parsear_mylaps(texto, sessao, bat_key):
    linhas = [l.strip() for l in texto.splitlines() if l.strip()]
    resultado, capturando = [], False
    for linha in linhas:
        baixo = linha.lower()
        if "best lap" in baixo or "driver" in baixo:
            capturando = True
            continue
        if not capturando:
            continue
        partes = [p for p in re.split(r"\s{2,}|\t", linha) if p]
        if len(partes) < 3:
            continue
        piloto, pos, melhor = "", len(resultado) + 1, 0.0
        for p in partes:
            p = p.strip()
            if re.fullmatch(r"\d+", p) and pos == len(resultado) + 1:
                pos = int(p)
            elif re.search(r"\d+[:.]\d+", p):
                try:
                    val = _tempo_para_seg(p)
                    if val > 0 and (melhor == 0 or val < melhor):
                        melhor = val
                except ValueError:
                    pass
            elif not piloto and len(p) > 2 and not re.fullmatch(r"\d+", p):
                piloto = p
        if piloto:
            resultado.append({"piloto": piloto, "pos": f"{pos}º",
                              "bateriaKey": bat_key, "sessao": sessao,
                              "voltasTotais": 0, "melhorVoltaVal": melhor,
                              "melhorVoltaTxt": f"{melhor:.3f}s".replace(".", ",") if melhor else "00,000s",
                              "mediaVal": 0, "mediaTxt": "00,000s",
                              "desvioVal": 0, "desvio": "±0,000s", "laps": []})
    return resultado


def parsear_zround(texto, sessao, bat_key):
    pilotos, ordem = {}, []
    cap_resumo, cap_voltas = False, False
    for linha in (l.strip() for l in texto.splitlines() if l.strip()):
        limpa = linha.replace("|", " ").strip()
        partes = limpa.split()
        if not partes:
            continue
        baixo = limpa.lower()
        if baixo.startswith("top ") or "top 10" in baixo:
            cap_resumo = cap_voltas = False
            continue
        if (("Piloto" in limpa or "Pos" in limpa)
                and ("Voltas" in limpa or "Tempo" in limpa)):
            cap_resumo, cap_voltas = True, False
            continue
        if ("volta por piloto" in baixo or "lap by lap" in baixo
                or (partes[0] == "Num." and cap_resumo)):
            cap_resumo, cap_voltas = False, True
            continue
        if cap_resumo:
            pos, ini = None, 0
            if re.fullmatch(r"\d{1,2}º?", partes[0]):
                pos = partes[0] if "º" in partes[0] else partes[0] + "º"
                ini = 1
                if len(partes) > 1 and re.fullmatch(r"\d+", partes[1]):
                    ini = 2
            nome_partes = []
            for i in range(ini, len(partes)):
                p = partes[i]
                if re.fullmatch(r"\d+", p) and i > ini + 1:
                    break
                if re.match(r"^\d+[:.,]\d+", p):
                    break
                if p in ("º", "°"):
                    continue
                nome_partes.append(p)
            if nome_partes:
                nome = re.sub(r"\s+\d+$", "", " ".join(nome_partes)).strip()
                if nome and nome not in pilotos:
                    pilotos[nome] = {"pos": pos or f"{len(ordem) + 1}º",
                                     "piloto": nome, "bateriaKey": bat_key,
                                     "sessao": sessao, "voltasTotais": 0,
                                     "melhorVoltaVal": 0, "melhorVoltaTxt": "00,000s",
                                     "mediaVal": 0, "mediaTxt": "00,000s",
                                     "desvioVal": 0, "desvio": "±0,000s", "laps": []}
                    ordem.append(nome)
        if cap_voltas and re.fullmatch(r"\d+[º°]?", partes[0]):
            num = int(re.sub(r"[º°]", "", partes[0]))
            tempos = []
            for tok in partes[1:]:
                tok = re.sub(r"[^\d:,.]", "", tok.split("-")[0].strip())
                if tok and re.search(r"\d+[,.]\d+", tok):
                    try:
                        val = _tempo_para_seg(tok)
                        if val > 0:
                            tempos.append(round(val, 3))
                    except ValueError:
                        pass
            for idx, val in enumerate(tempos):
                if idx < len(ordem):
                    laps = pilotos[ordem[idx]].setdefault("laps", [])
                    while len(laps) < num - 1:
                        laps.append(None)
                    if len(laps) == num - 1:
                        laps.append(val)
                    else:
                        laps[num - 1] = val
    final = []
    for nome in pilotos:
        p = pilotos[nome]
        laps = [t for t in (p.get("laps") or []) if isinstance(t, (int, float)) and t > 0]
        if not laps:
            continue
        p["laps"] = laps
        melhor = min(laps)
        media = sum(laps) / len(laps)
        desvio = (sum((t - media) ** 2 for t in laps) / len(laps)) ** 0.5
        p["melhorVoltaVal"] = round(melhor, 3)
        p["melhorVoltaTxt"] = f"{melhor:.3f}s".replace(".", ",")
        p["mediaVal"] = round(media, 3)
        p["mediaTxt"] = f"{media:.3f}s".replace(".", ",")
        p["desvioVal"] = round(desvio, 3)
        p["desvio"] = f"±{desvio:.3f}s".replace(".", ",")
        p["voltasTotais"] = len(laps)
        final.append(p)
    return final


def parsear_texto(texto, sessao, bat_key):
    formato = detectar_formato(texto)
    if formato == "csv":
        resultado = parsear_csv(texto, sessao, bat_key)
    elif formato == "mylaps":
        resultado = parsear_mylaps(texto, sessao, bat_key)
    else:
        resultado = parsear_zround(texto, sessao, bat_key)
    return formato, resultado


def gerar_resumo(reg):
    def extrair(v):
        if v is None:
            return float("nan")
        if isinstance(v, dict):
            v = v.get("tempo", v.get("time", v.get("lapTime")))
        try:
            return float(v)
        except (TypeError, ValueError):
            return float("nan")
    proc = []
    for d in (reg.get("dados") or []):
        nome = str(d.get("piloto") or d.get("name") or d.get("pilot") or "").strip()
        laps = [t for t in (extrair(v) for v in (d.get("laps") or [])) if t == t and t > 0]
        if nome and laps:
            proc.append({"piloto": nome, "voltas": len(laps), "melhor": min(laps)})
    proc.sort(key=lambda p: (-p["voltas"], p["melhor"]))
    podio = [p["piloto"] for p in proc[:3]]
    melhor = min(proc, key=lambda p: p["melhor"]) if proc else None
    import time as _t
    return {"pistaId": reg.get("pistaId"), "nomePista": reg.get("pistaId"),
            "sessao": reg.get("sessao"),
            "firebaseKey": reg.get("firebaseKey") or reg.get("bateriaKey"),
            "podio": podio, "totalPilotos": len(proc),
            "melhorVolta": ({"piloto": melhor["piloto"],
                              "tempo": round(melhor["melhor"], 3)} if melhor else None),
            "atualizadoEm": int(_t.time() * 1000)}
