"""Build the 105 x 210 mm Monteveil menu as vector PDF and SVG.
All type is outlined in the delivery artwork to avoid font substitution.
The JSON source retains editable menu copy. No original asset is overwritten.
"""
from pathlib import Path
import base64
import io
import json
import math
import re
import unicodedata
from xml.sax.saxutils import escape
from PIL import Image, ImageChops, ImageOps
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.svgPathPen import SVGPathPen
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject,
    NameObject, NumberObject, RectangleObject,
)

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / '设计过程'
OUT = ROOT / '山的微醺_新版'
DATA = json.loads((WORK / 'menu-content.json').read_text())
PT = 72 / 25.4
W, H = 105 * PT, 210 * PT
COLORS = {
    'paper': (0, 0.008, 0.027, 0.016),
    'ink': (0, 0, 0, 0.89),
    'body': (0, 0, 0, 0.77),
    'secondary': (0, 0, 0, 0.64),
    'accent': (0, 0.42, 0.55, 0.37),
    'rule': (0, 0, 0, 0.23),
}


def rgb(key):
    c, m, y, k = COLORS[key]
    return tuple(round(255 * (1-v) * (1-k)) for v in (c, m, y))


def css(key):
    return '#%02x%02x%02x' % rgb(key)


def fmt(v):
    return f'{v:.5f}'.rstrip('0').rstrip('.') or '0'


class PDFPen(BasePen):
    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.commands = []

    def _moveTo(self, p):
        self.commands.append(f'{fmt(p[0])} {fmt(p[1])} m')

    def _lineTo(self, p):
        self.commands.append(f'{fmt(p[0])} {fmt(p[1])} l')

    def _curveToOne(self, p1, p2, p3):
        self.commands.append(' '.join(fmt(v) for p in (p1, p2, p3) for v in p) + ' c')

    def _closePath(self):
        self.commands.append('h')

    def _endPath(self):
        pass


class Font:
    def __init__(self, path, index=0):
        self.font = TTFont(str(path), fontNumber=index)
        self.cmap = self.font.getBestCmap()
        self.glyphset = self.font.getGlyphSet()
        self.upm = self.font['head'].unitsPerEm
        self.cache = {}
        self.name = self.font['name'].getDebugName(6) or self.font['name'].getDebugName(1)

    def width(self, text, size, tracking=0):
        return sum(self.font['hmtx'][self.cmap[ord(c)]][0] for c in text) / self.upm * size + max(0, len(text)-1) * tracking

    def paths(self, ch):
        if ch not in self.cache:
            if ord(ch) not in self.cmap:
                raise ValueError(f'Missing glyph {ch!r} in {self.name}')
            glyph = self.cmap[ord(ch)]
            sp = SVGPathPen(self.glyphset)
            pp = PDFPen(self.glyphset)
            self.glyphset[glyph].draw(sp)
            self.glyphset[glyph].draw(pp)
            advance = self.font['hmtx'][glyph][0]
            self.cache[ch] = (sp.getCommands(), '\n'.join(pp.commands), advance)
        return self.cache[ch]


FONTS = {
    'hand': Font(WORK / '字体/LongCang-Regular.ttf'),
    'name': Font('/System/Library/Fonts/Supplemental/Songti.ttc', 6),
    'sans': Font('/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc', 3),
    'latin': Font('/System/Library/Fonts/Supplemental/Baskerville.ttc', 0),
}

pdf_ops = []
svg_ops = []
checks = []


def setfill(color):
    return ' '.join(fmt(x) for x in COLORS[color]) + ' k'


