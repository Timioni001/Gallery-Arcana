"""Create a widely compatible MP4 and verify every encoded frame."""
from pathlib import Path
import subprocess,json,shutil,hashlib
r=Path(__file__).resolve().parents[1];src=r/'out/Gallery-Arcana-ZECATHON-render.mp4';out=r/'out/Gallery-Arcana-ZECATHON-1080p.mp4'
def run(a):return subprocess.run(a,check=True,capture_output=True,text=True)
run(['ffmpeg','-v','error','-y','-i',str(src),'-vf','scale=in_range=pc:out_range=tv,format=yuv420p','-c:v','libx264','-preset','fast','-crf','19','-profile:v','high','-level:v','4.1','-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(out)])
v=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]).stdout)
video=next(s for s in v['streams'] if s['codec_type']=='video');audio=next(s for s in v['streams'] if s['codec_type']=='audio')
assert (video['width'],video['height'],video['pix_fmt'])==(1920,1080,'yuv420p')
assert int(video['nb_frames'])==4200 and abs(float(v['format']['duration'])-140)<.1
assert audio['codec_name']=='aac'
run(['ffmpeg','-v','error','-i',str(out),'-f','null','-'])
raw=out.read_bytes();assert raw.find(b'moov')<raw.find(b'mdat')
caps=json.loads((r/'src/captions.json').read_text());assert len(caps)>20 and max(c['endMs'] for c in caps)<=140000
for c in caps:
 for forbidden in ['anonymous','untraceable','guaranteed','you own it','legal ownership','72 hours','24 hours','not verified','unverified']:assert forbidden not in c['text'].lower(),forbidden
stats={'durationSeconds':float(v['format']['duration']),'width':1920,'height':1080,'fps':video['r_frame_rate'],'frames':4200,'pixelFormat':video['pix_fmt'],'videoCodec':video['codec_name'],'audioCodec':audio['codec_name'],'fullDecode':'pass','fastStart':True,'burnedCaptions':True,'captionEntries':len(caps),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'sourceCommit':'502ece5','browserCapture':json.loads((r/'public/captures/verification.json').read_text()),'regtestEvidence':'Committed evidence reviewed; no new regtest execution during video production'}
(r/'docs/export-verification.json').write_text(json.dumps(stats,indent=2)+'\n')
shutil.copyfile(r/'out/Gallery-Arcana-narration.srt',r/'out/Gallery-Arcana-ZECATHON.srt')
shutil.copyfile(r/'public/audio/narration.wav',r/'out/Gallery-Arcana-ZECATHON-narration.wav')
print(json.dumps({k:v for k,v in stats.items() if k!='browserCapture'},indent=2))
