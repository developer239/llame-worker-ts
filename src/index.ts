// llama.cpp-ts - local multimodal inference for Node over the llameworker
// C++ core (llame-worker). One-off prompts: load once, prompt many times; every
// prompt is independent of the previous one.

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---- Public types ----

export interface LoadOptions {
  /** Path to the main .gguf model. Required. */
  modelPath: string;
  /** Path to the matching mmproj .gguf. Required. */
  projectorPath: string;
  /** 999 (default) offloads every layer that fits; 0 = CPU only. */
  gpuLayerCount?: number;
  projectorOnGpu?: boolean;
  /** Context window in tokens (default 4096). Raise for many images. */
  contextSize?: number;
  /**
   * Prompt-processing batch size (default 2048). Must exceed the per-image
   * token count for models with non-causal image attention.
   */
  batchSize?: number;
  /** 0 (default) = hardware concurrency. */
  threadCount?: number;
  /** Applied to every prompt() unless overridden per call. */
  systemPrompt?: string;
  /** true re-enables llama.cpp logging (process-global). */
  verbose?: boolean;
}

export interface PromptOptions {
  prompt?: string;
  /** Absolute paths. JPEG/PNG/BMP/TGA/GIF - WebP and JXL are unsupported. */
  imagePaths?: string[];
  maxTokens?: number;
  /** Default 0.2; values <= 0 switch to greedy sampling. */
  temperature?: number;
  topK?: number;
  topP?: number;
  minP?: number;
  repeatPenalty?: number;
  /** Fix for reproducible output; default is random per call. */
  seed?: number;
  systemPromptOverride?: string;
  /** Receives each token piece as it is generated. */
  onToken?: (piece: string) => void;
}

export interface PromptResult {
  text: string;
  promptTokenCount: number;
  generatedTokenCount: number;
  /** True when generation hit maxTokens or the context edge. */
  truncated: boolean;
}

/** Rejections from prompt() may carry the partial output. */
export type PromptError = Error & { partialText?: string };

export interface VideoFrameOptions {
  /** Hard cap on extracted frames (default 8). */
  maxFrames?: number;
  /** Never sample faster than this (default 2 fps). */
  maxSampleFps?: number;
  /** Downscale so the longest edge fits this (default 720); never upscales. */
  maxEdgePixels?: number;
  ffmpegPath?: string;
  ffprobePath?: string;
}

export interface VideoFrames {
  /** Ordered, earliest first. */
  framePaths: string[];
  /** Temp directory holding the frames - remove with cleanupVideoFrames. */
  directory: string;
}

// ---- Native addon ----

interface NativeEngine {
  load(options: LoadOptions): Promise<void>;
  prompt(
    options: Omit<PromptOptions, 'onToken'>,
    onToken?: (piece: string) => void
  ): Promise<PromptResult>;
  unload(): Promise<void>;
  isLoaded(): boolean;
}

interface NativeBinding {
  NativeEngine: new () => NativeEngine;
  mediaMarker: string;
}

// Built into cpp/build/Release by scripts/install.js at install time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const binding =
  require('../cpp/build/Release/llameworker_node.node') as NativeBinding;

/**
 * The literal marker that stands for "an image goes here" inside a prompt.
 * Without markers, images are placed before the text automatically.
 */
export const mediaMarker: string = binding.mediaMarker;

// ---- Engine ----

const DESCRIBE_IMAGE_PROMPT = 'Describe this image.';
const DESCRIBE_VIDEO_PROMPT =
  'These images are frames sampled from one video, in order. ' +
  'Describe what happens.';

export class LlameWorker {
  #native: NativeEngine;
  #queue: Promise<unknown> = Promise.resolve();

  private constructor(native: NativeEngine) {
    this.#native = native;
  }

  /**
   * Loads the model and projector (the expensive step - seconds). Keep the
   * returned instance alive and reuse it; every prompt after load is fast.
   */
  static async load(options: LoadOptions): Promise<LlameWorker> {
    if (!options?.modelPath) {
      throw new TypeError('modelPath is required');
    }
    if (!options?.projectorPath) {
      throw new TypeError(
        'projectorPath is required - this library only supports ' +
          'multimodal models'
      );
    }

    const instance = new LlameWorker(new binding.NativeEngine());
    await instance.#enqueue(() => instance.#native.load(options));

    return instance;
  }

  get loaded(): boolean {
    return this.#native.isLoaded();
  }

  /**
   * One-off prompt. Calls are automatically serialized: the engine runs
   * one prompt at a time, so overlapping calls simply queue.
   */
  prompt(options: PromptOptions): Promise<PromptResult> {
    const { onToken, ...params } = options ?? {};
    return this.#enqueue(() => this.#native.prompt(params, onToken));
  }

  /** Convenience for the most common case. */
  describeImage(
    imagePath: string,
    prompt: string = DESCRIBE_IMAGE_PROMPT,
    options: Omit<PromptOptions, 'prompt' | 'imagePaths'> = {}
  ): Promise<PromptResult> {
    return this.prompt({ ...options, prompt, imagePaths: [imagePath] });
  }

