"""Export native triggered callers and their exact phonebook map restrictions."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'browser/public/source/phone-triggers.json'
constants = json.loads((ROOT / 'browser/public/source/constants.json').read_text())
paths = ['src/field/overlay_2_gear_phone.c', 'src/gear_phone_ring_manager.c',
         'include/constants/phone_constants.h', 'files/tel/pmtel_book.json',
         'browser/public/source/constants.json']
sources = {path: (ROOT / path).read_text() for path in paths}
book = {row['id']: row for row in json.loads(sources[paths[3]])['pmtel_book']}
trigger_names = {int(value): name for name, value in re.findall(
    r'^#define\s+(CALL_TRIGGER_\w+)\s+(\d+)', sources[paths[2]], re.M)}
block = re.search(r'sPhoneCallTriggers\[\]\s*=\s*\{(.*?)\n\};', sources[paths[0]], re.S)[1]
rows = re.findall(r'\{\s*(PHONE_CONTACT_\w+),\s*0,\s*(PHONE_SCRIPT_\w+),\s*(TRUE|FALSE),\s*0\s*\}', block)
assert len(rows) == int(re.search(r'#define\s+NUM_CALL_TRIGGERS\s+(\d+)', sources[paths[2]])[1])
triggers = []
for index, (contact, script, force) in enumerate(rows):
    triggers.append({'id': index, 'key': trigger_names[index], 'contact': constants[contact],
                     'contactKey': contact, 'map': constants[book[contact]['mapId']],
                     'script': constants[script], 'forcePickUp': force == 'TRUE'})
interval = int(re.search(r'ptr->callIntervalMinutes\s*=\s*(\d+)', sources[paths[1]])[1])
duration = int(re.search(r'ptr->maxActiveDuration\s*=\s*(\d+)', sources[paths[1]])[1])
OUT.write_text(json.dumps({'callIntervalMinutes': interval, 'maxActiveDurationSeconds': duration,
                          'triggers': triggers, 'sourceSha256': {
                              path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths
                          }}, separators=(',', ':')) + '\n')
print(f'Exported {len(triggers)} native pending-call triggers.')
