# Next.js Flux Text-to-Speech

A first-class Next.js implementation of `node-flux-tts`. The Next UI connects to the custom server's `/api/tts` WebSocket bridge, which preserves the Flux TTS binary-audio contract. The `flux-tts-html` submodule is retained as the shared frontend contract/reference.

```sh
git submodule update --init --recursive
corepack pnpm install
cp sample.env .env
# Set DEEPGRAM_API_KEY in .env
corepack pnpm dev
```
