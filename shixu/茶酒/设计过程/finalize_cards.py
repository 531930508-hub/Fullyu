"""Render, assemble previews, and validate the eight-card delivery."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parent.parent
WORK=ROOT/'设计过程'
OUT=ROOT/'茶酒卡_山野风物笺'
manifest=json.loads((WORK/'tea-card-manifest.json').read_text())
source=json.loads((WORK/'tea-cards-content.json').read_text())
checks=json.loads((WORK/'tea-card-layout-checks.json').read_text())
exe=WORK/'茶卡素材/render_pdf'


def render(card):
    result=subprocess.run([str(exe),card['pdf'],card['png'],'300'],capture_output=True,text=True,check=True)
    return result.stdout.strip()


with ThreadPoolExecutor(max_workers=3) as pool:
    for message in pool.map(render,manifest):print(message)
subprocess.run([str(exe),manifest[0]['print_pdf'],str(WORK/'茶卡素材/首卡出血核验.png'),'300'],check=True)

song='/System/Library/Fonts/Supplemental/Songti.ttc'
sans='/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc'
heading=ImageFont.truetype(song,32,index=6)
small=ImageFont.truetype(song,20,index=6)
cardw=360;cardh=round(cardw*125/65);gap=38;top=106;rowgap=75
bw=gap+4*(cardw+gap);bh=top+2*(cardh+rowgap)
board=Image.new('RGB',(bw,bh),'#e4e1db');draw=ImageDraw.Draw(board)
draw.text((gap,24),'山的微醺 · 山野风物笺',font=heading,fill='#353833')
draw.text((bw-gap,36),'65 × 125 mm · 单面 · 八款',font=small,fill='#62665d',anchor='ra')
for i,card in enumerate(manifest):
    im=Image.open(card['png']).convert('RGB').resize((cardw,cardh),Image.Resampling.LANCZOS)
    x=gap+(i%4)*(cardw+gap);y=top+(i//4)*(cardh+rowgap)
    board.paste(im,(x,y));draw.text((x,y+cardh+17),card['id']+'  '+card['name'],font=small,fill='#484c44')
board.save(OUT/'八款茶卡总览.jpg',quality=97)

# A compact, readable visual recipe makes the style template reusable.
guide=Image.new('RGB',(1420,1550),'#e4e1db');d=ImageDraw.Draw(guide)
titlefont=ImageFont.truetype(song,40,index=6)
sectionfont=ImageFont.truetype(song,31,index=6)
bodyfont=ImageFont.truetype(sans,22,index=3)
d.text((65,40),'山野风物笺 · 单面茶卡模板',font=titlefont,fill='#343730')
d.text((65,100),'成品 65 × 125 mm   /   四边出血 3 mm   /   安全边距 5 mm',font=bodyfont,fill='#64675e')
sample=Image.open(manifest[3]['png']).convert('RGB').resize((650,1250),Image.Resampling.LANCZOS)
guide.paste(sample,(65,190))
annotations=[
    (225,'01  页首与酒名',['小字号系列标识与序号。','茶名 8.8 pt 宋体 × 酒名 28 pt 龙藏体。','一款一幅小意象，不承担配料说明。']),
    (540,'02  茶底与酒体',['正文栏宽 51 mm，左右边距各 7 mm。','产地、类型与酒精度使用 7–7.2 pt。','酒精度统一靠右，便于快速辨识。']),
    (705,'03  情境引句',['8.6 pt 宋体，按语意断行。','保留原文标点，不以图片生成文字。','少量赭色短线作为段落间的停顿。']),
    (925,'04  品饮描述',['8.4 pt 苹方，行距 4.55 mm。','完整保留原文，采用自然左对齐。','不强行两端对齐，不压缩字距。']),
    (1250,'05  固定落款',['同一基线的品牌标志与清／浓／夜分类。','纸面保持干净，不叠加仿纸噪点。','全部字体转曲，避免印刷替换字形。']),
]
for y,title,lines in annotations:
    d.line((760,y+15,795,y+15),fill='#a27357',width=3)
    d.text((825,y),title,font=sectionfont,fill='#3b3e36')
    for j,line in enumerate(lines):d.text((825,y+49+j*35),line,font=bodyfont,fill='#64675e')
for x,color,label in [(825,'#fbf9f4','暖白'),(995,'#30322e','墨色'),(1165,'#a15d48','赭色')]:
    d.rectangle((x,1432,x+30,1462),fill=color)
    d.text((x+41,1430),label,font=bodyfont,fill='#55594f')
guide.save(OUT/'风格与版式模板.png')

# Machine-check the actual delivered files and their source-to-vector mapping.
assert source==json.loads((OUT/'茶卡文案源.json').read_text())
assert len(source['cards'])==8 and len(manifest)==8
assert source['cards'][6]['abv']=='约 12%' and source['cards'][6]['abv_confirmed'] is True
ns={'s':'http://www.w3.org/2000/svg'}
pt=72/25.4
printbook=PdfReader(OUT/'山野风物笺_八款茶卡_65x125mm_印刷_3mm出血.pdf')
previewbook=PdfReader(OUT/'山野风物笺_八款茶卡_65x125mm_预览.pdf')
assert len(printbook.pages)==len(previewbook.pages)==8
report=[]
for card,m,ck in zip(source['cards'],manifest,checks):
    runs=ck['runs']
    assert ''.join(r['text'] for r in runs if r['role']=='body')==card['body']
    assert ''.join(r['text'] for r in runs if r['role']=='poem')==card['poem']
    for role,field in [('title','cocktail'),('origin','origin'),('abv','abv')]:
        assert [r['text'] for r in runs if r['role']==role]==[card[field]]
    if card['method']:assert [r['text'] for r in runs if r['role']=='method']==[card['method']]
    if card['tea']:assert [r['text'] for r in runs if r['role']=='tea']==[card['tea']+' ×']
    root=ET.parse(m['svg']).getroot()
    assert root.attrib['width']=='65mm' and root.attrib['height']=='125mm'
    assert not root.findall('.//s:text',ns)
    labels=[g.attrib['aria-label'] for g in root.findall('.//s:g',ns)]
    assert labels==[r['text'] for r in runs]
    for key,expected in [('pdf',[65,125]),('print_pdf',[71,131])]:
        reader=PdfReader(m[key]);assert len(reader.pages)==1
        p=reader.pages[0]
        dims=[round(float(v)/pt,4) for v in (p.mediabox.width,p.mediabox.height)]
        trim=[round(float(v)/pt,4) for v in (p.trimbox.width,p.trimbox.height)]
        assert dims==expected and trim==[65,125]
        assert not p['/Resources'].get('/Font')
        for img in p['/Resources']['/XObject'].values():assert img.get_object()['/ColorSpace']=='/DeviceCMYK'
        stream=p.get_contents().get_data();assert b' rg' not in stream and b' RG' not in stream
        book=printbook if key=='print_pdf' else previewbook
        assert stream==book.pages[int(card['id'])-1].get_contents().get_data(),('page order',card['id'])
    image=Image.open(m['png']);assert image.size==(768,1476) and abs(image.info['dpi'][0]-300)<.1
    assert min(im['dpi'] for im in ck['images'])>=300
    for r in runs:
        b=r['bbox_mm']
        if b:assert b[0]>=5 and b[1]>=5 and b[2]<=60 and b[3]<=120
    report.append({'id':card['id'],'name':card['name'],'copy':'PASS','pdf_boxes':'PASS','page_order':'PASS','fonts_and_colors':'PASS','svg':'PASS','png':'PASS','minimum_image_dpi':min(im['dpi'] for im in ck['images'])})
    print('VERIFIED',card['id'],card['name'])
result={'cards':report,'count':8,'format':'65 x 125 mm, single-sided','bleed_mm':3,'copy':'All supplied prose retained; Liuzhan ABV confirmed and set to approximately 12%.','physical_proof':'Not performed. Printer should confirm stock and ICC/output profile. Not claimed as PDF/X.','visual_review':'All eight original rendered cards reviewed; final motif-crop refinement awaiting overview review.'}
(WORK/'tea-card-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('ALL DELIVERY CHECKS PASSED')
