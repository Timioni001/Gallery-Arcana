from pathlib import Path
import json,subprocess
r=Path(__file__).resolve().parents[1]
scenes=json.loads((r/'public/captures/scenes.json').read_text())
durations={'home':12,'alias':8,'market':12,'message':10,'invoice':13,'funded':10,'delivery':15,'terms':12,'privacy':13}
for name,d in durations.items():
 s=dict(next(s for s in scenes if s['name']==('decrypt' if name=='delivery' else name)));
 if name=='delivery':s['end']=next(x['end'] for x in scenes if x['name']=='accept')
 length=s['end']-s['start'];speed=min(1,(d-.3)/length)
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(s['start']),'-t',str(length),'-i',str(r/'out/raw/journey.webm'),'-vf',f'setpts={speed}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration={d}', '-t',str(d+.6),'-an','-c:v','libx264','-preset','fast','-crf','18',str(r/f'public/captures/{name}.mp4')],check=True)
