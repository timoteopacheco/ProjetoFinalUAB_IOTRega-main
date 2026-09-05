import os

base = r'C:\Users\Timoteo\Documents\U. Aberta\25-26\III Y\II Simestre\Projeto de Engenharia\Resolucao'
found = []
for root, dirs, files in os.walk(base):
    for fn in files:
        if fn.lower().endswith('.pdf') and 'intermédio' in fn.lower():
            p = os.path.join(root, fn)
            found.append(p)

with open(r'C:\Users\Timoteo\Desktop\TF\check2_out.txt', 'w', encoding='utf-8') as f:
    for p in found:
        f.write(repr(p) + '\n')
        f.write('isfile=' + str(os.path.isfile(p)) + '\n')
        f.write('bytes=' + p.encode('utf-8', 'surrogateescape').hex() + '\n')
