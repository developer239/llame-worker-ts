#include "EngineBinding.h"

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

#include "llama-vision.h"

namespace {

// ---- Option readers: only overwrite the C++ defaults when the JS object
// actually carries the key, so defaults live in exactly one place (the
// llama-vision.h structs). ----

void ReadString(const Napi::Object& source, const char* key,
                std::string& out) {
  if (source.Has(key) && source.Get(key).IsString()) {
    out = source.Get(key).As<Napi::String>().Utf8Value();
  }
}

void ReadInt(const Napi::Object& source, const char* key, int& out) {
  if (source.Has(key) && source.Get(key).IsNumber()) {
    out = source.Get(key).As<Napi::Number>().Int32Value();
  }
}

void ReadUint(const Napi::Object& source, const char* key, uint32_t& out) {
  if (source.Has(key) && source.Get(key).IsNumber()) {
    out = source.Get(key).As<Napi::Number>().Uint32Value();
  }
}

void ReadFloat(const Napi::Object& source, const char* key, float& out) {
  if (source.Has(key) && source.Get(key).IsNumber()) {
    out = source.Get(key).As<Napi::Number>().FloatValue();
  }
}

void ReadBool(const Napi::Object& source, const char* key, bool& out) {
  if (source.Has(key) && source.Get(key).IsBoolean()) {
    out = source.Get(key).As<Napi::Boolean>().Value();
  }
}

VisionModelParams ReadModelParams(const Napi::Object& source) {
  VisionModelParams params;
  ReadString(source, "modelPath", params.modelPath);
  ReadString(source, "projectorPath", params.projectorPath);
  ReadInt(source, "gpuLayerCount", params.gpuLayerCount);
  ReadBool(source, "projectorOnGpu", params.projectorOnGpu);
  ReadInt(source, "contextSize", params.contextSize);
  ReadInt(source, "batchSize", params.batchSize);
  ReadInt(source, "threadCount", params.threadCount);
  ReadString(source, "systemPrompt", params.systemPrompt);
  ReadBool(source, "verbose", params.verbose);
  return params;
}

PromptParams ReadPromptParams(const Napi::Object& source) {
  PromptParams params;
  ReadString(source, "prompt", params.prompt);
  if (source.Has("imagePaths") && source.Get("imagePaths").IsArray()) {
    Napi::Array paths = source.Get("imagePaths").As<Napi::Array>();
    for (uint32_t i = 0; i < paths.Length(); ++i) {
      Napi::Value entry = paths.Get(i);
      if (entry.IsString()) {
        params.imagePaths.push_back(entry.As<Napi::String>().Utf8Value());
      }
    }
  }
  ReadInt(source, "maxTokens", params.maxTokens);
  ReadFloat(source, "temperature", params.temperature);
  ReadInt(source, "topK", params.topK);
  ReadFloat(source, "topP", params.topP);
  ReadFloat(source, "minP", params.minP);
  ReadFloat(source, "repeatPenalty", params.repeatPenalty);
  ReadUint(source, "seed", params.seed);
  ReadString(source, "systemPromptOverride", params.systemPromptOverride);
  return params;
}

// ---- Workers ----

class LoadWorker : public Napi::AsyncWorker {
 public:
  LoadWorker(Napi::Env env, std::shared_ptr<LlamaVision> engine,
             std::shared_ptr<std::atomic<bool>> busy,
             VisionModelParams params)
      : Napi::AsyncWorker(env),
        deferred(Napi::Promise::Deferred::New(env)),
        engine(std::move(engine)),
        busy(std::move(busy)),
        params(std::move(params)) {}

  Napi::Promise Promise() const { return deferred.Promise(); }

 protected:
  void Execute() override {
    succeeded = engine->Load(params);
    if (!succeeded) errorMessage = engine->LoadError();
  }

  void OnOK() override {
    busy->store(false);
    if (succeeded) {
      deferred.Resolve(Env().Undefined());
    } else {
      deferred.Reject(Napi::Error::New(Env(), errorMessage).Value());
    }
  }

  void OnError(const Napi::Error& error) override {
    busy->store(false);
    deferred.Reject(error.Value());
  }

 private:
  Napi::Promise::Deferred deferred;
  std::shared_ptr<LlamaVision> engine;
  std::shared_ptr<std::atomic<bool>> busy;
  VisionModelParams params;
  bool succeeded = false;
  std::string errorMessage;
};

class UnloadWorker : public Napi::AsyncWorker {
 public:
  UnloadWorker(Napi::Env env, std::shared_ptr<LlamaVision> engine,
               std::shared_ptr<std::atomic<bool>> busy)
      : Napi::AsyncWorker(env),
        deferred(Napi::Promise::Deferred::New(env)),
        engine(std::move(engine)),
        busy(std::move(busy)) {}

  Napi::Promise Promise() const { return deferred.Promise(); }

 protected:
  void Execute() override { engine->Unload(); }

