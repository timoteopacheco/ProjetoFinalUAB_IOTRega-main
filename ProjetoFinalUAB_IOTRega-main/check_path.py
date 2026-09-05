import os, glob

base = r'C:\Users\Timoteo\Documents\U. Aberta\25-26\III Y\II Simestre\Projeto de Engenharia\Resolucao'
with open(r'C:\Users\Timoteo\Desktop\TF\check_out.txt', 'w', encoding='utf-8') as f:
    for root, dirs, files in os.walk(base):
        if 'atório' in root or 'Relat' in root:
            f.write(root + '\n')
            for fn in files:
                f.write('  FILE: ' + fn + '\n')
