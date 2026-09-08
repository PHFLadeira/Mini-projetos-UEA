# AutoGrade — Grade + Montador de Horários (UEA)

Site estático para alunos da UEA: visualizar a grade curricular, importar o
histórico escolar (PDF), descobrir o que já pode cursar pelos pré-requisitos e
montar um horário sem conflitos.

**No ar:** https://grade-eca-2014-2023.web.app

## Estrutura

```
public/            → o site (Firebase Hosting)
  index.html
  css/styles.css
  js/*.js          → app em JS puro, sem build
  pdfs/            → horários acadêmicos + JSON pré-processado
tools/
  validate_grade.js → valida a integridade de public/js/data.js
convert_pdfs.py    → gera public/pdfs/disciplines.json a partir dos PDFs
server.py          → parser opcional do histórico (Flask + pdfplumber + OCR)
firebase.json      → config de deploy (projeto grade-eca-2014-2023)
```

## Rodar localmente

```bash
cd public
python -m http.server 8000
# abra http://localhost:8000
```

Parser do histórico (opcional — o app tem fallback no navegador):

```bash
pip install flask pdfplumber pymupdf pytesseract Pillow
python server.py            # http://localhost:5001
```

## Validar os dados da grade

```bash
node tools/validate_grade.js
```

## Deploy

```bash
firebase deploy --only hosting
```

## Grades suportadas

- ECA 2014
- ECA 2023
- Eng. Computação 2018

A Consulta de Horários cobre 7 cursos (Elétrica, Eletrônica, Controle e
Automação, Computação, Lic. Computação, Sistemas de Informação, Química).
