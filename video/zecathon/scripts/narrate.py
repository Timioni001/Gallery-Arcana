"""Generate sentence-timed narration and captions; no guessed word timestamps."""
import os
os.environ['OMP_NUM_THREADS']='4'
from pathlib import Path
import json, subprocess
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT=Path(__file__).resolve().parents[1]
MODEL=Path(os.environ.get('KOKORO_MODEL_DIR','/workspace/arcana-tts-models'))
SCENES=[
(0.5,11.7,['Gallery Arcana is a private market for digital goods, powered by Zcash.','This is the hosted demo: payments are simulated.','Seal. Pay. Verify. Release.']),
(12.4,19.7,['Create an alias and a passphrase.','No email or ID.','Your encryption keys are created in your browser.']),
(20.4,31.7,['Browse public previews and choose an Arcana Fragment.','The original is an encrypted capsule, with a key sealed to its buyer.','Sample sellers are automated. Payments are simulated.']),
(32.4,41.7,['Ask the seller a question through end-to-end encrypted chat.','This sample seller replies automatically.','The platform still processes financial offer amounts.']),
(42.4,54.7,['Checkout creates an exact ZEC amount, a single-use payment address, an invoice memo, and a ZIP three twenty-one request.','The demo simulates this payment. No real ZEC moves.']),
(55.4,64.7,['The order is funded. The platform holds the funds in escrow.','The fallback is one hour, shortened to ten minutes in this demo.']),
(65.4,79.7,['Tap Decrypt locally and verify.','The browser opens the sealed key and checks the file’s SHA two fifty-six.','A match turns the order Paid instantly.','Verifying is the acceptance. The seller’s payout is authorized, and a signed receipt records the sale.']),
(80.4,91.7,['If the buyer never opens the file, funds release after one hour.','A fingerprint mismatch never releases.','Disputes freeze funds; a reviewer decides within seven days: release or full refund.']),
(92.4,104.7,['In version one, the platform holds escrow funds and sees amounts and order metadata.','Client-side encryption protects files, keys, chat and dispute evidence.']),
(105.4,124.7,['Now, real settlement evidence.','The same purchase flow settled with real shielded transactions on real Zebra and Zallet, on local regtest.','The committed evidence records the buyer payment, the seller payout, and verified: true.','This is a private chain. Its coins have no value. It is not public testnet.']),
(125.4,134.7,['Regtest verified. Public testnet in progress. Mainnet disabled.','Next: direct seller payments and viewing-key observation.','Design only, not built.']),
(135.3,139.8,['Gallery Arcana.','Built for ZECATHON. Private Markets.'])
]
k=Kokoro(str(MODEL/'model.onnx'),str(MODEL/'voices.bin'))
out=np.zeros(140*48000,dtype=np.float32)
caps=[]; meta=[]; raw=ROOT/'out/voice';raw.mkdir(parents=True,exist_ok=True)
for i,(start,end,lines) in enumerate(SCENES):
 parts=[]
 for j,line in enumerate(lines):
  cache=raw/f'{i}-{j}.wav'; label=raw/f'{i}-{j}.txt'
  if cache.exists() and label.exists() and label.read_text()==line: audio,sr=sf.read(cache)
  else: audio,sr=k.create(line,voice='af_heart',speed=1,lang='en-us')
  label.write_text(line)
  # Remove only leading/trailing synthesis silence. Keep internal prosody intact.
  active=np.flatnonzero(np.abs(audio)>0.005)
  if len(active):audio=audio[max(0,active[0]-int(sr*.06)):min(len(audio),active[-1]+int(sr*.10))]
  parts.append((line,audio,sr))
 duration=sum(len(a)/sr for _,a,sr in parts)+.16*(len(parts)-1)
 rate=max(1,duration/(end-start-.08))
 if rate>1.14:raise RuntimeError(f'Scene {i} too wordy ({duration:.2f}s); revise copy instead of rushing: {rate:.2f}')
 position=start
 for j,(line,a,sr) in enumerate(parts):
  f=raw/f'{i}-{j}.wav';p=raw/f'{i}-{j}-fit.wav';sf.write(f,a,sr)
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(f),'-af',f'atempo={rate:.6f},highpass=f=70,lowpass=f=11000','-ar','48000','-ac','1',str(p)],check=True)
  processed,_=sf.read(p);off=round(position*48000);out[off:off+len(processed)]+=processed
  finish=position+len(processed)/48000
  caps.append({'text':line,'startMs':round(position*1000),'endMs':round(finish*1000),'timestampMs':None,'confidence':None})
  position=finish+.16/rate
 meta.append({'scene':i,'start':start,'end':position-.16/rate,'speed':rate,'text':' '.join(lines)})
 print(i,round(position-start,2),'seconds',round(rate,3),flush=True)
sf.write(raw/'assembled.wav',out,48000,subtype='PCM_24')
# Two-pass integrated normalization keeps sentence dynamics coherent.
measure=subprocess.run(['ffmpeg','-hide_banner','-i',str(raw/'assembled.wav'),'-af','loudnorm=I=-18:TP=-2:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
v=json.JSONDecoder().raw_decode(measure[measure.rfind('{'):])[0]
flt=f"loudnorm=I=-18:TP=-2:LRA=7:measured_I={v['input_i']}:measured_TP={v['input_tp']}:measured_LRA={v['input_lra']}:measured_thresh={v['input_thresh']}:offset={v['target_offset']}:linear=true"
subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw/'assembled.wav'),'-af',flt,'-ar','48000','-c:a','pcm_s24le',str(ROOT/'public/audio/narration.wav')],check=True)
(ROOT/'src/captions.json').write_text(json.dumps(caps,indent=2))
(ROOT/'docs/narration.json').write_text(json.dumps(meta,indent=2))
def stamp(ms):
 s,ms=divmod(ms,1000);m,s=divmod(s,60);h,m=divmod(m,60)
 return f'{h:02}:{m:02}:{s:02},{ms:03}'
(ROOT/'out/Gallery-Arcana-narration.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['startMs'])} --> {stamp(c['endMs'])}\n{c['text']}" for i,c in enumerate(caps))+'\n')