  /**
   * Extracts frames (requires ffmpeg on PATH), generates, and cleans the
   * frames up afterwards.
   */
  async describeVideo(
    videoPath: string,
    prompt: string = DESCRIBE_VIDEO_PROMPT,
    options: Omit<PromptOptions, 'prompt' | 'imagePaths'> = {},
    frameOptions: VideoFrameOptions = {}
  ): Promise<PromptResult> {
    const frames = await extractVideoFrames(videoPath, frameOptions);
    try {
      return await this.prompt({
        ...options,
        prompt,
        imagePaths: frames.framePaths,
      });
    } finally {
      await cleanupVideoFrames(frames);
    }
  }

  /**
   * Streams token pieces as they are generated. The generator's return
   * value is the full PromptResult. Note: breaking out of the loop stops
   * consumption, not generation - the queued prompt still runs to completion.
   */
  async *stream(
    options: Omit<PromptOptions, 'onToken'>
  ): AsyncGenerator<string, PromptResult> {
    const pieces: string[] = [];
    let wake: (() => void) | undefined;
    let finished = false;
    let failure: unknown;
    let result: PromptResult | undefined;

    this.prompt({
      ...options,
      onToken: (piece) => {
        pieces.push(piece);
        wake?.();
      },
    }).then(
      (value) => {
        result = value;
        finished = true;
        wake?.();
      },
      (error) => {
        failure = error;
        finished = true;
        wake?.();
      }
    );

    for (;;) {
      if (pieces.length > 0) {
        yield pieces.shift() as string;
        continue;
      }
      if (finished) {
        // Token delivery and promise settlement travel through separate
        // queues; give straggler tokens one turn of the loop to land.
        await new Promise<void>((resolve) => setImmediate(resolve));
        while (pieces.length > 0) yield pieces.shift() as string;
        break;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }

    if (failure) throw failure;

    return result as PromptResult;
  }

  /**
   * Extracts frames from one video, streams generation pieces, and cleans the
   * frames up after the queued prompt completes.
   */
  async *streamVideo(
    videoPath: string,
    prompt: string = DESCRIBE_VIDEO_PROMPT,
    options: Omit<PromptOptions, 'prompt' | 'imagePaths' | 'onToken'> = {},
    frameOptions: VideoFrameOptions = {}
  ): AsyncGenerator<string, PromptResult> {
    const frames = await extractVideoFrames(videoPath, frameOptions);
    let completed = false;
    const stream = this.stream({
      ...options,
      prompt,
      imagePaths: frames.framePaths,
    });

    try {
      for (;;) {
        const next = await stream.next();
        if (next.done === true) {
          completed = true;
          return next.value;
        }
        yield next.value;
      }
    } finally {
      try {
        if (!completed) {
          for (;;) {
            const next = await stream.next();
            if (next.done === true) break;
          }
        }
      } finally {
        await cleanupVideoFrames(frames);
      }
    }
  }

  /** Frees the model. Create a new instance via load() to load again. */
  unload(): Promise<void> {
    return this.#enqueue(() => this.#native.unload());
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // Run after the previous operation regardless of how it settled; one
    // failed prompt must not poison the queue.
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}

// ---- Video frame extraction (pure Node; ffmpeg as a subprocess) ----

async function probeDurationSeconds(
  ffprobePath: string,
  videoPath: string
): Promise<number> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0; // ffprobe missing or file unreadable - caller falls back
  }
}

/**
 * Extracts up to maxFrames JPEG frames. When ffprobe can report the
 * duration, frames are spread evenly across the whole video; otherwise the
 * fallback samples 1 frame per second from the start.
 */
export async function extractVideoFrames(
  videoPath: string,
  options: VideoFrameOptions = {}
): Promise<VideoFrames> {
  const maxFrames = options.maxFrames ?? 8;
  const maxSampleFps = options.maxSampleFps ?? 2;
  const maxEdgePixels = options.maxEdgePixels ?? 720;
  const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
  const ffprobePath = options.ffprobePath ?? 'ffprobe';
  if (maxFrames <= 0) throw new RangeError('maxFrames must be positive');

  const duration = await probeDurationSeconds(ffprobePath, videoPath);
  const fps = Math.min(
    duration > 0 ? maxFrames / duration : 1,
    maxSampleFps
  );

  const directory = await mkdtemp(path.join(tmpdir(), 'llameworker-frames-'));

  // min(...) in the scale expression prevents upscaling; the single quotes
  // are consumed by ffmpeg's filtergraph parser (there is no shell here).
  const filter =
    `fps=${fps.toFixed(6)},` +
    `scale='min(${maxEdgePixels},iw)':'min(${maxEdgePixels},ih)':` +
    'force_original_aspect_ratio=decrease';

  try {
    await execFileAsync(ffmpegPath, [
      '-v', 'error', '-y',
      '-i', videoPath,
      '-vf', filter,
      '-frames:v', String(maxFrames),
      path.join(directory, 'frame-%04d.jpg'),
    ]);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `ffmpeg was not found at '${ffmpegPath}'. ` +
          'Install ffmpeg or set ffmpegPath.'
      );
    }
    throw error;
  }

  const framePaths = (await readdir(directory))
    .filter((name) => name.endsWith('.jpg'))
    .sort()
    .map((name) => path.join(directory, name));

  if (framePaths.length === 0) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(`ffmpeg produced no frames from ${videoPath}`);
  }

  return { framePaths, directory };
}

/** Removes the temp directory created by extractVideoFrames. */
export async function cleanupVideoFrames(frames: VideoFrames): Promise<void> {
  if (!frames?.directory) return;
  await rm(frames.directory, { recursive: true, force: true });
}
