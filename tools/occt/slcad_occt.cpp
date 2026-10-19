// slcad_occt.cpp: the small C entry point of Safety Lab's own OpenCascade build (13 Oct 2026, cad-C).
// Linked against an UNMODIFIED Open CASCADE Technology 7.8.1 (LGPL-2.1 with the OCCT exception),
// compiled to WebAssembly with native wasm exceptions; see tools/occt/build_occt.sh.
//
// One call reads a STEP file held in memory (normally one part cut out of a large assembly),
// walks it the way occt-import-js does (so part names match the existing readers), meshes it,
// and returns one buffer:
//   u32 jsonBytes | JSON (root tree, meshes, prototype sizes, timings) | pad to 4 |
//   per prototype: f32 positions[3v], u32 indices[3t], i32 faceRanges[2f]
#include <STEPCAFControl_Reader.hxx>
#include <STEPCAFControl_Controller.hxx>
#include <IGESCAFControl_Reader.hxx>
#include <IGESControl_Controller.hxx>
#include <cstdio>
#include <TDocStd_Document.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XCAFDoc_ColorTool.hxx>
#include <TDataStd_Name.hxx>
#include <TDF_ChildIterator.hxx>
#include <TDF_LabelSequence.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopExp_Explorer.hxx>
#include <BRep_Tool.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <Poly_Triangulation.hxx>
#include <Quantity_Color.hxx>
#include <Message_ProgressRange.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <Interface_Static.hxx>
#include <UnitsMethods_LengthUnit.hxx>
#include <OSD_Timer.hxx>
#include <sstream>
#include <string>
#include <vector>
#include <cstring>
#include <cstdint>
#include <cstdlib>
#include <chrono>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <gp_Pln.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Cone.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <gp_Circ.hxx>
#include <gp_Lin.hxx>
#include <map>
#include <XCAFDoc_DimTolTool.hxx>
#include <XCAFDoc_Dimension.hxx>
#include <XCAFDoc_GeomTolerance.hxx>
#include <XCAFDoc_Datum.hxx>
#include <XCAFDimTolObjects_DimensionObject.hxx>
#include <XCAFDimTolObjects_GeomToleranceObject.hxx>
#include <XCAFDimTolObjects_DatumObject.hxx>
#include <TCollection_HAsciiString.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <cmath>
#include <algorithm>
#include <emscripten/emscripten.h>

