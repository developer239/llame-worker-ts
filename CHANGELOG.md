# [2.0.0](https://github.com/developer239/llama.cpp-ts/compare/v1.2.0...v2.0.0) (2026-07-05)


* feat!: rewrite as LlamaVision multimodal bindings over llame-worker ([f142bbe](https://github.com/developer239/llama.cpp-ts/commit/f142bbef2faa376b5aebba5b9f6d506ce5aa9008))


### Features

* add video streaming helper ([aa1389f](https://github.com/developer239/llama.cpp-ts/commit/aa1389f6474e2e3c8fa32f643e1118ac553c5338))
* rename prompt API ([26b20ed](https://github.com/developer239/llama.cpp-ts/commit/26b20edf9e0995085bbca3d2bfc31cdc94e6d11d))
* rename wrapper api to llameworker ([541cf60](https://github.com/developer239/llama.cpp-ts/commit/541cf60e2d8e5c2078cd1dec9c587a228014b53c))
* track namespaced camelCase core and rename native prompt method ([255f752](https://github.com/developer239/llama.cpp-ts/commit/255f752eb5070f5c7da03bab73d778aa6560cabf))
* use prompt core api ([d752301](https://github.com/developer239/llama.cpp-ts/commit/d7523018fa28f5dd3cba2027cf089053c40a6c53))


### BREAKING CHANGES

* The API is now multimodal and promise-based. `new Llama()`
+ `initialize(path, {nGpuLayers}, {nContext})` + `prompt()` returning a
blocking TokenStream are replaced by `await LlamaVision.load({ modelPath,
projectorPath, ... })` and `generate`/`stream`. A multimodal projector is
now required at load.

# [1.2.0](https://github.com/developer239/llama.cpp-ts/compare/v1.1.0...v1.2.0) (2024-09-26)


### Features

* update llama-chat ([762b0ca](https://github.com/developer239/llama.cpp-ts/commit/762b0ca5519a3e5e187dfede1c2ab4c1a1df700c))

# [1.1.0](https://github.com/developer239/llama.cpp-ts/compare/v1.0.10...v1.1.0) (2024-09-26)


### Features

* use new llama wrapper ([01107f9](https://github.com/developer239/llama.cpp-ts/commit/01107f975bdfe323c240e202e514c10ab881e974))

## [1.0.10](https://github.com/developer239/llama.cpp-ts/compare/v1.0.9...v1.0.10) (2024-07-27)


### Bug Fixes

* types ([da1d886](https://github.com/developer239/llama.cpp-ts/commit/da1d8868723bfbecb229ef0b52c0847d9d843754))

## [1.0.9](https://github.com/developer239/llama.cpp-ts/compare/v1.0.8...v1.0.9) (2024-07-27)


### Bug Fixes

* ci ([1423f36](https://github.com/developer239/llama.cpp-ts/commit/1423f363d2c36a44efa8243ed1cafa228b4e474b))
* ci ([d5f1e9d](https://github.com/developer239/llama.cpp-ts/commit/d5f1e9dd3692be6082988c96d23bb1d70a9e54dc))
* ci ([25b44ec](https://github.com/developer239/llama.cpp-ts/commit/25b44ec671957168c8968b1a4eac21b58cba2221))
* npm ([ee4911c](https://github.com/developer239/llama.cpp-ts/commit/ee4911c837b7ebb3988f6cbdc9944c1222cc067c))

## [1.0.8](https://github.com/developer239/llama.cpp-ts/compare/v1.0.7...v1.0.8) (2024-07-27)


### Bug Fixes

* CI ([345906d](https://github.com/developer239/llama.cpp-ts/commit/345906dfdad189d9c898e65cfa6d4936abcd7203))

## [1.0.7](https://github.com/developer239/llama.cpp-ts/compare/v1.0.6...v1.0.7) (2024-07-27)


### Bug Fixes

* npm configuration ([5083692](https://github.com/developer239/llama.cpp-ts/commit/5083692ccc01cd76ff71c46074fa5bd9f003dcd6))

## [1.0.6](https://github.com/developer239/llama.cpp-ts/compare/v1.0.5...v1.0.6) (2024-07-27)


### Bug Fixes

* npm configuration ([e8fbe65](https://github.com/developer239/llama.cpp-ts/commit/e8fbe65ce5920838b52d870a4bcbd77f709584fc))

## [1.0.5](https://github.com/developer239/llama.cpp-ts/compare/v1.0.4...v1.0.5) (2024-07-27)


### Bug Fixes

* npm configuration ([91f2f33](https://github.com/developer239/llama.cpp-ts/commit/91f2f33f871375b13e5ea9efba5e1a8337a913ea))

## [1.0.4](https://github.com/developer239/llama.cpp-ts/compare/v1.0.3...v1.0.4) (2024-07-27)


### Bug Fixes

* npm configuration ([6511946](https://github.com/developer239/llama.cpp-ts/commit/65119467d2658782ffca3b51f8be2e37e50b75f2))

## [1.0.3](https://github.com/developer239/llama.cpp-ts/compare/v1.0.2...v1.0.3) (2024-07-27)


### Bug Fixes

* npm configuration ([3961f1e](https://github.com/developer239/llama.cpp-ts/commit/3961f1e509f88d338e1af15e52993bf8aa2d3627))

## [1.0.2](https://github.com/developer239/llama.cpp-ts/compare/v1.0.1...v1.0.2) (2024-07-27)


### Bug Fixes

* npm configuration ([2e37c51](https://github.com/developer239/llama.cpp-ts/commit/2e37c51b16b6823bf3d96745958e915e58cec53c))

## [1.0.1](https://github.com/developer239/llama.cpp-ts/compare/v1.0.0...v1.0.1) (2024-07-27)


### Bug Fixes

* npm configuration ([cb28a9b](https://github.com/developer239/llama.cpp-ts/commit/cb28a9bca13fe8d104b4107d2835fb9026edc454))

# 1.0.0 (2024-07-27)


### Bug Fixes

* simplify ([fa70521](https://github.com/developer239/llama.cpp-ts/commit/fa7052130fde975ffef3a84ab5210b3f2b91d7d0))
* simplify ([0999a44](https://github.com/developer239/llama.cpp-ts/commit/0999a44555547033695613e5ec321ec3b8a549ff))


### Features

* create simple example ([60bb47f](https://github.com/developer239/llama.cpp-ts/commit/60bb47f189ae52434cc302235ad26ba17ae31576))
* implement binding for runQueryStream ([e18cb8c](https://github.com/developer239/llama.cpp-ts/commit/e18cb8cc2e4f4a901935f5cba15089557355bcb8))
* minimal llamacpp wrapper ([48e53e4](https://github.com/developer239/llama.cpp-ts/commit/48e53e421dd9b9b7d608a3fd2079a6148df2c6f4))
