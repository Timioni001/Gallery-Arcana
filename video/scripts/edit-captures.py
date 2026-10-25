from pathlib import Path
import json,subprocess
p=Path(__file__).resolve().parents[1]/'public/captures';scenes={s['name']:s for s in json.loads((p/'scenes.json').read_text())}
# Preserve actual UI actions; retime only footage, never fabricate results.
shots=[('market','market',12.6),('request','keys',10.6),('message','messages',13.6),('checkout','checkout',11.6),('passport','passport',7.6)]
for scene,name,length in shots:
 s=scenes[scene];duration=s['end']-s['start'];rate=min(1,(length-.5)/duration)
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(s['start']),'-t',str(duration),'-i',str(p/(s['actor']+'-raw.webm')),'-vf',f'setpts={rate}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=3','-t',str(length),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-an',str(p/(name+'.mp4'))],check=True)
s=scenes['decrypt'];end=scenes['accept']['end'];duration=end-s['start']
subprocess.run(['ffmpeg','-v','error','-y','-ss',str(s['start']),'-t',str(duration),'-i',str(p/'buyer-raw.webm'),'-vf',f'setpts={12.4/duration}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=1','-t','12.6','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-an',str(p/'delivery.mp4')],check=True)
