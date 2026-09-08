#!/usr/bin/env python3
"""
grade-interativa — Servidor de Extração de Histórico UEA
=========================================================
Pipeline de extração:
  1. pdfplumber  — rápido, funciona para PDFs com camada de texto
  2. PyMuPDF + Tesseract OCR  — fallback para PDFs com texto como vetores
     (todos os históricos UEA mais recentes estão nessa categoria)

Instalação (1ª vez):
    pip install flask pdfplumber pymupdf pytesseract Pillow
    winget install -e --id UB-Mannheim.TesseractOCR -h

Uso:
    python server.py
"""

import io
import os
import re
import sys
import tempfile

try:
    from flask import Flask, request, jsonify
except ImportError:
    sys.exit("ERRO: Flask não instalado.\nExecute: pip install flask")

try:
    import pdfplumber
except ImportError:
    sys.exit("ERRO: pdfplumber não instalado.\nExecute: pip install pdfplumber")

# Imports opcionais — ativam OCR se disponíveis
try:
    import fitz as _fitz          # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    import pytesseract as _tess
    from PIL import Image as _Image
    # Localiza o executável do Tesseract no Windows
    _tess_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"C:\Users\Public\Tesseract-OCR\tesseract.exe",
    ]
    for _p in _tess_paths:
        if os.path.exists(_p):
            _tess.pytesseract.tesseract_cmd = _p
            break
    # Verifica se funciona
    _tess.get_tesseract_version()
    HAS_TESSERACT = True
except Exception:
    HAS_TESSERACT = False

# ── Garante UTF-8 no terminal Windows ─────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

app = Flask(__name__)
PORT = 5001

# Língua preferencial para OCR (usa eng como fallback sempre disponível)
_OCR_LANG = "por" if HAS_TESSERACT and "por" in (_tess.get_languages() if HAS_TESSERACT else []) else "eng"


# ── CORS: permite chamadas do browser local ────────────────────────────────────
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def ping():
    return jsonify({
        "ok": True,
        "msg": "Parser UEA online",
        "ocr": HAS_TESSERACT,
        "ocr_lang": _OCR_LANG if HAS_TESSERACT else None,
    })


@app.route("/parse", methods=["POST", "OPTIONS"])
def parse_historico():
    if request.method == "OPTIONS":
        return "", 200

    if "file" not in request.files:
        return jsonify({"ok": False, "error": "Nenhum arquivo enviado"}), 400

    raw = request.files["file"].read()
    try:
        result = process_pdf(raw)
        return jsonify({"ok": True, **result})
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(exc)}), 500


# ── Extração ───────────────────────────────────────────────────────────────────

def extract_with_pdfplumber(pdf_bytes):
    """Tenta extração de texto nativa via pdfplumber. Retorna '' se vazio."""
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                pages.append(t)
    return "\n".join(pages)


def extract_with_ocr(pdf_bytes):
    """Renderiza páginas com PyMuPDF e aplica Tesseract OCR."""
    if not HAS_PYMUPDF:
        raise RuntimeError("PyMuPDF não instalado. Execute: pip install pymupdf")
    if not HAS_TESSERACT:
        raise RuntimeError(
            "Tesseract não encontrado.\n"
            "Instale em: https://github.com/UB-Mannheim/tesseract/wiki\n"
            "Ou execute: winget install -e --id UB-Mannheim.TesseractOCR -h"
        )

    doc = _fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_text = []
    # PSM 6 = uniform block; OEM 1 = LSTM neural net
    tess_cfg = "--psm 6 --oem 1"

    for page in doc:
        mat = _fitz.Matrix(3.0, 3.0)   # 3× zoom → ~216 DPI — melhor qualidade
        pix = page.get_pixmap(matrix=mat, colorspace=_fitz.csGRAY)
        img = _Image.open(io.BytesIO(pix.tobytes("png")))
        text = _tess.image_to_string(img, lang=_OCR_LANG, config=tess_cfg)
        pages_text.append(text)

    doc.close()
    return "\n".join(pages_text)


