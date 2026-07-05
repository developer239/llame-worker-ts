# Llame Worker TS 🦙🦙

[![npm version](https://img.shields.io/npm/v/llama.cpp-ts.svg?style=flat)](https://www.npmjs.com/package/llama.cpp-ts)
[![npm downloads](https://img.shields.io/npm/dm/llama.cpp-ts.svg?style=flat)](https://www.npmjs.com/package/llama.cpp-ts)
[![Release](https://github.com/developer239/llame-worker-ts/actions/workflows/main.yml/badge.svg)](https://github.com/developer239/llame-worker-ts/actions/workflows/main.yml)
[![license](https://img.shields.io/npm/l/llama.cpp-ts.svg?style=flat)](https://github.com/developer239/llame-worker-ts/blob/master/LICENSE)

Node.js bindings for [llame-worker](https://github.com/developer239/llame-worker),
a small C++ wrapper around [llama.cpp](https://github.com/ggml-org/llama.cpp)'s
multimodal API. Use it when a Node process needs local one-off prompts over a
GGUF model: text, images, or video frames. There is no server process and no API
account. Your process loads the model once, then sends independent generation
prompts to the native addon.

```js
const { LlameWorker } = require('llama.cpp-ts');

const llameworker = await LlameWorker.load({
  modelPath: '/abs/path/gemma-3-4b-it-f16.gguf',
  projectorPath: '/abs/path/mmproj-model-f16.gguf',
});

const result = await llameworker.describeImage('/abs/path/screenshot.png');
console.log(result.text);
```

The package is aimed at CLI tools, desktop helpers, scripts, and MCP servers
that need local vision-capable inference without standing up a separate
llama.cpp server.

## Requirements

The native addon is built during package installation. The machine needs:

- Node >= 18
- a C++ toolchain: Xcode Command Line Tools on macOS, `build-essential` on
  Linux, or MSVC Build Tools on Windows
- CMake and git on PATH
- a vision-capable GGUF model and its matching projector (`mmproj-*.gguf`)
- ffmpeg and ffprobe on PATH for video helpers

The first install compiles llama.cpp and can take several minutes. Later
installs can reuse the local build cache.

## Install from npm

```bash
pnpm add llama.cpp-ts
```

The package is published to the npm registry. The examples here use pnpm, but
the package can be installed by any npm-registry client.

With CUDA on NVIDIA GPUs, pass the llama.cpp CMake option during install. Metal
is enabled by default on macOS.

```bash
CMAKE_ARGS="GGML_CUDA=ON" pnpm add llama.cpp-ts
```

CI jobs that only type-check, lint, or publish package metadata can skip native
compilation with `LLAMEWORKER_SKIP_BUILD=1`.

## Usage

### Migration note

The exported engine class is `LlameWorker`. Older examples that imported the
previous engine class must update the import and constructor call:

```js
const { LlameWorker } = require('llama.cpp-ts');

const llameworker = await LlameWorker.load({
  modelPath: '/abs/model.gguf',
  projectorPath: '/abs/mmproj.gguf',
});
```

Build-only CI jobs should use `LLAMEWORKER_SKIP_BUILD=1` to skip native
compilation.

### Load once, then prompt

Model loading is the expensive step. Keep one `LlameWorker` instance alive for
the work your process needs to do, then call `prompt()`, `describeImage()`, or
`describeVideo()` for independent requests. The library does not keep chat
history between calls. If a later prompt needs an image again, pass the image
path again.

```js
const { LlameWorker } = require('llama.cpp-ts');

const llameworker = await LlameWorker.load({
  modelPath: '/abs/model.gguf',
  projectorPath: '/abs/mmproj.gguf',
  contextSize: 4096,          // raise for multi-image / video prompts
  systemPrompt: 'You are a precise visual assistant.',
});
```

### Prompt with optional streaming

```js
const result = await llameworker.prompt({
  prompt: 'What changed between these two screenshots?',
  imagePaths: ['/tmp/before.png', '/tmp/after.png'],
  maxTokens: 300,
  onToken: (piece) => process.stdout.write(piece),
});
// result: { text, promptTokenCount, generatedTokenCount, truncated }
```

For `for await` consumers, `stream()` exposes generated pieces as an async
iterator:

```js
for await (const piece of llameworker.stream({ prompt: 'Describe this.',
                                               imagePaths: ['/tmp/shot.png'] })) {
  process.stdout.write(piece);
}
```

Text-only prompts work too. Omit `imagePaths` and the same engine behaves like a
local LLM over the loaded model.

### Video

```js
const summary = await llameworker.describeVideo('/abs/clip.mp4');
```

`describeVideo()` samples frames with ffmpeg, sends those frames to the same
image generation path, and removes the temporary frames after generation
returns. By default it samples up to 8 frames spread across the video. This is
frame-level visual understanding rather than native motion reasoning. Each
sampled frame consumes prompt tokens, so check `result.promptTokenCount` for the
actual cost of a video call.

Pass a custom prompt when the default summary is not specific enough:

```js
await llameworker.describeImage('/abs/screenshot.png', 'Read every visible error.');

await llameworker.describeVideo(
  '/abs/clip.mp4',
  'Describe the UI actions in this screen recording.',
);
```

For streaming video output, use `streamVideo()`:

```js
const stream = llameworker.streamVideo(
  '/abs/clip.mp4',
  'Describe the visible scene changes.',
);

for (;;) {
  const next = await stream.next();
  if (next.done) {
    console.log(next.value.promptTokenCount);
    break;
  }
  process.stdout.write(next.value);
}
```

For manual control, use the exported `extractVideoFrames()` and
`cleanupVideoFrames()` helpers. Keep extracted frames on disk until after
`prompt()` returns because the native generation call reads the image files
during generation.

### Long-running Node processes

This package fits long-running Node processes well. Load the model during
startup, then call the engine from each command or tool invocation. Calls on one
instance are automatically queued, so overlapping requests are safe and run one
after another. Create separate instances only when you intentionally want
separate native engines loaded in memory.

## Error handling

Failures reject with `Error`. Generation errors may also include
`error.partialText` with text produced before the failure. Common failure modes
are:

- mismatched model/projector files, usually caught during load
- unsupported image formats, because the bundled decoder handles
  JPEG/PNG/BMP/TGA/GIF but not WebP or JXL
- prompts that exceed the configured context window, especially multi-image or
  video prompts
- missing ffmpeg or ffprobe when using video helpers

## API summary

`LlameWorker.load(options)` -> instance · `llameworker.prompt(options)` ->
result · `llameworker.describeImage(path, prompt?, options?)` ·
`llameworker.describeVideo(path, prompt?, options?, frameOptions?)` ·
`llameworker.stream(options)` / `llameworker.streamVideo(path, prompt?, options?, frameOptions?)`
-> async iterator of pieces ·
`llameworker.loaded` · `llameworker.unload()` ·
`extractVideoFrames(path, options?)` / `cleanupVideoFrames(frames)` ·
`mediaMarker` (place images manually inside a prompt).

The generated TypeScript declarations (`dist/index.d.ts`) are the API reference
for option fields and defaults.

## Development

This repository uses pnpm for development. The native addon links against the
vendored `llame-worker` source under `cpp/externals/llame-worker`.

```bash
git clone --recurse-submodules https://github.com/developer239/llama.cpp-ts
cd llama.cpp-ts
pnpm install          # builds the native addon from the submodule
pnpm run build:ts     # compiles src/index.ts -> dist/
pnpm run example
```

The development example mirrors the plain CMake consumer in
`llame-worker-example`: it loads the model once, then runs a text prompt, an
image prompt against `example/images/input.jpg`, and a six-frame video prompt
against `example/images/input.mp4`. The sample image and video are checked in.
The GGUF model files are not checked in; put them in `example/models/` or
symlink them from a local model directory.

The native pin lives in `scripts/install.js` (`LLAME_WORKER_REF`); bump it
together with the `cpp/externals/llame-worker` submodule.

## License

MIT - see LICENSE.
