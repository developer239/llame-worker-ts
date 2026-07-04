# llama.cpp-ts 🦙👁

Local **multimodal** inference for Node.js: one-off image, video, and text
prompts against GGUF models, running entirely on your machine over
[llama.cpp](https://github.com/ggml-org/llama.cpp) (via the
[llame-worker](https://github.com/developer239/llame-worker) C++ core). No
server to manage, no API costs. Built for CLI tools and MCP servers.

```js
const { LlamaVision } = require('llama.cpp-ts');

const llama = await LlamaVision.load({
  modelPath: '/abs/path/gemma-3-4b-it-f16.gguf',
  projectorPath: '/abs/path/mmproj-model-f16.gguf',
});

const result = await llama.describeImage('/abs/path/screenshot.png');
console.log(result.text);
```

**Supported systems:** macOS (Metal by default), Linux, Windows.

## Requirements

Installation compiles llama.cpp from source, so the machine needs a C++
toolchain (Xcode Command Line Tools on macOS, `build-essential` on Linux,
MSVC Build Tools on Windows), plus **CMake** and **git** on PATH, and
Node >= 18. The first install takes several minutes; later installs reuse
the build cache. You also need a vision-capable GGUF model **and its
matching projector** (`mmproj-*.gguf`) - e.g. `gemma-3-4b-it` from the
ggml-org Hugging Face repos. For video, install `ffmpeg` (with `ffprobe`).

## Installation

```bash
pnpm add llama.cpp-ts
```

With CUDA (NVIDIA GPUs; Metal needs nothing on macOS):

```bash
CMAKE_ARGS="GGML_CUDA=ON" pnpm add llama.cpp-ts
```

CI jobs that only lint or release can skip the native build with
`LLAMA_VISION_SKIP_BUILD=1`.

## Usage

### Load once, generate many

Loading takes seconds; generation takes on the order of a second. Keep one
instance alive for the life of your process - that is the entire
performance model.

```js
const { LlamaVision } = require('llama.cpp-ts');

const llama = await LlamaVision.load({
  modelPath: '/abs/model.gguf',
  projectorPath: '/abs/mmproj.gguf',
  contextSize: 4096,          // raise for multi-image / video prompts
  systemPrompt: 'You are a precise visual assistant.',
});
```

### Generate, with optional streaming

```js
const result = await llama.generate({
  prompt: 'What changed between these two screenshots?',
  imagePaths: ['/tmp/before.png', '/tmp/after.png'],
  maxTokens: 300,
  onToken: (piece) => process.stdout.write(piece),
});
// result: { text, promptTokenCount, generatedTokenCount, truncated }
```

Or as an async iterator:

```js
for await (const piece of llama.stream({ prompt: 'Describe this.',
                                          imagePaths: ['/tmp/shot.png'] })) {
  process.stdout.write(piece);
}
```

Text-only prompts work too - omit `imagePaths` and this is a plain local
LLM.

### Video

```js
const summary = await llama.describeVideo('/abs/clip.mp4');
```

Frames are sampled with ffmpeg (up to 8 by default, spread across the
video), described in order, and cleaned up automatically. This is
keyframe-level understanding, not motion reasoning; each frame costs a few
hundred prompt tokens, and `result.promptTokenCount` tells you what a call
actually cost. For manual control, `extractVideoFrames()` /
`cleanupVideoFrames()` are exported.

### Using from an MCP server

An MCP server is a long-lived process - the ideal host. Load at startup,
call per tool invocation, and don't worry about overlap: **calls on one
instance are automatically queued**, so concurrent tool calls are safe and
run one after another.

## Error handling

Failures reject with a descriptive `Error`; generation errors also carry
whatever was produced before the failure as `error.partialText`. The
common failure modes are a mismatched model/projector pair (rejects at
load), unsupported image formats (WebP/JXL - the bundled decoder handles
JPEG/PNG/BMP/TGA/GIF), and prompts exceeding the context (the message
includes the exact token count; raise `contextSize` or send fewer images).

## API summary

`LlamaVision.load(options)` -> instance · `llama.generate(options)` ->
result · `llama.describeImage(path, prompt?, options?)` ·
`llama.describeVideo(path, prompt?, options?, frameOptions?)` ·
`llama.stream(options)` -> async iterator of pieces ·
`llama.loaded` · `llama.unload()` ·
`extractVideoFrames(path, options?)` / `cleanupVideoFrames(frames)` ·
`mediaMarker` (place images manually inside a prompt).

All option fields and defaults are documented in the TypeScript types
(`dist/index.d.ts`).

## Development

```bash
git clone --recurse-submodules https://github.com/developer239/llama.cpp-ts
cd llama.cpp-ts
pnpm install          # builds the native addon from the submodule
pnpm run build:ts     # compiles src/index.ts -> dist/
pnpm run example
```

The development example mirrors the plain CMake consumer: it loads the model
once from `example/models/`, then runs a text prompt, an image prompt against
`example/images/input.jpg`, and a six-frame video prompt against
`example/images/input.mp4`.

The native pin lives in `scripts/install.js` (`LLAME_WORKER_REF`); bump it
together with the `cpp/externals/llame-worker` submodule.

## License

MIT - see LICENSE.
