"""Small vector print engine: outlined fonts, CMYK images, exact trim/bleed boxes."""
from pathlib import Path
import base64
import io
from xml.sax.saxutils import escape
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject, RectangleObject

PT = 72 / 25.4


def num(v):
    return f'{v:.6f}'.rstrip('0').rstrip('.') or '0'


class PDFPen(BasePen):
    def __init__(self, gs):
        super().__init__(gs)
        self.ops = []

    def _moveTo(self, p):
        self.ops.append(f'{num(p[0])} {num(p[1])} m')

    def _lineTo(self, p):
        self.ops.append(f'{num(p[0])} {num(p[1])} l')

    def _curveToOne(self, p1, p2, p3):
        self.ops.append(' '.join(num(v) for p in (p1,p2,p3) for v in p)+' c')

    def _closePath(self):
        self.ops.append('h')

    def _endPath(self):
        pass


class Font:
    def __init__(self, path, index=0):
        self.f = TTFont(str(path), fontNumber=index)
        self.cm = self.f.getBestCmap()
        self.gs = self.f.getGlyphSet()
        self.upm = self.f['head'].unitsPerEm
        self.name = self.f['name'].getDebugName(6) or self.f['name'].getDebugName(1)
        self.cache = {}

    def glyph(self, ch):
        if ch not in self.cache:
            if ord(ch) not in self.cm:
                raise ValueError(f'Missing glyph {ch!r} in {self.name}')
            name = self.cm[ord(ch)]
            svg, pdf, bounds = SVGPathPen(self.gs), PDFPen(self.gs), BoundsPen(self.gs)
            for pen in (svg,pdf,bounds):
                self.gs[name].draw(pen)
            self.cache[ch] = (svg.getCommands(), '\n'.join(pdf.ops), self.f['hmtx'][name][0], bounds.bounds)
        return self.cache[ch]

    def width(self, s, size, track=0):
        return sum(self.glyph(c)[2] for c in s)/self.upm*size + max(0,len(s)-1)*track

    def wrap(self, s, size, width_mm):
        """Greedy CJK wrap with kinsoku-style punctuation and paired-dash handling."""
        closing = set('，。！？：；、）》」』】％%…—')
        opening = set('（《「『【')
        lines = []
        remaining = s
        while remaining:
            n = 0
            for k in range(1,len(remaining)+1):
                if self.width(remaining[:k],size) <= width_mm*PT:
                    n = k
                else:
                    break
            assert n, 'Column too narrow'
            if n < len(remaining):
                while n > 1 and (remaining[n] in closing or remaining[n-1] in opening):
                    n -= 1
                if remaining[n-1] == '—' and remaining[n] == '—':
                    n -= 1
            lines.append(remaining[:n])
            remaining = remaining[n:]
        assert ''.join(lines) == s
        return lines


