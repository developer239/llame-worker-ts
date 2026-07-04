#include <napi.h>

#include "EngineBinding.h"

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return EngineBinding::Init(env, exports);
}

NODE_API_MODULE(llama_vision_node, InitAll)