  void OnOK() override {
    busy->store(false);
    deferred.Resolve(Env().Undefined());
  }

  void OnError(const Napi::Error& error) override {
    busy->store(false);
    deferred.Reject(error.Value());
  }

 private:
  Napi::Promise::Deferred deferred;
  std::shared_ptr<LlamaVision> engine;
  std::shared_ptr<std::atomic<bool>> busy;
};

class PromptWorker : public Napi::AsyncWorker {
 public:
  PromptWorker(Napi::Env env, std::shared_ptr<LlamaVision> engine,
               std::shared_ptr<std::atomic<bool>> busy,
               PromptParams params, Napi::Function onToken)
      : Napi::AsyncWorker(env),
        deferred(Napi::Promise::Deferred::New(env)),
        engine(std::move(engine)),
        busy(std::move(busy)),
        params(std::move(params)) {
    if (!onToken.IsEmpty()) {
      tokenFn = Napi::ThreadSafeFunction::New(
          env, onToken, "llama-vision-token",
          /*max_queue_size=*/0, /*initial_thread_count=*/1);
      hasTokenFn = true;
    }
  }

  Napi::Promise Promise() const { return deferred.Promise(); }

 protected:
  void Execute() override {
    TokenCallback callback;
    if (hasTokenFn) {
      callback = [this](const std::string& piece) {
        auto* text = new std::string(piece);
        tokenFn.BlockingCall(
            text, [](Napi::Env env, Napi::Function fn, std::string* value) {
              fn.Call({Napi::String::New(env, *value)});
              delete value;
            });
      };
    }
    result = engine->Prompt(params, callback);
  }

  void OnOK() override {
    Finish();
    Napi::Env env = Env();
    if (result.ok) {
      Napi::Object out = Napi::Object::New(env);
      out.Set("text", Napi::String::New(env, result.text));
      out.Set("promptTokenCount",
              Napi::Number::New(env, result.promptTokenCount));
      out.Set("generatedTokenCount",
              Napi::Number::New(env, result.generatedTokenCount));
      out.Set("truncated", Napi::Boolean::New(env, result.truncated));
      deferred.Resolve(out);
    } else {
      Napi::Error error = Napi::Error::New(env, result.error);
      error.Set("partialText", Napi::String::New(env, result.text));
      deferred.Reject(error.Value());
    }
  }

  void OnError(const Napi::Error& error) override {
    Finish();
    deferred.Reject(error.Value());
  }

 private:
  void Finish() {
    if (hasTokenFn) {
      tokenFn.Release();
      hasTokenFn = false;
    }
    busy->store(false);
  }

  Napi::Promise::Deferred deferred;
  std::shared_ptr<LlamaVision> engine;
  std::shared_ptr<std::atomic<bool>> busy;
  PromptParams params;
  Napi::ThreadSafeFunction tokenFn;
  bool hasTokenFn = false;
  PromptResult result;
};

}  // namespace

// ---- Binding class ----

Napi::Object EngineBinding::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function constructor = DefineClass(
      env, "NativeEngine",
      {
          InstanceMethod("load", &EngineBinding::Load),
          InstanceMethod("generate", &EngineBinding::Prompt),
          InstanceMethod("unload", &EngineBinding::Unload),
          InstanceMethod("isLoaded", &EngineBinding::IsLoaded),
      });

  exports.Set("NativeEngine", constructor);
  exports.Set("mediaMarker",
              Napi::String::New(env, LlamaVision::MediaMarker()));
  return exports;
}

EngineBinding::EngineBinding(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<EngineBinding>(info),
      engine(std::make_shared<LlamaVision>()),
      busy(std::make_shared<std::atomic<bool>>(false)) {}

Napi::Value EngineBinding::Load(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "load() expects an options object")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (busy->exchange(true)) {
    Napi::Error::New(env, "another operation is in progress on this engine")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto* worker = new LoadWorker(
      env, engine, busy, ReadModelParams(info[0].As<Napi::Object>()));
  worker->Queue();
  return worker->Promise();
}

Napi::Value EngineBinding::Prompt(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "generate() expects an options object")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  Napi::Function onToken;
  if (info.Length() > 1 && info[1].IsFunction()) {
    onToken = info[1].As<Napi::Function>();
  }
  if (busy->exchange(true)) {
    Napi::Error::New(env, "another operation is in progress on this engine")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto* worker = new PromptWorker(
      env, engine, busy, ReadPromptParams(info[0].As<Napi::Object>()),
      onToken);
  worker->Queue();
  return worker->Promise();
}

Napi::Value EngineBinding::Unload(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (busy->exchange(true)) {
    Napi::Error::New(env, "another operation is in progress on this engine")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto* worker = new UnloadWorker(env, engine, busy);
  worker->Queue();
  return worker->Promise();
}

Napi::Value EngineBinding::IsLoaded(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), engine->IsLoaded());
}
