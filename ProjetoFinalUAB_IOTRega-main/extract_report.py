import pdfplumber
import os

base = r'C:\Users\Timoteo\Documents\U. Aberta\25-26\III Y\II Simestre\Projeto de Engenharia\Resolucao'
path = None
for root, dirs, files in os.walk(base):
    for fn in files:
        if fn.lower().endswith('.pdf') and 'intermédio' in fn.lower():
            path = os.path.join(root, fn)
            break
if path is None:
    raise SystemExit('not found')

path = '\\\\?\\' + path

with pdfplumber.open(path) as pdf:
    print('pages', len(pdf.pages))
    text = ''
    for i, p in enumerate(pdf.pages):
        t = p.extract_text() or ''
        text += f'\n\n===== PAGE {i+1} =====\n' + t

with open(r'C:\Users\Timoteo\Desktop\TF\report_extract.txt', 'w', encoding='utf-8') as f:
    f.write(text)

print('done', len(text))