def text(s, x_mm, baseline_mm, font='sans', size=7.4, color='body', tracking=0, align='left', max_width_mm=None):
    face = FONTS[font]
    width = face.width(s, size, tracking)
    x = x_mm * PT
    y = baseline_mm * PT
    if align == 'right':
        x -= width
    elif align == 'center':
        x -= width / 2
    if max_width_mm is not None:
        assert width <= max_width_mm * PT + 0.01, (s, width / PT, max_width_mm)
    checks.append({'text': s, 'font': face.name, 'size_pt': size,
                   'x_mm': round(x / PT, 3), 'baseline_mm': baseline_mm,
                   'width_mm': round(width / PT, 3), 'role': font})
    assert x >= 5 * PT and x + width <= 100 * PT, (s, 'unsafe horizontal position')
    assert 6 < baseline_mm < 207, (s, 'unsafe vertical position')
    svg_ops.append(f'<g aria-label="{escape(s)}" fill="{css(color)}">')
    pdf_ops.append(setfill(color))
    scale = size / face.upm
    for ch in s:
        svgpath, pdfpath, advance = face.paths(ch)
        if svgpath:
            svg_ops.append(f'<path d="{svgpath}" transform="translate({fmt(x)} {fmt(y)}) scale({fmt(scale)} {fmt(-scale)})"/>')
            pdf_ops.append(f'q {fmt(scale)} 0 0 {fmt(scale)} {fmt(x)} {fmt(H-y)} cm\n{pdfpath}\nf Q')
        x += advance * scale + tracking
    svg_ops.append('</g>')


def line(x1, y1, x2, y2, color='rule', width=0.35):
    pdf_ops.append(' '.join(fmt(x) for x in COLORS[color]) + ' K')
    pdf_ops.append(f'{fmt(width)} w {fmt(x1*PT)} {fmt(H-y1*PT)} m {fmt(x2*PT)} {fmt(H-y2*PT)} l S')
    svg_ops.append(f'<path d="M{fmt(x1*PT)} {fmt(y1*PT)} L{fmt(x2*PT)} {fmt(y2*PT)}" stroke="{css(color)}" stroke-width="{width}" fill="none"/>')


def circle(x, y, r, color='accent'):
    # Four cubic segments; coordinates are in top-left page space.
    k = 0.55228475
    p = [(x+r,y),(x+r,y+r*k),(x+r*k,y+r),(x,y+r),
         (x-r*k,y+r),(x-r,y+r*k),(x-r,y),
         (x-r,y-r*k),(x-r*k,y-r),(x,y-r),
         (x+r*k,y-r),(x+r,y-r*k),(x+r,y)]
    cmds = [f'{fmt(p[0][0]*PT)} {fmt(H-p[0][1]*PT)} m']
    for i in range(1,13,3):
        cmds.append(' '.join(f'{fmt(a*PT)} {fmt(H-b*PT)}' for a,b in p[i:i+3])+' c')
    pdf_ops.append(setfill(color)+'\n'+'\n'.join(cmds)+' h f')
    svg_ops.append(f'<circle cx="{fmt(x*PT)}" cy="{fmt(y*PT)}" r="{fmt(r*PT)}" fill="{css(color)}"/>')


# Quiet editorial header: a human title, restrained metadata and one line of copy.
text('MONTEVEIL', 10, 10.0, 'sans', 5.8, 'ink', tracking=2.0)
text('TEA / SPIRITS', 95, 10.0, 'sans', 5.4, 'secondary', tracking=1.1, align='right')
text(DATA['title'], 9.5, 28.6, 'hand', 34, 'ink', tracking=3.0)
for ch, yy in zip('茶与酒', [20.3, 24.0, 27.7]):
    text(ch, 92.9, yy, 'sans', 6.7, 'secondary', align='center')
circle(92.9, 31.7, 0.7)
text(DATA['intro'], 10.5, 37.4, 'sans', 7.5, 'body', tracking=0.32)
line(10, 42.7, 95, 42.7)