def normalize_est_codes(text):
    """
    Corrige erros comuns de OCR nos códigos EST* (confusão 0↔O, caracteres extras).

    Lógica:
    - Prefixo de letras é sempre 2-4 letras maiúsculas após EST (ex: BAS, EEL, EMA).
    - Sufixo numérico é 3-4 dígitos (ex: 007, 0207).
    - OCR erra: O no lugar de 0 (ESTBAS0O7→007), ou insere O extra (ESTBASO005→005).

    Heurística para distinguir "substituição" de "inserção":
    - Prefixo de 6 chars (EST+3 letras) + raw de 4 chars iniciando com O
      → O é espúrio (inserido), remover → 3 dígitos esperados.
    - Qualquer outro caso → substituir O e Q por 0 dentro do sufixo.
    """
    def fix(m):
        prefix = m.group(1)   # EST + letras  ex: ESTBAS, ESTEEL
        raw    = m.group(2)   # sufixo bruto   ex: O07, O005, 0O3

        # Prefixo 6 chars (EST+3) + 4 raw iniciando com O → O é extra, remover
        if len(prefix) == 6 and len(raw) == 4 and raw[0] in "OQ":
            raw = raw[1:]   # ESTBAS + O005 → ESTBAS + 005

        # Substitui O/Q por 0 no que restar
        raw = raw.replace("O", "0").replace("Q", "0")
        return prefix + raw

    # Todos os códigos UEA usam EST + exatamente 3 letras + 3-4 dígitos
    return re.sub(
        r"\b(EST[A-Z]{3})([OQ0-9][A-Z0-9]{2,5})\b",
        fix,
        text,
    )


def process_pdf(pdf_bytes):
    """
    Pipeline completo: pdfplumber → OCR se necessário.
    Retorna {"curriculo", "text", "aluno", "method"}.
    """
    method = "pdfplumber"
    full_text = extract_with_pdfplumber(pdf_bytes)

    if not full_text.strip():
        print("  [!] pdfplumber: sem texto — usando OCR")
        method = f"ocr:{_OCR_LANG}"
        full_text = extract_with_ocr(pdf_bytes)

    if not full_text.strip():
        raise ValueError("Não foi possível extrair texto do PDF (nem texto nem OCR).")

    # Normaliza códigos com possíveis erros OCR
    full_text = normalize_est_codes(full_text)

    # ── Detecta currículo ──────────────────────────────────────────────────────
    m_curric = re.search(
        r"Curr[íi]culo\s*:?\s*([A-Z]{3,})\s*[_\s\-]\s*(\d{4})",
        full_text,
        re.IGNORECASE,
    )
    curriculo = (
        f"{m_curric.group(1).upper()}_{m_curric.group(2)}"
        if m_curric else "EMA_2014"
    )

    aluno = extrair_info_aluno(full_text)
    codes = re.findall(r"\bEST[A-Z]{2,6}\d{3,}\b", full_text)

    print(f"  Método:    {method}")
    print(f"  Currículo: {curriculo}")
    print(f"  Aluno:     {aluno.get('nome', '?')}")
    print(f"  Linhas:    {len(full_text.splitlines())}")
    print(f"  Códigos EST: {len(set(codes))} únicos")

    return {
        "curriculo": curriculo,
        "text": full_text,
        "aluno": aluno,
        "method": method,
    }


def extrair_info_aluno(texto):
    """Extrai nome, matrícula e CRA do cabeçalho do histórico."""
    info = {}

    m = re.search(r"Nome:\s*(.+?)\s+Matr[íi]cula:\s*(\d+)", texto)
    if m:
        info["nome"]       = m.group(1).strip()
        info["matricula"]  = m.group(2).strip()
    else:
        m_nome = re.search(r"Nome:\s*(.+)", texto)
        m_mat  = re.search(r"Matr[íi]cula:\s*([\d\s]+)", texto)
        info["nome"]       = m_nome.group(1).strip() if m_nome else ""
        info["matricula"]  = re.sub(r"\s", "", m_mat.group(1)).strip() if m_mat else ""

    m_cra = re.search(r"Coeficiente de Rendimento Acumulado:\s*([\d,\.]+)", texto)
    info["cra"] = m_cra.group(1).replace(",", ".") if m_cra else ""

    return info


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{'='*54}")
    print(f"  grade-interativa — Parser de Histórico UEA")
    print(f"  Servidor em http://localhost:{PORT}")
    print(f"  OCR: {'SIM (' + _OCR_LANG + ')' if HAS_TESSERACT else 'NÃO (instale Tesseract)'}")
    print(f"  Mantenha esta janela aberta enquanto usa o app")
    print(f"  Pressione Ctrl+C para encerrar")
    print(f"{'='*54}\n")
    app.run(host="127.0.0.1", port=PORT, debug=False)