// Progress inside the STEP read: the parser pulls bytes through this buffer, which tells the page
// how far it has got (Module.onReadProgress, set by the worker).
EM_JS(void, sl_read_progress, (double f), { if (Module.onReadProgress) Module.onReadProgress(f); });
struct ProgressBuf : public std::streambuf {
  const char* b; size_t n, chunk, last = 0;
  ProgressBuf(const char* data, size_t len) : b(data), n(len) { chunk = std::max<size_t>(4096, std::min<size_t>(1 << 16, len / 200)); setg((char*)b, (char*)b, (char*)b + std::min(n, chunk)); }
  int_type underflow() override {
    size_t pos = gptr() - b; if (pos >= n) return traits_type::eof();
    setg((char*)b, (char*)b + pos, (char*)b + std::min(n, pos + chunk));
    if (pos - last >= n / 100 + 1) { last = pos; sl_read_progress((double)pos / (double)n); }
    return traits_type::to_int_type(*gptr());
  }
  pos_type seekoff(off_type off, std::ios_base::seekdir dir, std::ios_base::openmode) override {
    size_t base = dir == std::ios_base::beg ? 0 : dir == std::ios_base::cur ? (size_t)(gptr() - b) : n; size_t p = base + off; if (p > n) return pos_type(off_type(-1));
    setg((char*)b, (char*)b + p, (char*)b + std::min(n, p + chunk)); return pos_type(p);
  }
  pos_type seekpos(pos_type p, std::ios_base::openmode m) override { return seekoff(off_type(p), std::ios_base::beg, m); }
};
namespace {
struct Geo { std::vector<float> pos; std::vector<uint32_t> idx; std::vector<int32_t> faces; };
struct MeshRec { std::string name; bool hasColor = false; double rgb[3] = {0, 0, 0}; std::string kind; int proto = -1; double m[16]; };
struct Node { std::string name; std::vector<int> meshes; std::vector<Node> children; };
bool g_readIges = false;   // the document being walked came from an IGES file
struct Ctx {
  Handle(XCAFDoc_ShapeTool) st; Handle(XCAFDoc_ColorTool) ct;
  std::vector<MeshRec> meshes; std::vector<TopoDS_Shape> shapes; std::vector<std::string> kinds;
  std::vector<std::pair<TopoDS_Shape, double>> roots;
};
double nowMs() { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
std::string utf8(const TCollection_ExtendedString& e) { TCollection_AsciiString a(e, 0); return std::string(a.ToCString()); }
std::string nameNoRef(const TDF_Label& l) { Handle(TDataStd_Name) n; if (!l.FindAttribute(TDataStd_Name::GetID(), n)) return ""; return utf8(n->Get()); }
std::string labelName(const TDF_Label& l) { if (XCAFDoc_ShapeTool::IsReference(l)) { TDF_Label r; XCAFDoc_ShapeTool::GetReferredShape(l, r); return labelName(r); } return nameNoRef(l); }
bool labelColor(const Handle(XCAFDoc_ColorTool)& ct, const TDF_Label& l, double* rgb) {
  Quantity_Color q; XCAFDoc_ColorType ts[3] = {XCAFDoc_ColorSurf, XCAFDoc_ColorCurv, XCAFDoc_ColorGen};
  for (auto t : ts) if (ct->GetColor(l, t, q)) { rgb[0] = q.Red(); rgb[1] = q.Green(); rgb[2] = q.Blue(); return true; }
  if (XCAFDoc_ShapeTool::IsReference(l)) { TDF_Label r; XCAFDoc_ShapeTool::GetReferredShape(l, r); return labelColor(ct, r, rgb); }
  return false;
}
bool isFree(const TDF_Label& l) { TopoDS_Shape s; return XCAFDoc_ShapeTool::GetShape(l, s) && XCAFDoc_ShapeTool::IsFree(l); }
bool isMeshNode(const TDF_Label& l) {
  if (!l.HasChild()) return true;
  bool anyFree = false;
  for (TDF_ChildIterator it(l, false); it.More(); it.Next()) { if (XCAFDoc_ShapeTool::IsSubShape(it.Value())) return true; if (isFree(it.Value())) anyFree = true; }
  return !anyFree;
}
void trsfToArr(const gp_Trsf& t, double* m) {
  for (int r = 1; r <= 3; r++) for (int c = 1; c <= 3; c++) m[(c - 1) * 4 + (r - 1)] = t.Value(r, c);
  m[12] = t.Value(1, 4); m[13] = t.Value(2, 4); m[14] = t.Value(3, 4);
  m[3] = m[7] = m[11] = 0; m[15] = 1;
}
void writeNode(Ctx& C, const TDF_Label& l, Node& node) {
  node.name = labelName(l);
  if (isMeshNode(l)) {
    TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(l);
    std::vector<std::pair<TopoDS_Shape, std::string>> parts;
    for (TopExp_Explorer ex(shape, TopAbs_SOLID); ex.More(); ex.Next()) parts.push_back({ex.Current(), "solid"});
    for (TopExp_Explorer ex(shape, TopAbs_SHELL, TopAbs_SOLID); ex.More(); ex.Next()) parts.push_back({ex.Current(), "shell"});
    { TopExp_Explorer ex(shape, TopAbs_FACE, TopAbs_SHELL); if (ex.More()) parts.push_back({shape, "faces"}); }
    for (auto& p : parts) {
      MeshRec rec; rec.kind = p.second;
      if (p.second != "faces") {
        TDF_Label found;
        if (C.st->Search(p.first, found, true, true, true)) { rec.name = labelName(found); rec.hasColor = labelColor(C.ct, found, rec.rgb); }
      }
      // IGES (19 Oct 2026): IGES colors each surface entity, so the reader puts colors on the face sub-shapes; a part
      // shown in one color takes its own label's color, else the color most of its faces carry. STEP is read as before.
      if (!rec.hasColor && g_readIges) {
        rec.hasColor = labelColor(C.ct, l, rec.rgb);
        if (!rec.hasColor) {
          std::map<std::string, std::pair<int, std::vector<double>>> votes;
          for (TDF_ChildIterator it(l, false); it.More(); it.Next()) {
            if (!XCAFDoc_ShapeTool::IsSubShape(it.Value())) continue;
            double c[3]; if (!labelColor(C.ct, it.Value(), c)) continue;
            char kb[96]; snprintf(kb, sizeof kb, "%.9g,%.9g,%.9g", c[0], c[1], c[2]); std::string k(kb);
            auto& v = votes[k]; v.first++; v.second = {c[0], c[1], c[2]};
          }
          int best = 0;
          for (auto& kv : votes) if (kv.second.first > best) { best = kv.second.first; for (int j = 0; j < 3; j++) rec.rgb[j] = kv.second.second[j]; rec.hasColor = true; }
        }
      }
      node.meshes.push_back((int)C.meshes.size());
      C.meshes.push_back(rec); C.shapes.push_back(p.first); C.kinds.push_back(p.second);
    }
    return;
  }
  for (TDF_ChildIterator it(l, false); it.More(); it.Next()) if (isFree(it.Value())) { node.children.emplace_back(); writeNode(C, it.Value(), node.children.back()); }
}
void meshFaces(const TopoDS_Shape& shape, const std::string& kind, const gp_Trsf* toLocal, Geo& g) {
  int tri = 0;
  TopExp_Explorer ex = kind == "faces" ? TopExp_Explorer(shape, TopAbs_FACE, TopAbs_SHELL) : TopExp_Explorer(shape, TopAbs_FACE);
  for (; ex.More(); ex.Next()) {
    TopoDS_Face f = TopoDS::Face(ex.Current());
    TopLoc_Location loc;
    Handle(Poly_Triangulation) T = BRep_Tool::Triangulation(f, loc);
    int first = tri;
    if (!T.IsNull()) {
      gp_Trsf m = loc.Transformation();
      if (toLocal) m = (*toLocal) * m;
      uint32_t base = (uint32_t)(g.pos.size() / 3);
      for (int i = 1; i <= T->NbNodes(); i++) { gp_Pnt p = T->Node(i).Transformed(m); g.pos.push_back((float)p.X()); g.pos.push_back((float)p.Y()); g.pos.push_back((float)p.Z()); }
      bool rev = f.Orientation() == TopAbs_REVERSED;
      for (int t = 1; t <= T->NbTriangles(); t++) {
        int a, b, c; T->Triangle(t).Get(a, b, c);
        if (rev) { g.idx.push_back(base + a - 1); g.idx.push_back(base + c - 1); g.idx.push_back(base + b - 1); }
        else { g.idx.push_back(base + a - 1); g.idx.push_back(base + b - 1); g.idx.push_back(base + c - 1); }
        tri++;
      }
    }
    g.faces.push_back(first); g.faces.push_back(tri - 1);
  }
}
void jstr(std::string& o, const std::string& s) {
  o += '"';
  for (unsigned char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += (char)c; } else if (c < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += (char)c; }
  o += '"';
}
void jnode(std::string& o, const Node& n) {
  o += "{\"name\":"; jstr(o, n.name); o += ",\"meshes\":[";
  for (size_t i = 0; i < n.meshes.size(); i++) { if (i) o += ','; o += std::to_string(n.meshes[i]); }
  o += "],\"children\":[";
  for (size_t i = 0; i < n.children.size(); i++) { if (i) o += ','; jnode(o, n.children[i]); }
  o += "]}";
}
std::string num(double v) { char b[32]; snprintf(b, sizeof b, "%.17g", v); return b; }
bool g_init = false;
}
int keepDoc(const Handle(TDocStd_Document)& doc, const std::vector<TopoDS_Shape>& shapes, const std::vector<std::string>& kinds);

// IGES (19 Oct 2026): a file is IGES when its first record is an 80 column line with 'S' (start section)
// in column 73 and a sequence number in columns 74 to 80 (IGES 5.3, section 2.2.1); otherwise STEP. Records may
// end in LF, CRLF, or nothing (fixed 80 byte records). IGES is read by OCCT's own IGESCAFControl_Reader
// (names, colors) from a file in the module's memory file system, since that reader has no stream input.
static bool isIges(const uint8_t* d, int len) {
  if (len < 80 || d[72] != 'S') return false;
  int e = 0; while (e < len && d[e] != '\n' && d[e] != '\r') e++;
  if (e < 80) return false;
  bool digit = false;
  for (int i = 73; i < 80; i++) { if (d[i] >= '0' && d[i] <= '9') digit = true; else if (d[i] != ' ') return false; }
  if (!digit) return false;
  if (e == 80) return true;                                              // one record per line
  return len >= 160 && (d[152] == 'S' || d[152] == 'G');                 // fixed 80 byte records, no line breaks
}
static bool g_iges = false;
static bool readInto(const uint8_t* data, int len, Handle(TDocStd_Document)& doc, bool gdt, std::istream* stepIn) {
  g_readIges = isIges(data, len);
  if (g_readIges) {
    if (!g_iges) { IGESControl_Controller::Init(); g_iges = true; }
    FILE* f = fopen("/sl_part.igs", "wb"); if (!f) return false;
    size_t w = fwrite(data, 1, (size_t)len, f); fclose(f); if (w != (size_t)len) return false;
    IGESCAFControl_Reader reader; reader.SetColorMode(true); reader.SetNameMode(true); reader.SetLayerMode(false);
    bool ok = reader.ReadFile("/sl_part.igs") == IFSelect_RetDone && reader.Transfer(doc);
    remove("/sl_part.igs");
    return ok;
  }
  STEPCAFControl_Reader reader;
  reader.SetColorMode(true); reader.SetNameMode(true); reader.SetLayerMode(false); reader.SetGDTMode(gdt); reader.SetMatMode(false); reader.SetPropsMode(false);
  if (reader.ReadStream("part.stp", *stepIn) != IFSelect_RetDone) return false;
  sl_read_progress(1.0);
  return reader.Transfer(doc);
}

extern "C" {
// data/len: the STEP (or IGES) bytes. lin: linear deflection relative to each root's box (0.001), ang: radians (0.5).
// Returns a malloc'd buffer (caller frees with sl_free); *outLen its size. On failure *outLen = 0.
// sl_read with keep = 1 also keeps the document for exact queries and PMI; its handle is in the
// JSON ("handle"). sl_read is sl_read2 with keep = 0.
EMSCRIPTEN_KEEPALIVE uint8_t* sl_read2(const uint8_t* data, int len, double lin, double ang, int keep, int* outLen);
EMSCRIPTEN_KEEPALIVE uint8_t* sl_read(const uint8_t* data, int len, double lin, double ang, int* outLen) { return sl_read2(data, len, lin, ang, 0, outLen); }
EMSCRIPTEN_KEEPALIVE uint8_t* sl_read2(const uint8_t* data, int len, double lin, double ang, int keep, int* outLen) {
  *outLen = 0;
  try {
    if (!g_init) {
      Message::DefaultMessenger()->RemovePrinters(STANDARD_TYPE(Message_Printer));
      STEPCAFControl_Controller::Init();
      g_init = true;
    }
    double t0 = nowMs();
    Handle(TDocStd_Document) doc = new TDocStd_Document("BinXCAF");
    XCAFDoc_DocumentTool::SetLengthUnit(doc, 1.0, UnitsMethods_LengthUnit_Millimeter);
    ProgressBuf pb((const char*)data, (size_t)len); std::istream in(&pb);
    double t1 = nowMs();
    if (!readInto(data, len, doc, keep != 0, &in)) return nullptr;
    sl_read_progress(1.0);
    double t2 = nowMs();
    Ctx C; C.st = XCAFDoc_DocumentTool::ShapeTool(doc->Main()); C.ct = XCAFDoc_DocumentTool::ColorTool(doc->Main());
    Node root;
    for (TDF_ChildIterator it(C.st->Label(), false); it.More(); it.Next()) {
      TDF_Label k = it.Value();
      if (!isFree(k)) continue;
      TopoDS_Shape s = XCAFDoc_ShapeTool::GetShape(k);
      Bnd_Box b; BRepBndLib::Add(s, b, false);
      if (b.IsVoid()) continue;
      double x0, y0, z0, x1, y1, z1; b.Get(x0, y0, z0, x1, y1, z1);
      double avg = ((x1 - x0) + (y1 - y0) + (z1 - z0)) / 3.0, d = avg * lin; if (d < 1e-7) d = 1.0;
      C.roots.push_back({s, d});
      root.children.emplace_back(); writeNode(C, k, root.children.back());
    }
    for (auto& r : C.roots) BRepMesh_IncrementalMesh mm(r.first, r.second, false, ang, false);
    double t3 = nowMs();
    std::vector<Geo> protos; std::vector<TopoDS_Shape> bares;
    for (size_t i = 0; i < C.shapes.size(); i++) {
      const TopoDS_Shape& s = C.shapes[i];
      gp_Trsf tr = s.Location().Transformation();
      trsfToArr(tr, C.meshes[i].m);
      TopoDS_Shape bare = s.Located(TopLoc_Location());
      int hit = -1;
      for (size_t j = 0; j < bares.size(); j++) if (bares[j].IsPartner(bare) && C.kinds[j] == C.kinds[i] && bares[j].Orientation() == bare.Orientation()) { hit = (int)j; break; }
      if (hit < 0) {
        Geo g; gp_Trsf inv = tr.Inverted();
        bool ident = tr.Form() == gp_Identity;
        meshFaces(s, C.kinds[i], ident ? nullptr : &inv, g);
        hit = (int)protos.size(); protos.push_back(std::move(g)); bares.push_back(bare);
      }
      C.meshes[i].proto = hit;
    }
    double t4 = nowMs();
    std::string js = "{\"root\":"; jnode(js, root); js += ",\"meshes\":[";
    for (size_t i = 0; i < C.meshes.size(); i++) {
      const MeshRec& m = C.meshes[i]; if (i) js += ',';
      js += "{\"name\":"; jstr(js, m.name); js += ",\"kind\":"; jstr(js, m.kind); js += ",\"proto\":" + std::to_string(m.proto);
      if (m.hasColor) js += ",\"color\":[" + num(m.rgb[0]) + "," + num(m.rgb[1]) + "," + num(m.rgb[2]) + "]";
      js += ",\"matrix\":["; for (int k = 0; k < 16; k++) { if (k) js += ','; js += num(m.m[k]); } js += "]}";
    }
    js += "],\"protos\":[";
    for (size_t i = 0; i < protos.size(); i++) { if (i) js += ','; js += "{\"v\":" + std::to_string(protos[i].pos.size() / 3) + ",\"t\":" + std::to_string(protos[i].idx.size() / 3) + ",\"f\":" + std::to_string(protos[i].faces.size() / 2) + "}"; }
    std::string tail = ",\"ms\":{\"parse\":" + num(t1 - t0) + ",\"transfer\":" + num(t2 - t1) + ",\"mesh\":" + num(t3 - t2) + ",\"collect\":" + num(t4 - t3) + "}}";
    if (keep) js += "],\"handle\":" + std::to_string(keepDoc(doc, C.shapes, C.kinds)) + tail; else js += "]" + tail;
    size_t head = 4 + js.size(); size_t pad = (4 - head % 4) % 4; size_t total = head + pad;
    for (auto& g : protos) total += g.pos.size() * 4 + g.idx.size() * 4 + g.faces.size() * 4;
    uint8_t* out = (uint8_t*)malloc(total);
    uint32_t jl = (uint32_t)js.size(); memcpy(out, &jl, 4); memcpy(out + 4, js.data(), js.size()); memset(out + head, 0, pad);
    size_t o = head + pad;
    for (auto& g : protos) {
      memcpy(out + o, g.pos.data(), g.pos.size() * 4); o += g.pos.size() * 4;
      memcpy(out + o, g.idx.data(), g.idx.size() * 4); o += g.idx.size() * 4;
      memcpy(out + o, g.faces.data(), g.faces.size() * 4); o += g.faces.size() * 4;
    }
    // the document is released with its handle (Close needs an application object)
    *outLen = (int)total;
    return out;
  } catch (...) { return nullptr; }
}
EMSCRIPTEN_KEEPALIVE void sl_free(uint8_t* p) { free(p); }
}

// ---------------------------------------------------------------- exact queries (cad-C, 14 Oct)
// Parts kept for exact measurement: sl_load reads a part's file and keeps its shapes (the same
// solids, shells and loose faces, in the same order, as the meshes sl_read returns). sl_query
// answers one question on located copies of them, as JSON, with the same fields the
// opencascade.js session (cad_brep.js) gives, so the page cannot tell the two apart.
namespace {
struct Loaded { std::vector<TopoDS_Shape> shapes; std::vector<std::string> kinds; Handle(TDocStd_Document) doc; };
std::map<int, Loaded> g_parts; int g_next = 1;
std::string pt(const gp_Pnt& p) { return "[" + num(p.X()) + "," + num(p.Y()) + "," + num(p.Z()) + "]"; }
std::string dir(const gp_Dir& d) { return "[" + num(d.X()) + "," + num(d.Y()) + "," + num(d.Z()) + "]"; }
gp_Trsf trsfOf(const double* m) { gp_Trsf t; t.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]); return t; }
bool located(int h, int idx, const double* m, TopoDS_Shape& out, std::string& kind) {
  auto it = g_parts.find(h); if (it == g_parts.end() || idx < 0 || idx >= (int)it->second.shapes.size()) return false;
  out = it->second.shapes[idx].Moved(TopLoc_Location(trsfOf(m))); kind = it->second.kinds[idx]; return true;
}
void listOf(const TopoDS_Shape& s, const std::string& kind, TopAbs_ShapeEnum type, std::vector<TopoDS_Shape>& out) {
  if (type == TopAbs_FACE) { TopExp_Explorer ex = kind == "faces" ? TopExp_Explorer(s, TopAbs_FACE, TopAbs_SHELL) : TopExp_Explorer(s, TopAbs_FACE); for (; ex.More(); ex.Next()) out.push_back(ex.Current()); return; }
  TopTools_IndexedMapOfShape mp; TopExp::MapShapes(s, type, mp);
  for (int i = 1; i <= mp.Extent(); i++) out.push_back(mp(i));
}
bool dist(const TopoDS_Shape& a, const TopoDS_Shape& b, double& d, gp_Pnt& pa, gp_Pnt& pb) {
  BRepExtrema_DistShapeShape x(a, b, Extrema_ExtFlag_MIN, Extrema_ExtAlgo_Grad);
  if (!x.IsDone() || x.NbSolution() < 1) return false;
  d = x.Value(); pa = x.PointOnShape1(1); pb = x.PointOnShape2(1); return true;
}
std::string faceInfo(const TopoDS_Shape& s, int i) {
  TopoDS_Face f = TopoDS::Face(s);
  BRepAdaptor_Surface ad(f, true);
  std::string o = "{\"index\":" + std::to_string(i) + ",\"type\":";
  switch (ad.GetType()) {
    case GeomAbs_Plane: { gp_Ax1 ax = ad.Plane().Axis(); gp_Dir n = ax.Direction(); if (f.Orientation() == TopAbs_REVERSED) n.Reverse(); o += "\"plane\",\"normal\":" + dir(n) + ",\"origin\":" + pt(ax.Location()); break; }
    case GeomAbs_Cylinder: { gp_Cylinder c = ad.Cylinder(); o += "\"cylinder\",\"radius\":" + num(c.Radius()) + ",\"axis\":" + dir(c.Axis().Direction()) + ",\"origin\":" + pt(c.Axis().Location()); break; }
    case GeomAbs_Cone: { gp_Cone c = ad.Cone(); o += "\"cone\",\"axis\":" + dir(c.Axis().Direction()) + ",\"origin\":" + pt(c.Axis().Location()) + ",\"semiAngleDeg\":" + num(c.SemiAngle() * 180.0 / M_PI) + ",\"refRadius\":" + num(c.RefRadius()); break; }
    case GeomAbs_Sphere: { gp_Sphere c = ad.Sphere(); o += "\"sphere\",\"radius\":" + num(c.Radius()) + ",\"center\":" + pt(c.Location()); break; }
    case GeomAbs_Torus: { gp_Torus c = ad.Torus(); o += "\"torus\",\"majorRadius\":" + num(c.MajorRadius()) + ",\"minorRadius\":" + num(c.MinorRadius()) + ",\"axis\":" + dir(c.Axis().Direction()) + ",\"origin\":" + pt(c.Axis().Location()); break; }
    case GeomAbs_BezierSurface: o += "\"bezier\""; break;
    case GeomAbs_BSplineSurface: o += "\"bspline\""; break;
    case GeomAbs_SurfaceOfRevolution: o += "\"revolution\""; break;
    case GeomAbs_SurfaceOfExtrusion: o += "\"extrusion\""; break;
    case GeomAbs_OffsetSurface: o += "\"offset\""; break;
    default: o += "\"other\"";
  }
  GProp_GProps gp; BRepGProp::SurfaceProperties(f, gp); o += ",\"area\":" + num(gp.Mass()) + "}";
  return o;
}
std::string edgeInfo(const TopoDS_Shape& s, int i) {
  TopoDS_Edge e = TopoDS::Edge(s);
  std::string o = "{\"index\":" + std::to_string(i);
  if (BRep_Tool::Degenerated(e)) return o + ",\"type\":\"degenerate\"}";
  BRepAdaptor_Curve ad(e);
  const char* T[] = {"line", "circle", "ellipse", "hyperbola", "parabola", "bezier", "bspline", "offset", "other"};
  int t = (int)ad.GetType(); o += ",\"type\":\"" + std::string(t >= 0 && t < 9 ? T[t] : "other") + "\"";
  double f = ad.FirstParameter(), l = ad.LastParameter();
  o += ",\"start\":" + pt(ad.Value(f)) + ",\"end\":" + pt(ad.Value(l));
  GProp_GProps gp; BRepGProp::LinearProperties(e, gp); o += ",\"length\":" + num(gp.Mass());
  if (ad.GetType() == GeomAbs_Circle) { gp_Circ c = ad.Circle(); o += ",\"radius\":" + num(c.Radius()) + ",\"diameter\":" + num(2 * c.Radius()) + ",\"center\":" + pt(c.Axis().Location()) + ",\"axis\":" + dir(c.Axis().Direction()) + ",\"closed\":" + (std::fabs((l - f) - 2 * M_PI) < 1e-9 ? "true" : "false"); }
  if (ad.GetType() == GeomAbs_Line) o += ",\"direction\":" + dir(ad.Line().Direction());
  int N = ad.GetType() == GeomAbs_Line ? 1 : 48; o += ",\"points\":[";
  for (int k = 0; k <= N; k++) { if (k) o += ","; o += pt(ad.Value(f + (l - f) * k / N)); }
  return o + "]}";
}
char* outStr(const std::string& s, int* outLen) { char* p = (char*)malloc(s.size() + 1); memcpy(p, s.data(), s.size()); p[s.size()] = 0; *outLen = (int)s.size(); return p; }
}