# Baseline grid. The left rail carries chapter information, never product data.
section_rows = [[51, 68, 85, 102], [124, 141], [164, 181]]
for si, section in enumerate(DATA['sections']):
    yy = section_rows[si][0]
    text(section['name'], 10.0, yy + 1.0, 'hand', 19.5, 'accent')
    text(section['number'], 13.2, yy - 5.1, 'sans', 4.8, 'secondary', align='center')
    for j, caption in enumerate(section['caption']):
        text(caption, 13.2, yy + 7.0 + j*3.5, 'sans', 6.5, 'secondary', tracking=0.7, align='center')
    for item, baseline in zip(section['items'], section_rows[si]):
        text(item['name'], 25.0, baseline, 'name', 11, 'ink', tracking=0.2, max_width_mm=61)
        text(item['price'], 95, baseline-0.1, 'latin', 10.5, 'ink', tracking=0.2, align='right')
        text(item['ingredients'], 25.0, baseline+4.4, 'sans', 7.0, 'secondary', max_width_mm=70)
        text(item['description'], 25.0, baseline+8.8, 'sans', 7.4, 'body', max_width_mm=70)
    if si < 2:
        line(25, [115.0, 154.0][si], 95, [115.0, 154.0][si], width=0.3)

# Remove the original JPG's white rectangle without altering logo geometry.
original_logo = Image.open(ROOT / '山醒logo2.jpg').convert('RGB')
gray = ImageOps.grayscale(original_logo)
alpha = gray.point(lambda p: 0 if p > 238 else round(min(1, (238-p)/215)*255))
bbox = alpha.getbbox()
alpha = alpha.crop(bbox)
logo_rgba = Image.new('RGBA', alpha.size, rgb('ink')+(0,))
logo_rgba.putalpha(alpha)
logo_rgba.save(WORK / '山醒logo_透明底.png')

logo_x, logo_y, logo_w = 10.0, 195.1, 17.7
logo_h = logo_w * alpha.height / alpha.width
assert logo_y + logo_h <= 205, 'Logo must remain inside the 5 mm safety margin'
# A flattened CMYK raster prevents transparency-color conversion surprises.
flat = Image.new('CMYK', alpha.size, tuple(round(255*v) for v in COLORS['paper']))
solid = Image.new('CMYK', alpha.size, tuple(round(255*v) for v in COLORS['ink']))
flat.paste(solid, (0,0), alpha)
logo_buffer = io.BytesIO()
logo_rgba.save(logo_buffer, format='PNG')
svg_ops.append(f'<image x="{fmt(logo_x*PT)}" y="{fmt(logo_y*PT)}" width="{fmt(logo_w*PT)}" height="{fmt(logo_h*PT)}" href="data:image/png;base64,{base64.b64encode(logo_buffer.getvalue()).decode()}"/>')
pdf_ops.append(f'q {fmt(logo_w*PT)} 0 0 {fmt(logo_h*PT)} {fmt(logo_x*PT)} {fmt(H-(logo_y+logo_h)*PT)} cm /Logo Do Q')
line(38, 195.4, 95, 195.4, width=0.3)
text('茶  与  酒', 95, 200.6, 'sans', 6.7, 'secondary', tracking=0.4, align='right')
text('MONTEVEIL', 95, 204.5, 'sans', 5.0, 'secondary', tracking=1.4, align='right')