class Canvas:
    def __init__(self, w_mm, h_mm, fonts, colors, title):
        self.w, self.h = w_mm, h_mm
        self.W, self.H = w_mm*PT, h_mm*PT
        self.fonts, self.colors, self.title = fonts, colors, title
        self.pdf_ops, self.svg_ops, self.images, self.runs = [],[],[],[]

    def rgb(self, key):
        c,m,y,k = self.colors[key]
        return tuple(round(255*(1-v)*(1-k)) for v in (c,m,y))

    def css(self, key):
        return '#%02x%02x%02x' % self.rgb(key)

    def fill(self, key):
        return ' '.join(num(v) for v in self.colors[key])+' k'

    def text(self, s, x, y, font='sans', size=8.4, color='body', track=0, align='left', width=None, role='text'):
        face = self.fonts[font]
        textwidth = face.width(s,size,track)
        xp, yp = x*PT, y*PT
        if align == 'right': xp -= textwidth
        if align == 'center': xp -= textwidth/2
        if width is not None:
            assert textwidth <= width*PT + .001, (s, textwidth/PT, width)
        startx = xp
        self.svg_ops.append(f'<g aria-label="{escape(s)}" fill="{self.css(color)}">')
        self.pdf_ops.append(self.fill(color))
        scale = size/face.upm
        boxes = []
        for ch in s:
            sp,pp,adv,b = face.glyph(ch)
            if sp:
                self.svg_ops.append(f'<path d="{sp}" transform="translate({num(xp)} {num(yp)}) scale({num(scale)} {num(-scale)})"/>')
                self.pdf_ops.append(f'q {num(scale)} 0 0 {num(scale)} {num(xp)} {num(self.H-yp)} cm\n{pp}\nf Q')
            if b:
                boxes.append(((xp+b[0]*scale)/PT,(yp-b[3]*scale)/PT,(xp+b[2]*scale)/PT,(yp-b[1]*scale)/PT))
            xp += adv*scale+track
        self.svg_ops.append('</g>')
        bbox = [min(a[0] for a in boxes),min(a[1] for a in boxes),max(a[2] for a in boxes),max(a[3] for a in boxes)] if boxes else None
        if bbox:
            assert bbox[0]>=5 and bbox[1]>=5 and bbox[2]<=self.w-5 and bbox[3]<=self.h-5, (s,'outside safety',bbox)
        self.runs.append({'text':s,'font':face.name,'size_pt':size,'x_mm':startx/PT,'baseline_mm':y,'bbox_mm':bbox,'role':role})

    def line(self, x1,y1,x2,y2, color='rule', width=.3):
        self.pdf_ops.append(' '.join(num(v) for v in self.colors[color])+' K')
        self.pdf_ops.append(f'{num(width)} w {num(x1*PT)} {num(self.H-y1*PT)} m {num(x2*PT)} {num(self.H-y2*PT)} l S')
        self.svg_ops.append(f'<path d="M{num(x1*PT)} {num(y1*PT)} L{num(x2*PT)} {num(y2*PT)}" fill="none" stroke="{self.css(color)}" stroke-width="{width}"/>')

    def image(self, file, x,y,w,h, key):
        im = Image.open(file).convert('RGBA')
        rgb = Image.new('RGB',im.size,self.rgb('paper'))
        rgb.paste(im,mask=im.getchannel('A'))
        # Gray component replacement keeps ink coverage moderate on uncoated stock.
        pixels=[]
        for rr,gg,bb in rgb.getdata():
            c,m,yy=255-rr,255-gg,255-bb
            k=round(min(c,m,yy)*.8)
            pixels.append((c-k,m-k,yy-k,k))
        cmyk=Image.new('CMYK',rgb.size); cmyk.putdata(pixels)
        self.images.append((key,cmyk,{'x_mm':x,'y_mm':y,'width_mm':w,'height_mm':h,'dpi':round(im.width/(w/25.4))}))
        self.pdf_ops.append(f'q {num(w*PT)} 0 0 {num(h*PT)} {num(x*PT)} {num(self.H-(y+h)*PT)} cm /{key} Do Q')
        buf=io.BytesIO();im.save(buf,format='PNG')
        self.svg_ops.append(f'<image x="{num(x*PT)}" y="{num(y*PT)}" width="{num(w*PT)}" height="{num(h*PT)}" href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/>')
        assert x>=5 and y>=5 and x+w<=self.w-5 and y+h<=self.h-5,('image safety',key)
        assert im.width/(w/25.4)>=300 and im.height/(h/25.4)>=300,('image resolution',key)

    def check_collisions(self):
        for i,a in enumerate(self.runs):
            for b in self.runs[i+1:]:
                x,y=a['bbox_mm'],b['bbox_mm']
                if x and y:
                    dx=min(x[2],y[2])-max(x[0],y[0]);dy=min(x[3],y[3])-max(x[1],y[1])
                    assert not (dx>.08 and dy>.08),('text collision',a['text'],b['text'])
        for key,im,rect in self.images:
            y=[rect['x_mm'],rect['y_mm'],rect['x_mm']+rect['width_mm'],rect['y_mm']+rect['height_mm']]
            for a in self.runs:
                x=a['bbox_mm']
                if x:
                    dx=min(x[2],y[2])-max(x[0],y[0]);dy=min(x[3],y[3])-max(x[1],y[1])
                    assert not(dx>.08 and dy>.08),('image/text collision',key,a['text'])

    def pdf(self, path, bleed=0):
        writer=PdfWriter();b=bleed*PT
        page=writer.add_blank_page(width=self.W+2*b,height=self.H+2*b)
        page.trimbox=RectangleObject([b,b,b+self.W,b+self.H])
        page.bleedbox=RectangleObject([0,0,self.W+2*b,self.H+2*b])
        xobjects=DictionaryObject()
        for key,im,rect in self.images:
            obj=DecodedStreamObject();obj.set_data(im.tobytes())
            obj.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Image'),NameObject('/Width'):NumberObject(im.width),NameObject('/Height'):NumberObject(im.height),NameObject('/ColorSpace'):NameObject('/DeviceCMYK'),NameObject('/BitsPerComponent'):NumberObject(8)})
            xobjects[NameObject('/'+key)]=writer._add_object(obj.flate_encode())
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/XObject'):xobjects})
        stream=DecodedStreamObject()
        content=[self.fill('paper'),f'0 0 {num(self.W+2*b)} {num(self.H+2*b)} re f',f'q 1 0 0 1 {num(b)} {num(b)} cm']+self.pdf_ops+['Q']
        stream.set_data('\n'.join(content).encode('ascii'))
        page[NameObject('/Contents')]=writer._add_object(stream.flate_encode())
        writer.add_metadata({'/Title':self.title,'/Author':'山醒 MONTEVEIL','/Subject':f'{self.w} x {self.h} mm; {bleed} mm bleed; CMYK; outlined lettering'})
        with Path(path).open('wb') as f:writer.write(f)

    def svg(self, path):
        output=f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}mm" height="{self.h}mm" viewBox="0 0 {num(self.W)} {num(self.H)}"><title>{escape(self.title)}</title><rect width="100%" height="100%" fill="{self.css("paper")}"/>'+''.join(self.svg_ops)+'</svg>'
        Path(path).write_text(output,encoding='utf-8')
