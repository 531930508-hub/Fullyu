"""Generate eight single-sided 65 x 125 mm tea cocktail cards."""
from pathlib import Path
import json
import shutil
from PIL import Image
from pypdf import PdfWriter
from vector_print import Font, Canvas

ROOT=Path(__file__).resolve().parent.parent
WORK=ROOT/'设计过程'
ASSETS=WORK/'茶卡素材'
OUT=ROOT/'茶酒卡_山野风物笺'
DATA=json.loads((WORK/'tea-cards-content.json').read_text())
COLORS={
    'paper':(0,.008,.027,.016),
    'ink':(0,0,0,.90),
    'body':(0,0,0,.82),
    'secondary':(0,0,0,.67),
    'accent':(0,.42,.55,.37),
    'rule':(0,0,0,.25),
}
FONTS={
    'hand':Font(WORK/'字体/LongCang-Regular.ttf'),
    'name':Font('/System/Library/Fonts/Supplemental/Songti.ttc',6),
    'sans':Font('/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc',3),
}


def prepare_art():
    source=ROOT/'vibe_images/monteveil-eight-nature-vignettes_1792778854745_1d465130.png'
    saved=ASSETS/'八幅意象_生成原图.png'
    if not saved.exists():shutil.copy2(source,saved)
    sheet=Image.open(saved).convert('RGB')
    cw,ch=sheet.width//4,sheet.height//2
    for i,card in enumerate(DATA['cards']):
        image=sheet.crop(((i%4)*cw,(i//4)*ch,(i%4+1)*cw,(i//4+1)*ch))
        transparent=[]
        for r,g,b in image.getdata():
            mn=min(r,g,b)
            if mn>=249:
                transparent.append((0,0,0,0))
            else:
                # Recover a watercolor pigment layer from its white ground.
                alpha=(255-mn)/255
                recovered=tuple(max(0,min(255,round((v-255*(1-alpha))/alpha))) for v in (r,g,b))
                transparent.append(recovered+(round(alpha*255),))
        rgba=Image.new('RGBA',image.size);rgba.putdata(transparent)
        # Exclude extremely pale border speckles when finding the motif bounds.
        # Keep the original translucent pigment inside the resulting crop.
        mask=rgba.getchannel('A').point(lambda x:255 if x>=24 else 0)
        box=mask.getbbox()
        assert box is not None
        box=(max(0,box[0]-8),max(0,box[1]-8),min(cw,box[2]+8),min(ch,box[3]+8))
        rgba.crop(box).save(ASSETS/f"{card['id']}_意象.png")


prepare_art()
allchecks=[]
trim_paths=[]
print_paths=[]
manifest=[]

for card in DATA['cards']:
    assert ''.join(card['poem_lines'])==card['poem'],('poem transcription',card['id'])
    canvas=Canvas(65,125,FONTS,COLORS,f"{card['name']} · 山野风物笺")
    canvas.text('山的微醺',7,7.8,'sans',5.4,'secondary',track=.8,role='series')
    canvas.text(f"{card['id']} / 08",58,7.8,'sans',5.2,'secondary',align='right',role='index')
    prefix=card['tea']+' ×' if card['tea'] else card['collection']
    canvas.text(prefix,7,15.4,'name',8.8,'body',track=.2,role='tea')
    canvas.text(card['cocktail'],6.3,29.3,'hand',28,'ink',track=1.5,role='title')

    art=ASSETS/f"{card['id']}_意象.png"
    im=Image.open(art)
    maxw,maxh=18,19
    scale=min(maxw/im.width,maxh/im.height)
    aw,ah=im.width*scale,im.height*scale
    canvas.image(art,49-aw/2,22.1-ah/2,aw,ah,'Nature')

    canvas.text(card['origin'],7,37.1,'sans',7.0,'secondary',width=51,role='origin')
    if card['method']:
        canvas.text(card['method'],7,41.5,'sans',7.2,'body',width=35,role='method')
    canvas.text(card['abv'],58,41.5,'sans',7.2,'body',align='right',role='abv')
    canvas.line(7,45.6,58,45.6,width=.3)

    for i,line in enumerate(card['poem_lines']):
        canvas.text(line,7,51.4+i*4.55,'name',8.6,'ink',width=51,role='poem')
    canvas.line(7,65.4,10.4,65.4,color='accent',width=.75)

    body_lines=FONTS['sans'].wrap(card['body'],8.4,51)
    for i,line in enumerate(body_lines):
        canvas.text(line,7,72.3+i*4.55,'sans',8.4,'body',width=51,role='body')
    assert 72.3+(len(body_lines)-1)*4.55<105.3,('body overflow',card['name'],len(body_lines))
    assert ''.join(body_lines)==card['body']

    canvas.line(7,109.5,58,109.5,width=.3)
    logo=WORK/'山醒logo_透明底.png'
    logoim=Image.open(logo)
    lw=15.3;lh=lw*logoim.height/logoim.width
    canvas.image(logo,7,111.4,lw,lh,'Logo')
    canvas.text(card['section']+' · '+card['section_caption'],58,116.6,'sans',5.6,'secondary',align='right',role='category')
    canvas.check_collisions()

    stem=f"{card['id']}_{card['name'].replace(' ','')}"
    preview=ASSETS/f'{stem}_预览.pdf'
    production=OUT/'单张印刷'/f'{stem}_65x125mm_3mm出血.pdf'
    svg=OUT/'矢量稿'/f'{stem}_矢量转曲.svg'
    canvas.pdf(preview,bleed=0)
    canvas.pdf(production,bleed=3)
    canvas.svg(svg)
    trim_paths.append(preview);print_paths.append(production)
    allchecks.append({'id':card['id'],'name':card['name'],'body_lines':body_lines,'runs':canvas.runs,'images':[{'name':key,**rect} for key,img,rect in canvas.images]})
    manifest.append({'id':card['id'],'name':card['name'],'pdf':str(preview),'print_pdf':str(production),'svg':str(svg),'png':str(OUT/'高清预览'/f'{stem}_300dpi.png')})
    print(f"PASS {card['id']} {card['name']}: body {len(body_lines)} lines, all copy preserved; image/text boundaries valid")

for files,target in [(trim_paths,OUT/'山野风物笺_八款茶卡_65x125mm_预览.pdf'),(print_paths,OUT/'山野风物笺_八款茶卡_65x125mm_印刷_3mm出血.pdf')]:
    writer=PdfWriter()
    for f in files:writer.append(str(f))
    writer.add_metadata({'/Title':'山野风物笺 · 八款茶酒卡','/Author':'山醒 MONTEVEIL','/Subject':'Eight single-sided cards, 65 x 125 mm, outlined text, CMYK'})
    with target.open('wb') as f:writer.write(f)

(WORK/'tea-card-layout-checks.json').write_text(json.dumps(allchecks,ensure_ascii=False,indent=2),encoding='utf-8')
(WORK/'tea-card-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'茶卡文案源.json').write_text(json.dumps(DATA,ensure_ascii=False,indent=2),encoding='utf-8')
template={
    'name':'山野风物笺','trim_mm':[65,125],'bleed_mm':3,'sides':1,'safe_margin_mm':5,
    'column_mm':[7,58], 'title_pt':28,'poem_pt':8.6,'body_pt':8.4,'body_leading_mm':4.55,
    'body_baseline_mm':72.3,'footer_rule_mm':109.5,'art_max_box_mm':[18,19],
    'fonts':{k:f.name for k,f in FONTS.items()},'colors_cmyk':COLORS,
    'copy_policy':'Preserve supplied copy. The Liuzhan ~12% value was confirmed by the user. Six-selection descriptions refer to the first six classic tea cocktails, excluding the two after-tea drinks.',
    'art_policy':'AI-generated nature imagery illustrates poetic tasting associations, not an ingredient list.',
    'status':'Structural checks passed. Rendering and visual review pending.',
}
(WORK/'tea-card-template.json').write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding='utf-8')
print('Generated eight single-sided cards and two eight-page collections.')
