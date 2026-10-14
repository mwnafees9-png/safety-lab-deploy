#!/bin/bash
# Builds site/vendor/occt-fast (13 Oct 2026, cad-C): Safety Lab's own WebAssembly build of
# Open Cascade Technology 7.8.1, UNMODIFIED (LGPL-2.1 with the OCCT exception, licenses copied
# beside the build), plus the small C entry point tools/occt/slcad_occt.cpp. Built with native
# wasm exceptions (no JavaScript exception trampolines) and without OCCT's signal conversion
# (setjmp), which makes reading and meshing a part about three times faster than the general
# opencascade.js build, and 10 MB instead of 50 MB. No eval in the glue (DYNAMIC_EXECUTION=0).
#
# Needs: git, cmake, ninja, about 6 GB of disk, an hour on 2 cores.
#   tools/occt/build_occt.sh <work dir>
set -euo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${1:-$HERE/../occt-work}"
mkdir -p "$WORK" && cd "$WORK"
[ -d emsdk ] || git clone -q --depth 1 https://github.com/emscripten-core/emsdk.git
(cd emsdk && ./emsdk install 3.1.74 && ./emsdk activate 3.1.74) >/dev/null
source emsdk/emsdk_env.sh >/dev/null 2>&1
[ -d occt ] || git clone -q --depth 1 --branch V7_8_1 https://github.com/Open-Cascade-SAS/OCCT.git occt
mkdir -p build && cd build
FL="-O3 -fwasm-exceptions -DNDEBUG -UOCC_CONVERT_SIGNALS"
emcmake cmake ../occt -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_LIBRARY_TYPE=Static \
  -DCMAKE_C_FLAGS="$FL" -DCMAKE_CXX_FLAGS="$FL" -DCMAKE_CXX_FLAGS_RELEASE="$FL" -DCMAKE_C_FLAGS_RELEASE="$FL" \
  -DBUILD_MODULE_Draw=OFF -DBUILD_MODULE_Visualization=ON -DBUILD_MODULE_ApplicationFramework=ON -DBUILD_MODULE_DataExchange=ON \
  -DBUILD_MODULE_ModelingAlgorithms=ON -DBUILD_MODULE_ModelingData=ON -DBUILD_MODULE_FoundationClasses=ON -DBUILD_DOC_Overview=OFF \
  -DUSE_FREETYPE=OFF -DUSE_TK=OFF -DUSE_TCL=OFF -DUSE_OPENGL=OFF -DUSE_GLES2=OFF -DUSE_XLIB=OFF -DUSE_FREEIMAGE=OFF -DUSE_RAPIDJSON=OFF \
  -DUSE_DRACO=OFF -DUSE_TBB=OFF -DUSE_VTK=OFF -DUSE_OPENVR=OFF -DUSE_FFMPEG=OFF -DBUILD_SAMPLES_QT=OFF >/dev/null
TK="TKDESTEP TKDE TKXCAF TKVCAF TKV3d TKService TKHLR TKCAF TKLCAF TKCDF TKXSBase TKMesh TKBO TKShHealing TKPrim TKTopAlgo TKGeomAlgo TKBRep TKGeomBase TKG3d TKG2d TKMath TKernel"
ninja -j"$(nproc)" $TK
L=lin32/clang/lib; LIBS=""; for t in $TK; do LIBS="$LIBS $L/lib$t.a"; done
em++ -O3 -fwasm-exceptions -sWASM_BIGINT=1 -std=c++17 -I include/opencascade "$HERE/tools/occt/slcad_occt.cpp" -o slcad_occt.js \
  -Wl,--start-group $LIBS -Wl,--end-group \
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB -sMODULARIZE=1 -sEXPORT_NAME=slcadOcct \
  -sEXPORTED_FUNCTIONS=_sl_read,_sl_free,_malloc,_free -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32 -sENVIRONMENT=worker,node -sDYNAMIC_EXECUTION=0
DEST="$HERE/site/vendor/occt-fast"; mkdir -p "$DEST"
cp slcad_occt.js slcad_occt.wasm "$DEST/"
cp ../occt/LICENSE_LGPL_21.txt ../occt/OCCT_LGPL_EXCEPTION.txt "$DEST/"
ls -la "$DEST"
