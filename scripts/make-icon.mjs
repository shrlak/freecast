// Builds build/icon.png (1024×1024) — the KCCP emblem (green square + yellow cross panel)
// cut from public/backgrounds/church-logo.jpg onto a white rounded tile — and copies it to
// electron/icon.png (window/Dock icon) and public/favicon.png.
// electron-builder turns build/icon.png into the macOS .icns and Windows .ico.
// Needs python3 with Pillow (`pip3 install pillow`): `npm run icon`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const python = `
import sys
from PIL import Image, ImageDraw
src, out, fav = sys.argv[1:4]
S = 1024
logo = Image.open(src).convert('RGBA').crop((140, 336, 558, 704))
px = logo.load()
for y in range(logo.height):
    for x in range(logo.width):
        r, g, b, a = px[x, y]
        if r > 235 and g > 235 and b > 235: px[x, y] = (255, 255, 255, 0)
tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((80, 80, S - 80, S - 80), radius=190, fill=255)
tile.paste(Image.new('RGBA', (S, S), (255, 255, 255, 255)), (0, 0), mask)
ImageDraw.Draw(tile).rounded_rectangle((80, 80, S - 80, S - 80), radius=190, outline=(225, 228, 234, 255), width=3)
w = int(S * 0.66); h = round(logo.height * w / logo.width)
logo = logo.resize((w, h), Image.LANCZOS)
tile.alpha_composite(logo, ((S - w) // 2, (S - h) // 2))
tile.save(out)
tile.resize((256, 256), Image.LANCZOS).save(fav)
`;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')), 'make_icon.py');
fs.writeFileSync(script, python);
execFileSync('python3', ['-I', script, path.join(root, 'public/backgrounds/church-logo.jpg'), path.join(root, 'build/icon.png'), path.join(root, 'public/favicon.png')], { stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'build/icon.png'), path.join(root, 'electron/icon.png'));
console.log('wrote build/icon.png, electron/icon.png, public/favicon.png');
