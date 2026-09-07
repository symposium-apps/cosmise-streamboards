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
function atomicWrite(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let created = false;
  let fd = null;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    created = true;
    fs.writeFileSync(fd, value);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    if (!fs.readFileSync(temporary).equals(Buffer.from(value))) throw new Error('readback');
    fs.renameSync(temporary, file);
    created = false;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    if (created) { try { fs.unlinkSync(temporary); } catch {} }
  }
}
function probeState(file) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let original = Buffer.from('{}\n');
    try { original = fs.readFileSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parsed = JSON.parse(original.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid state');
    // Exercise the SAME atomic replacement boundary as persistence, preserving
    // the exact existing bytes. A scratch subdirectory cannot prove this.
    atomicWrite(file, original);
    return { writable: true, checked_at: new Date().toISOString(), code: null };
  } catch { throw new RuntimeStateError(); }
}
module.exports = { probeState, atomicWrite, RuntimeStateError };
