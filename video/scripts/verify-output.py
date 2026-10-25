import subprocess,json
from pathlib import Path
r=Path(__file__).resolve().parents[1];p=r/'out/Gallery-Arcana-90s.mp4'
data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
v=next(s for s in data['streams'] if s['codec_type']=='video');a=next(s for s in data['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'])==(1920,1080)
assert v['r_frame_rate']=='30/1'
assert abs(float(data['format']['duration'])-90)<.08
assert int(v['nb_frames'])==2700
assert a['codec_name']=='aac'
subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True)
result={'duration':data['format']['duration'],'video':{k:v[k] for k in ['codec_name','width','height','r_frame_rate','nb_frames','pix_fmt']},'audio':{k:a[k] for k in ['codec_name','sample_rate','channels']},'fullDecode':'passed','sourceRevision':'728f3ce','wallet':'mock'}
(r/'docs/final-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
