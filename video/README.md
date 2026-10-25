# Gallery Arcana — 90-second product film

Independent Remotion production. Application source is untouched in the original checkout. Current recording source: `Timioni001/Gallery-Arcana` revision `728f3ce` (README re-read, including 72-hour review/automatic release). Film: 1920×1080,30fps,2700 frames.

## Reproduce

Node22+ and Chromium/FFmpeg are required.

```
npm ci
npm run typecheck
npm run preview
npm run render
```

The pinned Remotion4.0.538 project uses official Remotion agent skills and official documentation, retrieved from remotion-dev GitHub when the documentation website was unavailable. The official blank template scaffolder had network discovery errors; its official `template-empty` repository provided the scaffold.

`src/Film.tsx` is the editable nine-scene timeline. Fonts and original wordmark/isometric vault preserve the app's design. Source captures are actual Playwright browser interactions with separate seller/buyer sessions and an isolated PostgreSQL/Fastify/wallet-worker stack. All payment observations are simulated and clearly labeled. No blockchain activity is asserted.

`public/audio/narration.wav` is the separate 90-second,48kHz,24-bit voice master. Kokoro82M v1.0 (`af_heart`) is the available local neural engine. No commercial voice service was connected; no claim is made that it exceeds every hosted voice service. `scripts/narrate.py` reproduces timed passages from model/voice files in `/tmp/arcana-tts`; model release: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0. Kokoro model is Apache2.0; review engine/model/font licenses before redistribution.

Narration processing: high-pass70Hz, low-pass15kHz, EBU loudness normalization, 48kHz PCM export. Passages have scene-specific timing and natural gaps; `docs/narration.json` records exact timings/text/rates. `scripts/make-score.py` creates the original ambient score, mixed quietly beneath speech. No third-party music or cloned personal voice.

## Evidence and limits

`public/captures/verification.json` records real local decryption byte equality and receipt-signature checks. `scripts/capture.cjs` captures the isolated app; private fixtures/session state are excluded from delivery. `scripts/edit-captures.py` cuts actual footage and holds the last frame where needed.

Real Zcash testnet remains unverified. Encrypted chat excludes financial metadata; integrity is not legal title. The current 72-hour review window auto-releases undisputed orders; a dispute freezes release. Auctions are presently browser-demo functionality, so this film focuses on the tested core sale. See source README and the repository threat model.
