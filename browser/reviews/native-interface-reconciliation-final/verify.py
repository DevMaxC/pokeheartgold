"""Verify archived copied source and preserved execution evidence; no extraction/network."""
from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
receipts = json.loads((root / 'archive-receipts.json').read_text())
for receipt in receipts['packets']:
    packet = root / receipt['packet']
    manifest_bytes = (packet / 'source-manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    execution = json.loads((packet / 'execution.json').read_text())
    expected = manifest['files']
    assert sha(manifest_bytes) == receipt['sourceManifestSHA256']
    assert sha((packet / 'raw-result.json').read_bytes()) == execution['rawResultSHA256'] == receipt['rawResultSHA256']
    assert sha((packet / 'review-prompt.txt').read_bytes()) == execution['promptSHA256']
    graph = sha(''.join(name + '\0' + item['sha256'] + '\n' for name, item in sorted(expected.items())).encode())
    assert graph == manifest['graphSHA256'] == receipt['sourceGraphSHA256']
    archive = root / receipt['archive']
    assert sha(archive.read_bytes()) == receipt['archiveSHA256']
    found = {}
    with tarfile.open(archive, 'r:gz') as files:
        for item in files:
            assert item.isfile() and item.name not in found
            data = files.extractfile(item).read()
            found[item.name] = sha(data)
            assert len(data) == expected[item.name]['bytes']
    assert set(found) == set(expected)
    assert all(found[name] == record['sha256'] for name, record in expected.items())
    assert len(found) == receipt['sourceFileCount']
    integrity = json.loads((packet / 'integrity-after.json').read_text())
    assert integrity['changed'] == integrity['missing'] == integrity['unexpected'] == []
    print(f"PASS {receipt['packet']}: {len(found)} source files, archive/raw/prompt/manifest hashes")

qa = root / 'natural-opening-5201'
receipt = json.loads((qa / 'receipt.json').read_text())
assert sha((qa / 'save-heartgold-3d-v2.json').read_bytes()) == receipt['saveSHA256']
storage = json.loads((qa / 'local-storage-checkpoint.json').read_text())
assert storage['heartgold-3d-v2'] == (qa / 'save-heartgold-3d-v2.json').read_text()
for shot in receipt['screenshots']:
    assert sha((qa / shot['file']).read_bytes()) == shot['sha256']
print(f"PASS natural opening: exact save/storage and {len(receipt['screenshots'])} screenshot hashes")
