"""Build the local plugin ZIP from runtime files, excluding tests and local data."""
from pathlib import Path
import json
import zipfile

base = Path(__file__).resolve().parents[1]
root = base / 'com.ulanzi.orcanavigation.ulanziPlugin'
manifest = json.loads((root / 'manifest.json').read_text())
version = manifest['Version']
assert json.loads((root / 'package.json').read_text())['version'] == version
lock = json.loads((root / 'package-lock.json').read_text())
assert lock['version'] == lock['packages']['']['version'] == version
files = list(root.glob('*.js')) + list(root.glob('*.cjs')) + list(root.glob('*.html')) + list(root.glob('*.json'))
files.append(root / 'THIRD_PARTY_NOTICES.txt')
for folder in ['assets', 'native', 'node_modules/ws']:
    files += [p for p in (root / folder).rglob('*') if p.is_file()]
assert (root / 'wheel.cjs') in files
for action in manifest['Actions']:
    for name in [action['Icon'], *[s['Image'] for s in action['States']]]:
        assert (root / name).is_file(), name
for name in manifest.get('Banner', []):
    assert (root / name).is_file(), name
target = base / 'dist/com.ulanzi.orcanavigation.ulanziPlugin.zip'
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(set(files)):
        archive.write(file, file.relative_to(base))
    archive.write(base / 'LICENSE', f'{root.name}/LICENSE')
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    packed = json.loads(archive.read(f'{root.name}/manifest.json'))
    assert packed['Version'] == version
    assert archive.read(f'{root.name}/LICENSE') == (base / 'LICENSE').read_bytes()
    assert archive.getinfo(f'{root.name}/native/mac-navigation').external_attr >> 16 & 0o111
    assert not any('/test/' in name or '.env' in name for name in archive.namelist())
print(f'{target.name}: {version}, {len(set(files)) + 1} runtime files, archive OK')
