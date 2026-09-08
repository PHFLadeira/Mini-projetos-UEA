#!/usr/bin/env python3
"""
Converte os PDFs de horário acadêmico para disciplines.json
Instalar dependência: pip install pdfplumber
Uso: python convert_pdfs.py
"""

import pdfplumber
import json
import re
import sys
import io
from pathlib import Path

# Força UTF-8 no stdout do Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ─── Configuração dos PDFs ───────────────────────────────────────────────────
PDF_DIR = Path(__file__).parent / "public" / "pdfs"

PDF_CONFIGS = [
    {"file": "horario-eletronica-2026_02.pdf",                       "course": "Eng. Eletrônica"},
    {"file": "horario-eletrica-2026_02.pdf",                         "course": "Eng. Elétrica"},
    {"file": "Horário_VsFinal-ECP-2026_2.pdf",                       "course": "Eng. Computação"},
    {"file": "2026_2_HORÁRIO ACADÊMICO-LICOMP_.pdf",                  "course": "Lic. Computação"},
    {"file": "2026_2_HORÁRIO ACADÊMICO-2026_2.pdf",                   "course": "Sistemas de Informação"},
    {"file": "quimica-2026_02.pdf",                                  "course": "Eng. Química"},
    {"file": "horario-controle-automação.pdf",                       "course": "Eng. Controle e Automação"},
]

DAYS_MAP = {"2": "Seg", "3": "Ter", "4": "Qua", "5": "Qui", "6": "Sex"}

SKIP_TOKENS = {
    "CT","CH","SAB","DIA","INT","LAB","PRE","CURSO","TURNO","GRADE","SIGLA",
    "DISCIPLINA","VAGAS","SALA","HORARIA","PERIODO","TURMA","CURRICULO",
    "RESERVA","VAGA","DIA2","HORARIO","COMPARTIL","CODIGO","REQUISITO",
    "PREREQUISITO","NOME","PROFESSOR","LYCEUM","DISCIPLINAS","OPTATIVAS",
    "FORA","BASICO","NOLYCEUM","LYCEU","TITULO",
}

# ─── Helpers ─────────────────────────────────────────────────────────────────
def norm(s):
    s = s.upper()
    for a, b in [("Á","A"),("À","A"),("Â","A"),("Ã","A"),("É","E"),("È","E"),
                 ("Ê","E"),("Í","I"),("Ì","I"),("Î","I"),("Ó","O"),("Ò","O"),
                 ("Ô","O"),("Õ","O"),("Ú","U"),("Ù","U"),("Û","U"),("Ç","C")]:
        s = s.replace(a, b)
    return s

def is_time(s):
    s = str(s).strip().replace(";", ":")
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        return 0 <= h <= 23 and 0 <= mi <= 59
    return False

def is_code(s):
    s = str(s).strip().upper()
    if len(s) < 4 or "_" in s:
        return False
    if s in SKIP_TOKENS:
        return False
    return bool(re.match(r"^[A-Z]{2,}\d{2,}[A-Z0-9]*$", s))

def t2min(t):
    try:
        h, m = str(t).split(":")
        return int(h) * 60 + int(m)
    except:
        return 0

def extract_char_times(page, min_x=0):
    """
    Extrai horários HH:MM lendo caracteres brutos da página.
    Útil para PDFs onde os dígitos são renderizados separadamente (ex: Química).
    """
    try:
        chars = sorted(page.chars, key=lambda c: (round(c["top"] / 5) * 5, c["x0"]))
    except Exception:
        return []

    results = []
    cur_y = None
    buf = []  # list of (char_text, x0)

    def flush():
        if not buf:
            return
        text = "".join(ch for ch, _x, _y in buf)
        for m in re.finditer(r"\d{1,2}:\d{2}", text):
            t = m.group()
            if is_time(t):
                idx = m.start()
                x_pos = buf[idx][1] if idx < len(buf) else buf[0][1]
                y_pos = buf[idx][2] if idx < len(buf) else 0
                results.append({"time": t, "x": x_pos, "y_top": y_pos})

    for c in chars:
        if c["x0"] < min_x:
            continue
        y_key = round(c["top"] / 5) * 5
        if cur_y is None:
            cur_y = y_key
        if y_key != cur_y or (buf and c["x0"] - buf[-1][1] > 16):
            flush()
            buf = []
            cur_y = y_key
        buf.append((c["text"], c["x0"], c["top"]))

    flush()
    return results

