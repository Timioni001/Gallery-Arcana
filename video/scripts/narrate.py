"""Kokoro-82M v1.0, af_heart; independently timed scene narration."""
import os
os.environ['OMP_NUM_THREADS']='4'
import numpy as np, soundfile as sf, json, subprocess
from kokoro_onnx import Kokoro
from pathlib import Path
root=Path(__file__).resolve().parents[1]
segments=[
(0.8,7.5,'Gallery Arcana. A private market for digital work worth protecting.'),
(8.6,19.5,'Discover original work. Explore the collection, filter the market, and find something that matters to you.'),
(20.6,29.5,'Start with an alias. Create your encryption identity in the browser, where your private keys stay under your control.'),
(30.6,42.5,'Speak directly with the seller through encrypted messages. Agree on the terms privately. The platform still processes financial amounts.'),
(43.6,53.5,'Files are encrypted before upload. The seller prepares a key envelope for one buyer, ready before payment. Only ciphertext reaches storage.'),
(54.6,64.5,'Reserve the asset and fund the invoice. This recording uses simulated payments. Live Zcash settlement still requires verification.'),
(65.6,76.5,'Decrypt locally and verify the file. Accept to release funds, or dispute to freeze them. Otherwise, release follows the seventy-two-hour review window.'),
(77.5,83.5,'Share a signed acquisition claim with a chosen audience, without publishing your purchase history.'),
(84.5,89.7,'Gallery Arcana. Your work. Your conversations. Your keys.')]
k=Kokoro('/tmp/arcana-tts/model.onnx','/tmp/arcana-tts/voices.bin')
out=np.zeros(90*48000,dtype=np.float32)
from scipy.signal import resample_poly
meta=[]
for i,(start,end,text) in enumerate(segments):
 audio,sr=k.create(text,voice='af_heart',speed=1.0,lang='en-us')
 path=root/f'public/audio/voice-{i}.wav';sf.write(path,audio,sr)
 duration=len(audio)/sr
 # Only accelerate when necessary; each scene has a natural final pause.
 rate=max(1,duration/(end-start))
 processed=root/f'public/audio/voice-fit-{i}.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(path),'-af',f'atempo={rate:.5f},highpass=f=70,lowpass=f=15000,loudnorm=I=-18:TP=-2:LRA=7','-ar','48000','-ac','1',str(processed)],check=True)
 a,_=sf.read(processed);offset=round(start*48000);out[offset:offset+len(a)]+=a
 meta.append({'start':start,'end':start+len(a)/48000,'text':text,'rate':rate});print(i,len(a)/48000,flush=True)
sf.write(root/'public/audio/narration.wav',out,48000,subtype='PCM_24')
(root/'docs/narration.json').write_text(json.dumps(meta,indent=2))
