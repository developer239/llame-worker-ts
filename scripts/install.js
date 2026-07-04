#!/usr/bin/env node
// Cross-platform postinstall: fetch the pinned llame-worker sources (which
// carry llama.cpp as a submodule) and compile the native addon.
//
// Replaces the old clone-submodule.sh, which (a) required bash and so broke
// on Windows, and (b) tracked the library *master*, so published versions of
// this package could silently break when upstream moved. The REF below is
// the single source of truth for the native pin - bump it deliberately.

'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const path = require('node:path');

const LLAME_WORKER_REPO = 'https://github.com/developer239/llame-worker.git';
const LLAME_WORKER_REF = 'fffb0332fd15a634733aeb28596e987a1c14e5ca';

const rootDir = path.join(__dirname, '..');
const vendorDir = path.join(rootDir, 'cpp', 'externals', 'llame-worker');

function fail(message) {
  console.error(`\n[llama.cpp-ts] ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error && result.error.code === 'ENOENT') {
    fail(
      `'${command}' was not found on PATH. Install it, then run: ` +
        'pnpm rebuild llama.cpp-ts'
    );
  }
  if (result.status !== 0) {
    fail(`'${command} ${args.join(' ')}' failed (exit ${result.status}).`);
  }
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  return !result.error && result.status === 0;
}

function isAvailable(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

if (process.env.LLAMEWORKER_SKIP_BUILD === '1') {
  console.log('[llama.cpp-ts] LLAMEWORKER_SKIP_BUILD=1 - skipping build.');
  process.exit(0);
}

if (!isAvailable('git')) fail("'git' is required to fetch native sources.");
if (!isAvailable('cmake')) {
  fail(
    "'cmake' is required to build the native addon " +
      '(brew install cmake / apt install cmake / choco install cmake).'
  );
}

// 1) Ensure the pinned llame-worker sources are present.
if (!existsSync(path.join(vendorDir, 'CMakeLists.txt'))) {
  console.log(`[llama.cpp-ts] Fetching llame-worker @ ${LLAME_WORKER_REF} ...`);
  rmSync(vendorDir, { recursive: true, force: true });
  run('git', [
    'clone',
    '--depth',
    '1',
    '--branch',
    LLAME_WORKER_REF,
    LLAME_WORKER_REPO,
    vendorDir,
  ]);
}

// 2) Ensure its llama.cpp submodule is initialized. Shallow when the host
//    allows fetching a pinned commit shallowly; full clone as the fallback.
if (
  !existsSync(path.join(vendorDir, 'externals', 'llama.cpp', 'CMakeLists.txt'))
) {
  console.log('[llama.cpp-ts] Initializing the llama.cpp submodule ...');
  const shallow = tryRun(
    'git',
    ['submodule', 'update', '--init', '--recursive', '--depth', '1'],
    { cwd: vendorDir }
  );
  if (!shallow) {
    run('git', ['submodule', 'update', '--init', '--recursive'], {
      cwd: vendorDir,
    });
  }
}

// 3) Compile. Extra CMake defines pass through CMAKE_ARGS, e.g.:
//      CMAKE_ARGS="GGML_CUDA=ON" pnpm add llama.cpp-ts
const cmakeJs = require.resolve('cmake-js/bin/cmake-js');
const extraDefines = (process.env.CMAKE_ARGS || '')
  .split(/\s+/)
  .filter(Boolean)
  .map((define) => `--CD${define}`);

console.log(
  '[llama.cpp-ts] Compiling the native addon ' +
    '(the first build compiles llama.cpp and takes a while) ...'
);
run(process.execPath, [cmakeJs, 'compile', '-d', 'cpp', ...extraDefines], {
  cwd: rootDir,
});

console.log('[llama.cpp-ts] Native addon ready.');