extern "C" {
// Reads a part's STEP bytes and keeps its shapes; returns a handle (0 on failure).
EMSCRIPTEN_KEEPALIVE int sl_load(const uint8_t* data, int len) {
  try {
    if (!g_init) { Message::DefaultMessenger()->RemovePrinters(STANDARD_TYPE(Message_Printer)); STEPCAFControl_Controller::Init(); g_init = true; }
    Handle(TDocStd_Document) doc = new TDocStd_Document("BinXCAF");
    XCAFDoc_DocumentTool::SetLengthUnit(doc, 1.0, UnitsMethods_LengthUnit_Millimeter);
    std::string buf((const char*)data, (size_t)len); std::istringstream in(buf);
    if (!readInto(data, len, doc, false, &in)) return 0;
    Ctx C; C.st = XCAFDoc_DocumentTool::ShapeTool(doc->Main()); C.ct = XCAFDoc_DocumentTool::ColorTool(doc->Main());
    Node root;
    for (TDF_ChildIterator it(C.st->Label(), false); it.More(); it.Next()) {
      TDF_Label k = it.Value(); if (!isFree(k)) continue;
      TopoDS_Shape s = XCAFDoc_ShapeTool::GetShape(k); Bnd_Box b; BRepBndLib::Add(s, b, false); if (b.IsVoid()) continue;
      root.children.emplace_back(); writeNode(C, k, root.children.back());
    }
    Loaded L; L.shapes = C.shapes; L.kinds = C.kinds; L.doc = doc;
    int h = g_next++; g_parts[h] = L; return h;
  } catch (...) { return 0; }
}
EMSCRIPTEN_KEEPALIVE void sl_unload(int h) { g_parts.erase(h); }
// q: op, then numbers. Shapes are given as: handle index m0..m15 (placement, column-major).
//   props A | dist A B | face A i | edge A i | pick A px py pz faceHint(-1) | inter A B
EMSCRIPTEN_KEEPALIVE char* sl_query(const char* q, int* outLen) {
  *outLen = 0;
  try {
    std::istringstream in(q); std::string op; in >> op;
    auto readShape = [&](TopoDS_Shape& s, std::string& kind) { int h, idx; double m[16]; in >> h >> idx; for (int k = 0; k < 16; k++) in >> m[k]; return located(h, idx, m, s, kind); };
    TopoDS_Shape A, B; std::string ka, kb;
    if (!readShape(A, ka)) return outStr("{\"error\":\"no exact geometry for this part\"}", outLen);
    if (op == "props") {
      std::string o = "{\"kind\":\"" + ka + "\",\"exact\":true";
      GProp_GProps g;
      if (ka == "solid") { BRepGProp::VolumeProperties(A, g); o += ",\"volume\":" + num(g.Mass()) + ",\"centerOfVolume\":" + pt(g.CentreOfMass()); }
      GProp_GProps g2; BRepGProp::SurfaceProperties(A, g2); o += ",\"area\":" + num(g2.Mass());
      std::vector<TopoDS_Shape> fl, el, vl; listOf(A, ka, TopAbs_FACE, fl); listOf(A, ka, TopAbs_EDGE, el); listOf(A, ka, TopAbs_VERTEX, vl);
      o += ",\"faces\":" + std::to_string(fl.size()) + ",\"edges\":" + std::to_string(el.size()) + ",\"vertices\":" + std::to_string(vl.size());
      Bnd_Box b; BRepBndLib::AddOptimal(A, b, false, false);
      if (!b.IsVoid()) { double x0, y0, z0, x1, y1, z1; b.Get(x0, y0, z0, x1, y1, z1); o += ",\"bbox\":{\"min\":[" + num(x0) + "," + num(y0) + "," + num(z0) + "],\"max\":[" + num(x1) + "," + num(y1) + "," + num(z1) + "]}"; }
      return outStr(o + "}", outLen);
    }
    if (op == "dist" || op == "inter") {
      if (!readShape(B, kb)) return outStr("{\"error\":\"no exact geometry for this part\"}", outLen);
      if (op == "inter") {
        if (ka != "solid" || kb != "solid") return outStr("{\"ok\":false,\"err\":\"both parts must be solids\"}", outLen);
        BRepAlgoAPI_Common c(A, B); if (!c.IsDone()) return outStr("{\"ok\":false,\"err\":\"the boolean did not finish\"}", outLen);
        GProp_GProps g; BRepGProp::VolumeProperties(c.Shape(), g); double v = g.Mass(); if (v < 0) v = 0;
        return outStr("{\"ok\":true,\"volume\":" + num(v) + ",\"exact\":true}", outLen);
      }
      double d; gp_Pnt pa, pb; if (!dist(A, B, d, pa, pb)) return outStr("null", outLen);
      return outStr("{\"distance\":" + num(d) + ",\"a\":" + pt(pa) + ",\"b\":" + pt(pb) + ",\"exact\":true}", outLen);
    }
    if (op == "face" || op == "edge") {
      int i; in >> i; std::vector<TopoDS_Shape> l; listOf(A, ka, op == "face" ? TopAbs_FACE : TopAbs_EDGE, l);
      if (i < 0 || i >= (int)l.size()) return outStr("null", outLen);
      return outStr(op == "face" ? faceInfo(l[i], i) : edgeInfo(l[i], i), outLen);
    }
    if (op == "pick") {
      double p[3]; int hint; in >> p[0] >> p[1] >> p[2] >> hint;
      TopoDS_Vertex v = BRepBuilderAPI_MakeVertex(gp_Pnt(p[0], p[1], p[2])).Vertex();
      std::string o = "{\"exact\":true";
      std::vector<TopoDS_Shape> fl, el, vl; listOf(A, ka, TopAbs_FACE, fl); listOf(A, ka, TopAbs_EDGE, el); listOf(A, ka, TopAbs_VERTEX, vl);
      auto nearest = [&](const std::vector<TopoDS_Shape>& l, int only, int& bi, double& bd, gp_Pnt& at) {
        bi = -1; bd = 0;
        for (int i = 0; i < (int)l.size(); i++) { if (only >= 0 && i != only) continue; double d; gp_Pnt a, b; if (!dist(v, l[i], d, a, b)) continue; if (bi < 0 || d < bd - 1e-12) { bi = i; bd = d; at = b; } }
      };
      int bi; double bd; gp_Pnt at;
      nearest(fl, hint >= 0 && hint < (int)fl.size() ? hint : -1, bi, bd, at);
      if (bi >= 0) { std::string fi = faceInfo(fl[bi], bi); fi.pop_back(); o += ",\"face\":" + fi + ",\"distance\":" + num(bd) + "},\"point\":" + pt(at); }
      nearest(el, -1, bi, bd, at);
      if (bi >= 0) { std::string ei = edgeInfo(el[bi], bi); ei.pop_back(); o += ",\"edge\":" + ei + ",\"distance\":" + num(bd) + "},\"edgePoint\":" + pt(at); }
      int vb = -1; double vd = 0; gp_Pnt vp;
      for (int i = 0; i < (int)vl.size(); i++) { gp_Pnt q = BRep_Tool::Pnt(TopoDS::Vertex(vl[i])); double d = q.Distance(gp_Pnt(p[0], p[1], p[2])); if (vb < 0 || d < vd) { vb = i; vd = d; vp = q; } }
      if (vb >= 0) o += ",\"vertex\":{\"index\":" + std::to_string(vb) + ",\"point\":" + pt(vp) + ",\"distance\":" + num(vd) + "}";
      return outStr(o + "}", outLen);
    }
    return outStr("{\"error\":\"unknown query\"}", outLen);
  } catch (...) { return outStr("{\"error\":\"the query failed in OpenCascade\"}", outLen); }
}
}

