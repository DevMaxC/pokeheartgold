"""Export native phone trainer entries/rematch sets without replacing authored dialogue.

Sources: files/tel/pmtel_book.json, src/phonebook_dat.c, src/trainer_rematch.c.
Run after the base source/constants export.
"""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'browser/public/source'
constants=json.loads((OUT/'constants.json').read_text())
book=json.loads((ROOT/'files/tel/pmtel_book.json').read_text())['pmtel_book']
messages=re.search(r'sPhoneMessageGmm\[\]\s*=\s*\{(.*?)\n\};',(ROOT/'src/phonebook_dat.c').read_text(),re.S)[1]
banks=[int(x) for x in re.findall(r'NARC_msg_msg_(\d+)_bin',messages)]
assert len(book)==len(banks)
contacts=[{'id':constants[row['id']],'key':row['id'],'trainer':constants[row['trainerId']],'gift':constants[row['gift']],'messageBank':bank}for row,bank in zip(book,banks)]
assert [c['id']for c in contacts]==list(range(len(contacts)))
rematch=re.search(r'sTrainerRematchSets\[\]\[6\]\s*=\s*\{(.*?)\n\};',(ROOT/'src/trainer_rematch.c').read_text(),re.S)[1]
sets=[[constants[token.strip()]if token.strip()in constants else int(token.strip(),0)for token in row.split(',')]for row in re.findall(r'\{([^{}]+)\}',rematch)]
assert all(len(row)==6 for row in sets)
(OUT/'trainer-contacts.json').write_text(json.dumps({'contacts':contacts,'rematchSets':sets},separators=(',',':'))+'\n')
print(f'Imported {len(contacts)} native contacts and {len(sets)} trainer rematch sets.')
