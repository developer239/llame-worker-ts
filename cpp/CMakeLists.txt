cmake_minimum_required(VERSION 3.24)
project(llameworker_node)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Provided by cmake-js.
include_directories(${CMAKE_JS_INC})

# The llameworker core (brings llama.cpp with it).
add_subdirectory(${CMAKE_SOURCE_DIR}/externals/llame-worker)

add_library(${PROJECT_NAME} SHARED
    src/addon.cpp
    src/EngineBinding.cpp
    src/EngineBinding.h
    ${CMAKE_JS_SRC}
)

set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/Release
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/Release
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    llameworker
    ${CMAKE_JS_LIB}
)

# Headers for node-addon-api.
execute_process(
    COMMAND node -p "require('node-addon-api').include_dir"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})

# Node-API 8: stable ThreadSafeFunction and friends; requires Node >= 18
# in practice for this package (matches package.json engines).
add_definitions(-DNAPI_VERSION=8)
