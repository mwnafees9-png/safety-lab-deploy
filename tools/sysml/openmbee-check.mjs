// Parses .sysml files with the OpenMBEE SysML v2 service and prints, per file, one JSON line:
// {"file": "...", "diagnostics": [...]}. One service connection for all files (13 Oct 2026).
import { connect } from "@openmbee/opensysml";
const conn = await connect();
try {
  for (const f of process.argv.slice(2)) {
    const m = await conn.load(f);
    console.log(JSON.stringify({ file: f, diagnostics: m.diagnostics || [] }));
  }
} finally { await conn.close(); }
