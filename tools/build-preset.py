"""Package the checked-in D200X layout without local paths or device identifiers."""
from pathlib import Path
import json
import zipfile

base = Path(__file__).resolve().parents[1]
plugin = json.loads((base / 'com.ulanzi.orcanavigation.ulanziPlugin/manifest.json').read_text())
root, = (base / 'presets').glob('*.ulanziProfile')
meta = json.loads((root / 'manifest.json').read_text())
assert meta['Version'] == '2.0'
assert meta['Device'] == {'Model': 'D200X', 'UUID': '00000000-0000-0000-0000-000000000000'}
assert meta['Pages']['Current'] in meta['Pages']['Pages']
OPTIONAL = {'com.potaler.orca.navigation.' + n for n in ['panePrevious', 'paneNext', 'closePane', 'paneDial']}  # Windows-only, not in the preset layout
expected = {a['UUID'] for a in plugin['Actions'] if a['Controllers'] in [['Keypad'], ['Encoder']] and a['UUID'] not in OPTIONAL}
found = []
for page in meta['Pages']['Pages']:
    folder = root / 'Profiles' / page
    data = json.loads((folder / 'manifest.json').read_text())
    for controller in data['Controllers']:
        for position, action in controller['Actions'].items():
            col, row = map(int, position.split('_'))
            assert 0 <= col < 5 and 0 <= row <= 3
            if controller['Type'] == 'Encoder': assert row == 3 and col in [2, 3, 4]
            if action['Action'] in expected:
                found.append(action['Action'])
                assert action['ActionParam'] == {}
                assert action['Plugin']['Version'] == plugin['Version']
                for view in action['ViewParam']:
                    if view.get('Icon'): assert (folder / view['Icon']).is_file()
            else:
                assert action['Action'] in ['com.ulanzi.ulanzideck.smallwindow.window', 'com.ulanzi.ulanzideck.page.prev', 'com.ulanzi.ulanzideck.page.next']
assert set(found) == expected and len(found) == len(expected) == 14
target = base / f"dist/Orca-D200X-macOS-{plugin['Version']}.ulanziDeckProfile"
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(root, root.name + '/')
    for directory in sorted(p for p in root.rglob('*') if p.is_dir()):
        archive.write(directory, str(directory.relative_to(root.parent)) + '/')
    for file in sorted(root.rglob('*')):
        if file.is_file():
            if file.suffix == '.json':
                assert '/Users/' not in file.read_text()
            archive.write(file, file.relative_to(root.parent))
# Studio uses this prefix to select the V2 importer; a plain ZIP loses plugin actions.
header = b'#Version: 2\n\n'
target.write_bytes(header + target.read_bytes())
assert target.read_bytes().startswith(header + b'PK\x03\x04')
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert archive.namelist()[0] == root.name + '/'
print(f'{target.name}: 11 buttons + 3 encoders, relative icons, placeholder device ID; archive OK')

plugin_zip = base / 'dist/com.ulanzi.orcanavigation.ulanziPlugin.zip'
with zipfile.ZipFile(plugin_zip) as archive:
    assert archive.testzip() is None
    packed = json.loads(archive.read('com.ulanzi.orcanavigation.ulanziPlugin/manifest.json'))
    assert packed['Version'] == plugin['Version']
bundle = base / f"dist/Orca-D200X-{plugin['Version']}.zip"
with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(plugin_zip, plugin_zip.name)
    archive.write(target, target.name)
    archive.write(base / 'presets/README.md', 'INSTALL.md')
    archive.write(base / 'LICENSE', 'LICENSE')
with zipfile.ZipFile(bundle) as archive:
    assert len(archive.namelist()) == 4 and archive.testzip() is None
    assert archive.read('LICENSE') == (base / 'LICENSE').read_bytes()
print(f'{bundle.name}: plugin ZIP + preset + INSTALL.md + LICENSE; archive OK')
