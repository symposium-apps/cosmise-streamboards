'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
class RuntimeStateError extends Error {
  constructor() {
    super('RUNTIME_STATE_UNWRITABLE: App state cannot be read or written. Repair this app runtime directory ownership and permissions, then restart the managed app.');
    this.code = 'RUNTIME_STATE_UNWRITABLE';
  }
}
function probeState(file) {
  let directory;
  try {
    const root = path.dirname(file);
    fs.mkdirSync(root, { recursive: true });
    try { fs.readFileSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    directory = fs.mkdtempSync(path.join(root, '.health-'));
    const a = path.join(directory, 'probe');
    const b = path.join(directory, 'renamed');
    const value = crypto.randomUUID();
    fs.writeFileSync(a, value, { mode: 0o600, flag: 'wx' });
    if (fs.readFileSync(a, 'utf8') !== value) throw new Error('readback');
    fs.renameSync(a, b);
    fs.unlinkSync(b);
    fs.rmdirSync(directory);
    directory = null;
    return { writable: true, checked_at: new Date().toISOString(), code: null };
  } catch {
    throw new RuntimeStateError();
  } finally {
    if (directory) { try { fs.rmSync(directory, { recursive: true, force: true }); } catch {} }
  }
}
module.exports = { probeState, RuntimeStateError };
