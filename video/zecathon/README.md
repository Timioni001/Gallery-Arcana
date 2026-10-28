# Gallery Arcana — ZECATHON film

[Download MP4](../output/Gallery-Arcana-ZECATHON-1080p.mp4) · [SRT](../output/Gallery-Arcana-ZECATHON.srt) · [Narration WAV](public/audio/narration.wav)

Final composition: **2:20 · 1920×1080 · 30 fps · burned-in English captions**. Calm Kokoro af_heart narration, 48 kHz / 24-bit source WAV, no music.

One complete browser-demo purchase, followed by the committed local-regtest settlement evidence from 2026-10-27. The browser footage was recorded with Playwright against an unmodified local build of the hosted-demo code at `502ece5`; it is not a recording of a production backend. Sample sellers and payment are simulated. Real client SDK encryption and local decryption execute. Demo receipts use the browser demo key.

The regtest segment reads the committed JSON with both exact transaction IDs. It does not fabricate a terminal run or claim public-testnet settlement. Regtest uses a private chain and no-value coins. Public testnet is in progress; mainnet is disabled. Non-custodial mode is presented as design only.

## Render

```sh
npm ci
npm run typecheck
npm run preview
npm run render
python scripts/finalize.py
```

Chromium at `/usr/bin/chromium` and FFmpeg are needed for render/finalize. All final trimmed footage, fonts and voice audio are included. The root application is unchanged.

Optional fresh capture: start the repository web app with `VITE_DEMO=1 npm run dev -- --host 127.0.0.1 --port 5176`, then `node scripts/capture.cjs` and `python scripts/cut-footage.py`. Capture creates private local raw footage under `out/`; do not publish browser state or delivered originals. Receipt codes are masked before capture.

Optional voice regeneration: install kokoro-onnx, numpy and soundfile; set `KOKORO_MODEL_DIR` to a directory containing Kokoro v1 `model.onnx` and `voices.bin`, then `python scripts/narrate.py`. Model source: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 . Voice lines and SRT use measured sentence timings, not guessed word alignment. Normalization is two-pass -18 LUFS / -2 dBTP.

Official Remotion skills used: creation, compositions, audio, captions, layout, cropping and rendering from https://github.com/remotion-dev/skills . Key decisions: frame-driven motion, explicit named shot timing, large readable evidence text, separate captions, consistent brand fonts and colors.

## Submission description

Gallery Arcana demonstrates a private digital purchase—seal, pay, verify, release—with encrypted delivery and recorded real shielded settlement on local Zcash regtest, clearly distinguished from its simulated browser demo.
