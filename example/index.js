// Development example. Requires: models downloaded into example/models,
// any JPEG/PNG at example/images/kapybara.jpg, and a prior
// `npm install && npm run build:ts` in the repo root.
//
//   node example/index.js                    image + text examples
//   node example/index.js path/to/clip.mp4   additionally summarizes video

const path = require('node:path');
const { LlamaVision } = require('..');

async function main() {
  const startedAt = Date.now();
  const llama = await LlamaVision.load({
    modelPath: path.join(__dirname, 'models', 'gemma-3-4b-it-f16.gguf'),
    projectorPath: path.join(__dirname, 'models', 'mmproj-model-f16.gguf'),
  });
  console.log(`Model loaded in ${(Date.now() - startedAt) / 1000}s - ` +
    'every call below reuses it.\n');

  const imagePath = path.join(__dirname, 'images', 'kapybara.jpg');

  console.log('=== 1. describeImage ===');
  const described = await llama.describeImage(imagePath);
  console.log(described.text);
  console.log(`(${described.promptTokenCount} prompt tokens, ` +
    `${described.generatedTokenCount} generated)\n`);

  console.log('=== 2. Streaming an independent follow-up ===');
  // No conversation history: to ask something else about an image, send
  // the image again.
  for await (const piece of llama.stream({
    prompt: 'What animal is shown, and what is it known for?',
    imagePaths: [imagePath],
    maxTokens: 200,
  })) {
    process.stdout.write(piece);
  }
  console.log('\n');

  console.log('=== 3. Text-only prompt ===');
  const fact = await llama.generate({
    prompt: 'One short fun fact about capybaras.',
    maxTokens: 60,
    systemPromptOverride: 'You are a concise zoologist.',
  });
  console.log(`${fact.text}\n`);

  if (process.argv[2]) {
    console.log(`=== 4. Video: ${process.argv[2]} ===`);
    const summary = await llama.describeVideo(process.argv[2]);
    console.log(summary.text);
    console.log(`(${summary.promptTokenCount} prompt tokens)`);
  }

  await llama.unload();
}

main().catch((error) => {
  console.error(error.message);
  if (error.partialText) console.error('Partial output:', error.partialText);
  process.exit(1);
});
