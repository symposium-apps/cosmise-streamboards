'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED = new Set(['.git', '.sym-data', 'node_modules']);

function inventoryFiles(root, limit = 100) {
  const items = [];
  let count = 0;
  function visit(directory) {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || EXCLUDED.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        count += 1;
        if (items.length < limit) items.push(path.relative(root, absolute));
      }
    }
  }
  visit(root);
  return { count, items, truncated: count > items.length };
}

module.exports = { inventoryFiles };