int keepDoc(const Handle(TDocStd_Document)& doc, const std::vector<TopoDS_Shape>& shapes, const std::vector<std::string>& kinds) {
  Loaded L; L.shapes = shapes; L.kinds = kinds; L.doc = doc; int h = g_next++; g_parts[h] = L; return h;
}
namespace {
const char* DIMT[] = {"Location_None","Location_CurvedDistance","Location_LinearDistance","Location_LinearDistance_FromCenterToOuter","Location_LinearDistance_FromCenterToInner","Location_LinearDistance_FromOuterToCenter","Location_LinearDistance_FromOuterToOuter","Location_LinearDistance_FromOuterToInner","Location_LinearDistance_FromInnerToCenter","Location_LinearDistance_FromInnerToOuter","Location_LinearDistance_FromInnerToInner","Location_Angular","Location_Oriented","Location_WithPath","Size_CurveLength","Size_Diameter","Size_SphericalDiameter","Size_Radius","Size_SphericalRadius","Size_ToroidalMinorDiameter","Size_ToroidalMajorDiameter","Size_ToroidalMinorRadius","Size_ToroidalMajorRadius","Size_ToroidalHighMajorDiameter","Size_ToroidalLowMajorDiameter","Size_ToroidalHighMajorRadius","Size_ToroidalLowMajorRadius","Size_Thickness","Size_Angular","Size_WithPath","CommonLabel","DimensionPresentation"};
const char* TOLT[] = {"None","Angularity","CircularRunout","CircularityOrRoundness","Coaxiality","Concentricity","Cylindricity","Flatness","Parallelism","Perpendicularity","Position","ProfileOfLine","ProfileOfSurface","Straightness","Symmetry","TotalRunout"};
std::string hs(const Handle(TCollection_HAsciiString)& h) { return h.IsNull() ? std::string() : std::string(h->ToCString()); }
std::string polylines(const TopoDS_Shape& sh) {
  std::string o = "["; int n = 0;
  if (!sh.IsNull()) for (TopExp_Explorer ex(sh, TopAbs_EDGE); ex.More() && n < 4000; ex.Next()) {
    try {
      BRepAdaptor_Curve ad(TopoDS::Edge(ex.Current())); double f = ad.FirstParameter(), l = ad.LastParameter(); int N = ad.GetType() == GeomAbs_Line ? 1 : 16;
      std::string pl = "["; for (int k = 0; k <= N; k++) { if (k) pl += ","; pl += pt(ad.Value(f + (l - f) * k / N)); }
      if (n) o += ","; o += pl + "]"; n++;
    } catch (...) {}
  }
  return o + "]";
}
// the mesh shapes (by index) a PMI item points at: the label's shape is the part or a sub-shape of it
std::string refIdx(const Loaded& L, const TDF_LabelSequence& labs) {
  std::vector<int> hit;
  for (int i = 1; i <= labs.Length(); i++) {
    TopoDS_Shape s; if (!XCAFDoc_ShapeTool::GetShape(labs.Value(i), s) || s.IsNull()) continue;
    TopAbs_ShapeEnum t = s.ShapeType(); TopAbs_ShapeEnum sub = t == TopAbs_FACE ? TopAbs_FACE : t == TopAbs_EDGE ? TopAbs_EDGE : TopAbs_VERTEX;
    for (int k = 0; k < (int)L.shapes.size(); k++) {
      if (std::find(hit.begin(), hit.end(), k) != hit.end()) continue;
      if (L.shapes[k].IsPartner(s)) { hit.push_back(k); continue; }
      for (TopExp_Explorer ex(L.shapes[k], sub); ex.More(); ex.Next()) if (ex.Current().IsPartner(s)) { hit.push_back(k); break; }
    }
  }
  std::string o = "["; for (size_t i = 0; i < hit.size(); i++) { if (i) o += ","; o += std::to_string(hit[i]); } return o + "]";
}
std::string anchorOf(const TDF_LabelSequence& labs) {
  Bnd_Box b; bool any = false;
  for (int i = 1; i <= labs.Length(); i++) { TopoDS_Shape s; if (XCAFDoc_ShapeTool::GetShape(labs.Value(i), s) && !s.IsNull()) { BRepBndLib::Add(s, b, false); any = true; } }
  if (!any || b.IsVoid()) return "";
  double x0, y0, z0, x1, y1, z1; b.Get(x0, y0, z0, x1, y1, z1);
  return "[" + num((x0 + x1) / 2) + "," + num((y0 + y1) / 2) + "," + num((z0 + z1) / 2) + "]";
}
std::string common(const Handle(Standard_Transient)& any) {
  std::string o;
  auto pts = [&](bool hasT, gp_Pnt t, bool hasP, gp_Pnt p, bool hasP2, gp_Pnt p2) { if (hasT) o += ",\"textPoint\":" + pt(t); if (hasP) o += ",\"point\":" + pt(p); if (hasP2) o += ",\"point2\":" + pt(p2); };
  Handle(XCAFDimTolObjects_DimensionObject) d = Handle(XCAFDimTolObjects_DimensionObject)::DownCast(any);
  Handle(XCAFDimTolObjects_GeomToleranceObject) g = Handle(XCAFDimTolObjects_GeomToleranceObject)::DownCast(any);
  Handle(XCAFDimTolObjects_DatumObject) da = Handle(XCAFDimTolObjects_DatumObject)::DownCast(any);
  if (!d.IsNull()) { pts(d->HasTextPoint(), d->HasTextPoint() ? d->GetPointTextAttach() : gp_Pnt(), d->HasPoint(), d->HasPoint() ? d->GetPoint() : gp_Pnt(), d->HasPoint2(), d->HasPoint2() ? d->GetPoint2() : gp_Pnt());
    o += ",\"semanticName\":"; jstr(o, hs(d->GetSemanticName())); o += ",\"presentation\":" + polylines(d->GetPresentation()) + ",\"presentationName\":"; jstr(o, hs(d->GetPresentationName())); }
  if (!g.IsNull()) { pts(g->HasPointText(), g->HasPointText() ? g->GetPointTextAttach() : gp_Pnt(), g->HasPoint(), g->HasPoint() ? g->GetPoint() : gp_Pnt(), false, gp_Pnt());
    o += ",\"semanticName\":"; jstr(o, hs(g->GetSemanticName())); o += ",\"presentation\":" + polylines(g->GetPresentation()) + ",\"presentationName\":"; jstr(o, hs(g->GetPresentationName())); }
  if (!da.IsNull()) { pts(da->HasPointText(), da->HasPointText() ? da->GetPointTextAttach() : gp_Pnt(), da->HasPoint(), da->HasPoint() ? da->GetPoint() : gp_Pnt(), false, gp_Pnt());
    o += ",\"semanticName\":"; jstr(o, hs(da->GetSemanticName())); o += ",\"presentation\":" + polylines(da->GetPresentation()) + ",\"presentationName\":"; jstr(o, hs(da->GetPresentationName())); }
  return o;
}
std::string modelValue(const std::string& type, const TDF_LabelSequence& first, const TDF_LabelSequence& second) {
  try {
    std::vector<TopoDS_Shape> all;
    for (int i = 1; i <= first.Length(); i++) { TopoDS_Shape s; if (XCAFDoc_ShapeTool::GetShape(first.Value(i), s) && !s.IsNull()) all.push_back(s); }
    std::vector<TopoDS_Shape> sb;
    for (int i = 1; i <= second.Length(); i++) { TopoDS_Shape s; if (XCAFDoc_ShapeTool::GetShape(second.Value(i), s) && !s.IsNull()) sb.push_back(s); }
    if (type.find("Diameter") != std::string::npos || type.find("Radius") != std::string::npos) {
      std::vector<TopoDS_Shape> both = all; both.insert(both.end(), sb.begin(), sb.end());
      for (auto& sh : both) {
        for (TopExp_Explorer ex(sh, TopAbs_FACE); ex.More(); ex.Next()) { BRepAdaptor_Surface ad(TopoDS::Face(ex.Current()), true); if (ad.GetType() == GeomAbs_Cylinder) { double v = ad.Cylinder().Radius(); return num(type.find("Diameter") != std::string::npos ? 2 * v : v); } if (ad.GetType() == GeomAbs_Sphere) { double v = ad.Sphere().Radius(); return num(type.find("Diameter") != std::string::npos ? 2 * v : v); } }
        for (TopExp_Explorer ee(sh, TopAbs_EDGE); ee.More(); ee.Next()) { BRepAdaptor_Curve ac(TopoDS::Edge(ee.Current())); if (ac.GetType() == GeomAbs_Circle) { double v = ac.Circle().Radius(); return num(type.find("Diameter") != std::string::npos ? 2 * v : v); } }
      }
      return "";
    }
    if (type.find("Angular") != std::string::npos || all.empty() || sb.empty()) return "";
    BRep_Builder bld; TopoDS_Compound ca, cb; bld.MakeCompound(ca); bld.MakeCompound(cb);
    for (auto& x : all) bld.Add(ca, x); for (auto& x : sb) bld.Add(cb, x);
    double d; gp_Pnt pa, pb; if (!dist(ca, cb, d, pa, pb)) return "";
    return num(d);
  } catch (...) { return ""; }
}
}
extern "C" {
// The PMI of a document kept by sl_read2 (keep = 1): raw items; cad_brep.js finishes them the same
// way for either OpenCascade build (unit check, part ids, placement).
EMSCRIPTEN_KEEPALIVE char* sl_pmi(int h, int* outLen) {
  *outLen = 0;
  try {
    auto it = g_parts.find(h); if (it == g_parts.end() || it->second.doc.IsNull()) return outStr("[]", outLen);
    const Loaded& L = it->second;
    Handle(XCAFDoc_DimTolTool) D = XCAFDoc_DocumentTool::DimTolTool(L.doc->Main());
    std::string o = "["; bool firstItem = true;
    auto add = [&](const std::string& s) { if (!firstItem) o += ","; o += s; firstItem = false; };
    TDF_LabelSequence dl; D->GetDimensionLabels(dl);
    for (int i = 1; i <= dl.Length(); i++) {
      Handle(XCAFDoc_Dimension) at; if (!dl.Value(i).FindAttribute(XCAFDoc_Dimension::GetID(), at)) continue;
      Handle(XCAFDimTolObjects_DimensionObject) ob = at->GetObject(); int t = (int)ob->GetType();
      std::string type = t >= 0 && t < 32 ? DIMT[t] : std::to_string(t);
      std::string s = "{\"kind\":\"dimension\",\"id\":\"dim-" + std::to_string(i) + "\",\"type\":\"" + type + "\"";
      try { s += ",\"value\":" + num(ob->GetValue()); } catch (...) {}
      if (ob->IsDimWithPlusMinusTolerance()) s += ",\"upperTol\":" + num(ob->GetUpperTolValue()) + ",\"lowerTol\":" + num(ob->GetLowerTolValue());
      if (ob->IsDimWithRange()) s += ",\"upper\":" + num(ob->GetUpperBound()) + ",\"lower\":" + num(ob->GetLowerBound());
      s += common(ob);
      TDF_LabelSequence f, sc; D->GetRefShapeLabel(dl.Value(i), f, sc); TDF_LabelSequence all; for (int q = 1; q <= f.Length(); q++) all.Append(f.Value(q)); for (int q = 1; q <= sc.Length(); q++) all.Append(sc.Value(q));   // Append(sequence) would empty sc
      s += ",\"refs\":" + refIdx(L, all);
      std::string an = anchorOf(all); if (!an.empty()) s += ",\"anchorRaw\":" + an;
      std::string mv = modelValue(type, f, sc); if (!mv.empty()) s += ",\"modelValue\":" + mv;
      add(s + "}");
    }
    TDF_LabelSequence tl; D->GetGeomToleranceLabels(tl);
    for (int i = 1; i <= tl.Length(); i++) {
      Handle(XCAFDoc_GeomTolerance) at; if (!tl.Value(i).FindAttribute(XCAFDoc_GeomTolerance::GetID(), at)) continue;
      Handle(XCAFDimTolObjects_GeomToleranceObject) ob = at->GetObject(); int t = (int)ob->GetType();
      std::string s = "{\"kind\":\"tolerance\",\"id\":\"tol-" + std::to_string(i) + "\",\"type\":\"" + std::string(t >= 0 && t < 16 ? TOLT[t] : std::to_string(t).c_str()) + "\",\"value\":" + num(ob->GetValue()) + ",\"datums\":[";
      TDF_LabelSequence ds; bool fd = true;
      if (D->GetDatumOfTolerLabels(tl.Value(i), ds)) for (int k = 1; k <= ds.Length(); k++) { Handle(XCAFDoc_Datum) da; if (ds.Value(k).FindAttribute(XCAFDoc_Datum::GetID(), da)) { if (!fd) s += ","; jstr(s, hs(da->GetObject()->GetName())); fd = false; } }
      s += "]" + common(ob);
      TDF_LabelSequence f, sc; D->GetRefShapeLabel(tl.Value(i), f, sc); TDF_LabelSequence all; for (int q = 1; q <= f.Length(); q++) all.Append(f.Value(q)); for (int q = 1; q <= sc.Length(); q++) all.Append(sc.Value(q));   // Append(sequence) would empty sc
      s += ",\"refs\":" + refIdx(L, all);
      std::string an = anchorOf(all); if (!an.empty()) s += ",\"anchorRaw\":" + an;
      add(s + "}");
    }
    TDF_LabelSequence dsl; D->GetDatumLabels(dsl);
    for (int i = 1; i <= dsl.Length(); i++) {
      Handle(XCAFDoc_Datum) at; if (!dsl.Value(i).FindAttribute(XCAFDoc_Datum::GetID(), at)) continue;
      Handle(XCAFDimTolObjects_DatumObject) ob = at->GetObject();
      std::string s = "{\"kind\":\"datum\",\"id\":\"datum-" + std::to_string(i) + "\",\"type\":\"Datum\",\"name\":"; jstr(s, hs(ob->GetName()));
      s += common(ob);
      TDF_LabelSequence f, sc; D->GetRefShapeLabel(dsl.Value(i), f, sc); TDF_LabelSequence all; for (int q = 1; q <= f.Length(); q++) all.Append(f.Value(q)); for (int q = 1; q <= sc.Length(); q++) all.Append(sc.Value(q));   // Append(sequence) would empty sc
      s += ",\"refs\":" + refIdx(L, all);
      std::string an = anchorOf(all); if (!an.empty()) s += ",\"anchorRaw\":" + an;
      add(s + "}");
    }
    return outStr(o + "]", outLen);
  } catch (...) { return outStr("[]", outLen); }
}
}