# ─── Parser principal ────────────────────────────────────────────────────────
def parse_pdf(filepath, course):
    seen = set()
    disciplines = []
    current_period = "?"

    with pdfplumber.open(str(filepath)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(x_tolerance=4, y_tolerance=4,
                                        keep_blank_chars=False, use_text_flow=False)
            if not words:
                continue

            # ── Detecta coluna SIGLA ──────────────────────────────────────
            sigla_x = None
            for w in words:
                if norm(w["text"]) in ("SIGLA", "CODIGO"):
                    sigla_x = w["x0"]
                    break
            if sigla_x is None:
                for w in sorted(words, key=lambda x: x["x0"]):
                    if is_code(w["text"]) and w["x0"] > 10:
                        sigla_x = w["x0"] - 2
                        break
            if sigla_x is None:
                continue

            # ── Detecta coluna CT ─────────────────────────────────────────
            ct_x = sigla_x + 280
            for w in words:
                if w["text"] == "CT" and w["x0"] > sigla_x:
                    ct_x = w["x0"] - 5
                    break

            # ── Detecta coluna SALA ───────────────────────────────────────
            sala_x = None
            for w in words:
                if norm(w["text"]) == "SALA" and w["x0"] > ct_x:
                    sala_x = w["x0"]
                    break

            # ── Detecta colunas de dias ───────────────────────────────────
            # Requer o marcador ordinal (2ª, 3ª, ...) para evitar falso positivo
            day_cols = {}
            for w in words:
                txt = w["text"].strip()
                # "2ª","3ª","4ª","5ª","6ª" — exige exatamente dígito+ordinal
                m_day = re.match(r"^([2-6])[ªaº°]$", txt)
                if m_day and m_day.group(1) in DAYS_MAP:
                    d = DAYS_MAP[m_day.group(1)]
                    if d not in day_cols:  # mantém primeiro (linha de cabeçalho)
                        day_cols[d] = w["x0"]
                elif norm(txt) == "SAB" and "Sab" not in day_cols:
                    day_cols["Sab"] = w["x0"]
            min_day_x = min(day_cols.values()) - 15 if day_cols else 9999

            # ── Agrupa words em linhas (por top, tolerância 8px) ──────────
            sorted_words = sorted(words, key=lambda x: (round(x["top"] / 8) * 8, x["x0"]))
            lines = []
            cur_line = []
            cur_top = None
            for w in sorted_words:
                if cur_top is None or abs(w["top"] - cur_top) < 8:
                    cur_line.append(w)
                    cur_top = (cur_top or w["top"]) * 0.6 + w["top"] * 0.4
                else:
                    if cur_line:
                        lines.append(cur_line)
                    cur_line = [w]
                    cur_top = w["top"]
            if cur_line:
                lines.append(cur_line)

            # Pré-extrai horários por caractere para PDFs com dígitos espaçados
            char_times = extract_char_times(page, min_x=min_day_x - 20)

            # ── Processa linhas: detecta períodos e extrai disciplinas ──────
            for i, line in enumerate(lines):
                # Verifica primeiro se é marcador de período
                txt = " ".join(w["text"] for w in line)
                n = norm(txt)
                has_time_ln = any(is_time(w["text"]) for w in line)
                has_code_ln = any(is_code(w["text"]) and abs(w["x0"] - sigla_x) < 40 for w in line)
                if not has_time_ln and not has_code_ln:
                    if "OPTATIVA" in n:
                        current_period = "Optativa"
                    elif "FORA" in n and ("PERIODO" in n or "DISCIPLINA" in n):
                        current_period = "Fora de Período"
                    elif "PERIODO" in n and "OPTATIVA" not in n and "FORA" not in n:
                        # Busca padrão "Nº° PERÍODO" explícito (ex: "2° PERÍODO")
                        mp = re.search(r"(\d+)\s*[°º]\s*PERIODO", n)
                        if mp:
                            current_period = mp.group(1) + "º"
                        else:
                            # Fallback: último número antes de PERIODO
                            idx = n.index("PERIODO")
                            mf = re.search(r"(\d+)[^\d]*$", n[:idx])
                            if mf:
                                current_period = mf.group(1) + "º"


                line_top = line[0]["top"]

                # Busca código na coluna SIGLA (tolerância ±30px)
                code = None
                for w in sorted(line, key=lambda x: x["x0"]):
                    tok = w["text"].strip().upper()
                    if (is_code(tok)
                            and tok not in seen
                            and abs(w["x0"] - sigla_x) < 40):
                        code = tok
                        break
                if not code:
                    continue

                # ── Nome (entre SIGLA e CT) ───────────────────────────────
                name_parts = []
                for w in sorted(line, key=lambda x: x["x0"]):
                    if w["x0"] < sigla_x or w["x0"] >= ct_x:
                        continue
                    tok = w["text"].strip()
                    tok_u = tok.upper()
                    if tok_u == code or is_code(tok_u) or is_time(tok):
                        continue
                    if tok_u in SKIP_TOKENS or tok.isdigit() or not tok:
                        continue
                    name_parts.append(tok)
                name = " ".join(name_parts).strip()[:80]
                if not name or len(name) < 4:
                    continue

                # ── CT, CH, Vagas (zona numérica) ─────────────────────────
                ct = ch = vagas = 0
                num_zone = [w for w in line
                            if ct_x <= w["x0"] <= ct_x + 260 and not is_time(w["text"])]
                nums = []
                for w in num_zone:
                    try:
                        nums.append(int(float(w["text"].replace(",", "."))))
                    except ValueError:
                        pass
                for n in nums:
                    if n % 15 == 0 and 15 <= n <= 900 and ch == 0:
                        ch = n
                    elif 1 <= n <= 8 and ct == 0 and n != ch:
                        ct = n
                    elif 5 <= n <= 60 and vagas == 0 and n not in (ch, ct):
                        vagas = n

                # ── Sala ──────────────────────────────────────────────────
                room = "?"
                if sala_x is not None:
                    cands = [w for w in line
                             if abs(w["x0"] - sala_x) < 45
                             and not is_time(w["text"])
                             and not re.match(r"^\d{4,}$", w["text"].strip())]
                    cands.sort(key=lambda w: (0 if re.search(r"\d", w["text"]) else 1, w["x0"]))
                    for rc in cands:
                        rc_c = rc["text"].split("/")[0].split(" ")[0].upper()
                        if 2 <= len(rc_c) <= 8 and re.match(r"^[A-Z][A-Z0-9]+$", rc_c):
                            room = rc_c
                            break

                # ── Pré-requisito ─────────────────────────────────────────
                prereq = ""
                for w in line:
                    tok = w["text"].strip().upper()
                    if tok != code and is_code(tok) and len(tok) >= 5:
                        prereq = tok
                        break

                # ── Horários (linha atual + sub-linhas abaixo) ─────────────
                time_items = []
                # Limites y desta disciplina até a próxima
                next_disc_top = None
                for j2 in range(i + 1, len(lines)):
                    nxt = lines[j2]
                    if any(is_code(w["text"].upper()) and abs(w["x0"] - sigla_x) < 40 and w["text"].upper() != code for w in nxt):
                        next_disc_top = nxt[0]["top"]
                        break
                max_top_allowed = next_disc_top if next_disc_top else line_top + 60

                for j in range(i, min(i + 8, len(lines))):
                    sub = lines[j]
                    sub_top = sub[0]["top"]
                    if sub_top > max_top_allowed or abs(sub_top - line_top) > 60:
                        break
                    if j > i and any(
                        is_code(w["text"].upper())
                        and abs(w["x0"] - sigla_x) < 40
                        and w["text"].upper() != code
                        for w in sub
                    ):
                        break
                    for w in sub:
                        if is_time(w["text"]) and w["x0"] >= min_day_x:
                            time_items.append({"time": w["text"], "x": w["x0"]})

                # Fallback: horários extraídos por char (PDFs com dígitos espaçados, ex: Química)
                # Os chars de horário ficam alguns px ACIMA do top da linha (fonte menor).
                # Usamos ponto médio entre disciplinas consecutivas como limite superior.
                if not time_items and char_times:
                    char_lo = line_top - 8
                    char_hi = ((line_top + next_disc_top) / 2) if next_disc_top else (line_top + 30)
                    for ct_item in char_times:
                        ct_y = ct_item.get("y_top", line_top)
                        if ct_item["x"] >= min_day_x and char_lo <= ct_y <= char_hi:
                            time_items.append(ct_item)

                # ── Agrupa horários por dia ────────────────────────────────
                schedule = []
                if day_cols and time_items:
                    by_day = {}
                    for ti in time_items:
                        best_day, best_dist = None, 999
                        for day, dx in day_cols.items():
                            d = abs(ti["x"] - dx)
                            if d < best_dist and d < 90:
                                best_dist = d
                                best_day = day
                        if best_day:
                            by_day.setdefault(best_day, []).append(ti["time"])

                    seen_slots = set()
                    for day, times in by_day.items():
                        times_sorted = sorted(set(times), key=t2min)
                        if len(times_sorted) >= 2:
                            start, end = times_sorted[0], times_sorted[-1]
                            if t2min(end) - t2min(start) <= 360:
                                key = f"{day}|{start}|{end}"
                                if key not in seen_slots:
                                    seen_slots.add(key)
                                    schedule.append({"day": day, "start": start, "end": end})
                        elif len(times_sorted) == 1:
                            t = times_sorted[0]
                            key = f"{day}|{t}|{t}"
                            if key not in seen_slots:
                                seen_slots.add(key)
                                schedule.append({"day": day, "start": t, "end": t})

                seen.add(code)
                disciplines.append({
                    "code": code,
                    "name": name,
                    "course": course,
                    "period": current_period,
                    "ct": ct,
                    "ch": ch,
                    "vagas": vagas,
                    "room": room,
                    "prereq": prereq,
                    "schedule": schedule,
                })
                print(f"  {code} — {name[:50]} [{current_period}] {len(schedule)} horários")

    return disciplines


# ─── Main ────────────────────────────────────────────────────────────────────
def simplify(s):
    """Remove todos os não-ASCII e lowercase, para comparação tolerante."""
    return re.sub(r'[^a-z0-9_\-]', '', s.lower())


def find_pdf(pdf_dir, filename):
    """Encontra o PDF mesmo com variações de codificação no nome."""
    # Tenta correspondência exata primeiro
    exact = pdf_dir / filename
    if exact.exists():
        return exact
    # Fallback: comparação simplificada (remove não-ASCII)
    fn_simple = simplify(Path(filename).stem)
    for f in pdf_dir.glob("*.pdf"):
        if simplify(f.stem) == fn_simple:
            return f
    return None


def main():
    output = PDF_DIR / "disciplines.json"
    all_discs = {}  # code -> disc (mantém melhor entrada por código)

    for cfg in PDF_CONFIGS:
        path = find_pdf(PDF_DIR, cfg["file"])
        if path is None:
            print(f"[AVISO] Arquivo nao encontrado: {cfg['file']}", file=sys.stderr)
            continue
        print(f"\n{'='*60}")
        print(f"Processando: {path.name}")
        print(f"Curso: {cfg['course']}")
        print("="*60)
        try:
            discs = parse_pdf(path, cfg["course"])
            print(f"\n-> {len(discs)} disciplinas extraidas")
            for d in discs:
                code = d["code"]
                if code not in all_discs:
                    all_discs[code] = d
                else:
                    ex = all_discs[code]
                    # Atualiza se nome for mais longo ou curso diferente
                    if len(d["name"]) > len(ex["name"]):
                        all_discs[code] = {**ex, "name": d["name"], "ct": d["ct"], "ch": d["ch"]}
        except Exception as e:
            print(f"[ERRO] {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    result = list(all_discs.values())
    print(f"\n{'='*60}")
    print(f"Total: {len(result)} disciplinas únicas")

    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Salvo em: {output}")


if __name__ == "__main__":
    main()
