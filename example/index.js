// LlamaVision integration example.
//
// A guided tour of the v2 API with hard-coded targets (no CLI params):
// one-time model load (the expensive step), then three tests in order -
// a simple text-only prompt, image vision, and video summarization via
// frame sampling.
//
// Run from the repo root after `pnpm install && pnpm run build:ts`:
//   pnpm run example

const path = require('node:path');
const {
  cleanupVideoFrames,
  extractVideoFrames,
  LlamaVision,
} = require('..');

const modelPath = path.join(__dirname, 'models', 'gemma-3-4b-it-f16.gguf');
const projectorPath = path.join(__dirname, 'models', 'mmproj-model-f16.gguf');
const imagePath = path.join(__dirname, 'images', 'input.jpg');
const videoPath = path.join(__dirname, 'images', 'input.mp4');

const printPiece = (piece) => process.stdout.write(piece);

async function main() {
  const startedAt = Date.now();
  const llama = await LlamaVision.load({
    modelPath,
    projectorPath,
    systemPrompt: 'You are a helpful assistant. Answer clearly and to the point.',
  });
  console.log(`Model loaded in ${(Date.now() - startedAt) / 1000}s - ` +
    'every call below reuses it.\n');

  try {
    console.log('=== 1. Simple text prompt ===');
    await llama.generate({
      prompt: 'In one sentence, what is a capybara?',
      maxTokens: 100,
      onToken: printPiece,
    });
    console.log('\n');

    console.log(`=== 2. Image vision (${imagePath}) ===`);
    const imageStartedAt = Date.now();
    const described = await llama.describeImage(imagePath, 'Describe this image.', {
      onToken: printPiece,
    });
    console.log('\n');
    console.log(`(${(Date.now() - imageStartedAt) / 1000}s, ` +
      `${described.promptTokenCount} prompt tokens, ` +
      `${described.generatedTokenCount} generated)\n`);

    console.log(`=== 3. Video (${videoPath}) ===`);
    const frames = await extractVideoFrames(videoPath, { maxFrames: 6 });
    console.log(`(sampled ${frames.framePaths.length} frames)`);

    try {
      const summary = await llama.generate({
        prompt: 'These images are frames sampled from a single video, in order. ' +
          'Study them and reason about the sequence: is this one continuous ' +
          'scene or several distinct scenes? What is happening in each scene? ' +
          'How are the frames connected to one another - what changes from one ' +
          'to the next, and what stays the same, including between the first ' +
          'frame and the last? Be as precise as possible.',
        imagePaths: frames.framePaths,
        onToken: printPiece,
      });
      console.log('\n');
      console.log(`(${summary.promptTokenCount} prompt tokens for ` +
        `${frames.framePaths.length} frames)`);
    } finally {
      await cleanupVideoFrames(frames);
    }
  } finally {
    await llama.unload();
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.partialText) console.error('Partial output:', error.partialText);
  process.exit(1);
});
