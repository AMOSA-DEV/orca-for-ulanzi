"""Rebuild the small navigation glyphs; preserve Orca's installed official app artwork."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'com.ulanzi.orcanavigation.ulanziPlugin/assets'
SCALE = 4
BG = '#101923'
TRANSPARENT = (0, 0, 0, 0)
WHITE = '#F1F6FA'
BLUE = '#68C8FF'

def canvas():
    image = Image.new('RGBA', (196*SCALE, 196*SCALE), TRANSPARENT)
    return image, ImageDraw.Draw(image)

def line(draw, points, color, width=7):
    draw.line([(x*SCALE, y*SCALE) for x,y in points], fill=color, width=width*SCALE, joint='curve')
    r=width*SCALE/2
    for x,y in [points[0],points[-1]]:
        draw.ellipse((x*SCALE-r,y*SCALE-r,x*SCALE+r,y*SCALE+r),fill=color)

def save(image, name):
    image.resize((196,196), Image.Resampling.LANCZOS).save(ASSETS / name)

for previous in [True, False]:
    image, draw = canvas()
    for y in [63, 98, 133]:
        line(draw, [(34,y),(74,y)], '#7690A3', 6)
    line(draw, [(124,55),(124,141)], WHITE, 9)
    if previous:
        line(draw, [(101,78),(124,55),(147,78)], BLUE, 9)
    else:
        line(draw, [(101,118),(124,141),(147,118)], BLUE, 9)
    save(image, 'workspacePrevious.png' if previous else 'workspaceNext.png')

for previous in [True, False]:
    image, draw = canvas()
    # A browser-style tab strip, with the destination tab highlighted.
    for x, active in [(31,previous),(100,not previous)]:
        color = BLUE if active else '#7690A3'
        box=tuple(v*SCALE for v in [x,47,x+65,95])
        draw.rounded_rectangle(box,radius=8*SCALE,outline=color,width=5*SCALE)
        line(draw,[(x+13,63),(x+43,63)],color,4)
    y=133
    line(draw, [(49,y),(147,y)], WHITE, 8)
    x=49 if previous else 147
    tail=x+22 if previous else x-22
    line(draw, [(tail,y-21),(x,y),(tail,y+21)], BLUE, 8)
    save(image, 'chatPrevious.png' if previous else 'chatNext.png')

# Preserve the checked-in Orca app artwork and its attribution.
# Dial icons use the same source glyphs with both navigation directions.
for name, left, right in [('workspaceDial.png', 'workspacePrevious.png', 'workspaceNext.png'),
                          ('chatDial.png', 'chatPrevious.png', 'chatNext.png')]:
    image = Image.new('RGBA', (196,196), TRANSPARENT)
    for x, source in [(0,left), (98,right)]:
        glyph = Image.open(ASSETS/source).resize((98,98), Image.Resampling.LANCZOS)
        image.alpha_composite(glyph, (x,49))
    image.save(ASSETS/name)
# Shortcut glyphs share the navigation palette and transparent canvas.
for name in ['leftPanel', 'rightPanel', 'confirm', 'cancel', 'dictation', 'newAgent']:
    image, draw = canvas()
    if name in ['leftPanel', 'rightPanel']:
        draw.rounded_rectangle(tuple(v*SCALE for v in [36,45,160,151]), radius=8*SCALE, outline=WHITE, width=6*SCALE)
        x=73 if name=='leftPanel' else 123
        line(draw,[(x,47),(x,149)],BLUE,7)
    elif name=='confirm':
        line(draw,[(148,55),(148,112),(51,112)],WHITE,9)
        line(draw,[(77,86),(51,112),(77,138)],BLUE,9)
    elif name=='cancel':
        line(draw,[(58,58),(138,138)],WHITE,10)
        line(draw,[(138,58),(58,138)],BLUE,10)
    elif name=='dictation':
        draw.rounded_rectangle(tuple(v*SCALE for v in [78,36,118,113]),radius=20*SCALE,outline=WHITE,width=7*SCALE)
        draw.arc(tuple(v*SCALE for v in [59,66,137,137]),0,180,fill=BLUE,width=7*SCALE)
        line(draw,[(98,137),(98,160)],WHITE,7)
        line(draw,[(77,160),(119,160)],WHITE,7)
    else:
        draw.rounded_rectangle(tuple(v*SCALE for v in [36,46,160,151]),radius=8*SCALE,outline=WHITE,width=6*SCALE)
        line(draw,[(38,74),(158,74)],WHITE,5)
        line(draw,[(98,94),(98,134)],BLUE,7)
        line(draw,[(78,114),(118,114)],BLUE,7)
    save(image,name+'.png')
image, draw = canvas()
draw.rounded_rectangle(tuple(v*SCALE for v in [65,32,131,164]),radius=30*SCALE,outline=WHITE,width=7*SCALE)
line(draw,[(98,54),(98,82)],BLUE,7)
for x, upward in [(36,True),(160,False)]:
    line(draw,[(x,67),(x,129)],WHITE,5)
    y=67 if upward else 129
    tail=y+16 if upward else y-16
    line(draw,[(x-12,tail),(x,y),(x+12,tail)],BLUE,5)
save(image,'wheelDial.png')
for file in ASSETS.glob('*.png'):
    with Image.open(file) as im:
        assert im.size == (196,196)
        assert im.mode == 'RGBA' and im.getextrema()[3] == (0,255), file
preview = Image.new('RGBA', (196*5,196), BG)
for i,name in enumerate(['orca.png','workspacePrevious.png','workspaceNext.png','chatPrevious.png','chatNext.png']):
    preview.alpha_composite(Image.open(ASSETS/name),(i*196,0))
(ROOT / 'dist').mkdir(exist_ok=True)
preview.convert('RGB').save(ROOT / 'dist/icons-preview.png')