# Both delivery PDFs use the exact same artwork. The print edition adds bleed.
def build_pdf(destination, bleed_mm):
    writer = PdfWriter()
    b = bleed_mm * PT
    page = writer.add_blank_page(width=W+2*b, height=H+2*b)
    page.trimbox = RectangleObject([b,b,b+W,b+H])
    page.bleedbox = RectangleObject([0,0,W+2*b,H+2*b])
    page.cropbox = RectangleObject([0,0,W+2*b,H+2*b])
    img = DecodedStreamObject()
    img.set_data(flat.tobytes())
    img.update({NameObject('/Type'): NameObject('/XObject'), NameObject('/Subtype'):NameObject('/Image'),
                NameObject('/Width'):NumberObject(flat.width), NameObject('/Height'):NumberObject(flat.height),
                NameObject('/ColorSpace'):NameObject('/DeviceCMYK'), NameObject('/BitsPerComponent'):NumberObject(8)})
    img = img.flate_encode()
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/XObject'):DictionaryObject({NameObject('/Logo'):writer._add_object(img)})})
    contents = DecodedStreamObject()
    stream = [setfill('paper'), f'0 0 {fmt(W+2*b)} {fmt(H+2*b)} re f', f'q 1 0 0 1 {fmt(b)} {fmt(b)} cm']
    stream.extend(pdf_ops)
    stream.append('Q')
    contents.set_data('\n'.join(stream).encode('ascii'))
    page[NameObject('/Contents')] = writer._add_object(contents.flate_encode())
    writer.add_metadata({'/Title':'山的微醺 · 山野手札版', '/Author':'山醒 MONTEVEIL',
                         '/Subject':f'105 x 210 mm / {bleed_mm} mm bleed / outlined type / process CMYK',
                         '/Creator':'Monteveil menu vector layout'})
    with destination.open('wb') as f:
        writer.write(f)


build_pdf(OUT / '山的微醺_山野手札_105x210mm_预览.pdf', 0)
build_pdf(OUT / '山的微醺_山野手札_105x210mm_印刷_3mm出血.pdf', 3)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="105mm" height="210mm" viewBox="0 0 {fmt(W)} {fmt(H)}" role="img" aria-label="山醒茶酒单——山的微醺">
<title>山的微醺 · 山野手札版</title>
<desc>成品105×210mm，全部文字转为矢量轮廓。可修改文案保存在设计过程/menu-content.json。</desc>
<rect width="100%" height="100%" fill="{css('paper')}"/>
{''.join(svg_ops)}
</svg>'''
(OUT / '山的微醺_山野手札_矢量转曲.svg').write_text(svg, encoding='utf-8')
(WORK / 'layout-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')

# Exact content cross-check. PDF source uses Kangxi radicals; its mouth radical
# has a known U+2F1C ('again') mapping error. Compare semantic reading to artwork.
original = PdfReader(ROOT / '山的微醺_茶酒单_105x210mm_印刷版.pdf').pages[0].extract_text()
original = original.replace('\u2f1c', '口')
def normalized(s):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', s)).replace('–','-')
normalized_original = normalized(original)
for section in DATA['sections']:
    for item in section['items']:
        for key in ['name','ingredients','description']:
            assert normalized(item[key]) in normalized_original, (key,item[key],'not found in original')
        assert normalized(item['name']+item['price']) in normalized_original
assert sum(len(s['items']) for s in DATA['sections']) == 8
assert [i['price'] for s in DATA['sections'] for i in s['items']] == ['98']*6+['68','58']

report = {
    'content_check': 'PASS: all 8 names, all prices, all ingredients/ABVs and descriptions match original PDF reading',
    'source_text_normalization': 'Kangxi radical normalization; U+2F1C mapped to intended mouth radical 口; whitespace and dash normalization only',
    'trim_mm': [105,210], 'bleed_mm': 3, 'print_media_mm': [111,216],
    'colors': 'DeviceCMYK for all vectors and logo image; grayscale body text uses K only',
    'type': 'All delivery type outlined; no missing-font substitution possible',
    'body_size_pt': 7.4, 'ingredients_size_pt':7.0,
    'small_type_note': '4.8–6.7pt is limited to decorative chapter numbers, brand metadata and category captions',
    'logo_effective_dpi': round(flat.width / (logo_w/25.4)),
    'safe_margin_mm': 5, 'checked_text_runs':len(checks),
    'ICC_output_intent': 'Not assigned: printer and stock not specified; not claimed as PDF/X',
    'fonts': {k:v.name for k,v in FONTS.items()},
    'visual_inspection': 'Pending rendered PDF review',
}
(WORK / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
