#!/usr/bin/env python3
"""Original deterministic ambient score, synthesized for Gallery Arcana.

No samples, downloaded music, external model or copyrighted composition used.
90 seconds, 48 kHz stereo PCM. Regenerate: python3 scripts/make-score.py
"""
from pathlib import Path
import wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
SECONDS = 90
N = SR * SECONDS
RNG = np.random.default_rng(20261025)
mix = np.zeros((N, 2), dtype=np.float64)

def midi(n):
    return 440 * 2 ** ((n - 69) / 12)

def add(signal, at, gain=1, pan=0):
    start = round(at * SR)
    stop = min(N, start + len(signal))
    if start >= N or stop <= 0:
        return
    source = signal[max(0, -start):stop-start]
    start = max(0, start)
    angle = (pan + 1) * np.pi / 4
    mix[start:stop, 0] += gain * np.cos(angle) * source
    mix[start:stop, 1] += gain * np.sin(angle) * source

def times(duration):
    return np.arange(round(duration * SR)) / SR

def smooth(x):
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)

def pad(notes, at, duration=14, gain=.11):
    t = times(duration)
    env = smooth(t / 3) * smooth((duration-t) / 4)
    for k, note in enumerate(notes):
        f = midi(note)
        phase = RNG.uniform(0, 2*np.pi)
        # Very soft odd/even partials, two slow drifting voices per note.
        s = np.zeros(len(t))
        for det in [-.0014, .0016]:
            p = 2*np.pi*f*(1+det)*t + phase + .12*np.sin(2*np.pi*.13*t+k)
            s += np.sin(p) + .12*np.sin(2*p) + .035*np.sin(3*p)
        trem = .93 + .07*np.sin(2*np.pi*.09*t+k)
        add(s*env*trem/2, at, gain / np.sqrt(len(notes)), -.65+k*1.3/max(1,len(notes)-1))

def felt(note, at, gain=.09, pan=0, duration=3.2):
    t = times(duration)
    f = midi(note)
    # Rounded felt-piano/plucked resonance: near-harmonic and quickly softened.
    s = np.sin(2*np.pi*f*t)*np.exp(-t/1.3)
    s += .25*np.sin(2*np.pi*f*2.002*t)*np.exp(-t/.55)
    s += .07*np.sin(2*np.pi*f*3.005*t)*np.exp(-t/.23)
    env = smooth(t/.025)*smooth((duration-t)/.4)
    add(s*env, at, gain, pan)

def air(at, duration, gain=.006, reverse=False, pan=0):
    t = times(duration)
    noise = RNG.normal(0,1,len(t))
    noise = sosfilt(butter(2,[600,3200], btype='band', fs=SR, output='sos'),noise)
    env = np.sin(np.pi*t/duration)**2
    if reverse:
        env = smooth(t/duration)**2 * smooth((duration-t)/.07)
    add(noise*env,at,gain,pan)

# D minor 9 → F major 9 → C add 9 → G suspended; open voicings avoid clutter.
chords = [[50,57,60,64,69],[53,60,64,67,69],[48,55,60,62,67],[43,50,57,60,62]]
for j, at in enumerate(range(-2,90,8)):
    notes = chords[j%4]
    pad(notes,at,16,.10 if at < 14 else .115)
    pad([notes[0]-12],at,15,.035)

# Sparse opening notes blossom into a relaxed 80 BPM ostinato.
for j, at in enumerate([2.6,5.1,8.2,11.0,14.2,17.0]):
    felt([74,69,76,72,67,74][j],at,.075,(-1)**j*.35,4.5)

beat=.75
pattern=[0,2,4,1,3,2,4,1]
for j in range(88):
    at=20+j*beat
    if at>=85:
        break
    notes=chords[int((at+2)//8)%4]
    note=notes[pattern[j%8]]+12
    gain=.062*(.85+.15*np.sin(j*.77))
    if j%4==3:
        gain*=.6
    felt(note,at,gain,np.sin(j*1.3)*.45,3.4)

# Low soft heartbeat and paper-brush rhythm, understated beneath the pads.
for j in range(38):
    at=22+j*1.5
    t=times(.65)
    freq=49+11*np.exp(-t*18)
    ph=2*np.pi*np.cumsum(freq)/SR
    env=smooth(t/.014)*np.exp(-t*9)*smooth((.65-t)/.1)
    add(np.sin(ph)*env,at,.055,0)
    air(at+.75,.22,.015,pan=(-1)**j*.27)
    if j%2==0:
        air(at+1.125,.12,.008,pan=.4)

# Edited scene changes get an airy intake and a gentle harmonic bloom.
cuts=[8,20,30,43,54,65,77,84]
for k, at in enumerate(cuts):
    air(at-1.2,1.2,.025,True,(-1)**k*.3)
    air(at,.7,.012,False,(-1)**(k+1)*.2)
    notes=chords[int((at+2)//8)%4]
    felt(notes[2]+12,at,.10,-.2,5)
    felt(notes[4]+12,at+.08,.058,.3,5)

# Closing suspended resolution, allowed to decay into the end card.
felt(62,84,.10,-.25,6)
felt(69,84.18,.075,.2,5.8)
felt(76,84.42,.05,.4,5.5)

# Original algorithmic room tail, cross-channel taps, no convolution samples.
dry=mix.copy()
for seconds,level in [(.113,.12),(.229,.11),(.379,.10),(.617,.075),(.941,.055),(1.379,.035),(1.91,.022)]:
    delay=int(seconds*SR)
    mix[delay:] += dry[:-delay,::-1]*level
mix=sosfilt(butter(2,6500,fs=SR,output='sos'),mix,axis=0)
# Remove DC / inaudible subsonic energy before limiting.
mix=sosfilt(butter(2,28,btype='high',fs=SR,output='sos'),mix,axis=0)
t=times(SECONDS)
envelope=smooth(t/3.3)*smooth((SECONDS-t)/5.3)
mix*=envelope[:,None]
mix=np.tanh(mix*1.1)
peak=np.max(np.abs(mix))
mix*=10**(-3/20)/peak
pcm=np.round(mix*32767).astype('<i2')
out=Path(__file__).resolve().parents[1]/'public/audio/score.wav'
out.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(out),'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'{out}: {SECONDS}.000 s, stereo {SR} Hz; sample peak -3.00 dBFS; original synthesized composition')
