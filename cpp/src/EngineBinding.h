#pragma once

#include <napi.h>

#include <atomic>
#include <memory>

class LlamaVision;

// Minimal Node-API surface over the LlamaVision engine. All ergonomics
// (call queueing, async iteration, video, defaults documentation) live in
// the TypeScript layer; this class only marshals values and moves work off
// the event loop.
class EngineBinding : public Napi::ObjectWrap<EngineBinding> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  explicit EngineBinding(const Napi::CallbackInfo& info);

 private:
  Napi::Value Load(const Napi::CallbackInfo& info);
  Napi::Value Prompt(const Napi::CallbackInfo& info);
  Napi::Value Unload(const Napi::CallbackInfo& info);
  Napi::Value IsLoaded(const Napi::CallbackInfo& info);

  // Shared with in-flight workers so the engine cannot be destroyed (or the
  // JS wrapper garbage-collected) out from under a running generation -
  // the use-after-free the v1 detached thread allowed.
  std::shared_ptr<LlamaVision> engine;

  // One operation at a time per instance. The TypeScript wrapper already
  // serializes; this guard protects direct users of the raw addon.
  std::shared_ptr<std::atomic<bool>> busy;
};
