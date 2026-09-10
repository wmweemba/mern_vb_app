/**
 * Every Mongoose model carrying a `groupId`, derived at run time.
 *
 * Hardcoded lists of collections rot as the schema grows, silently and without
 * failing — `deleteGroups.js` enumerated 10 when there were 16, and
 * `createThrowawayTestUser.js --delete` enumerated 6. Both left rows behind that
 * no query could ever see, because every normal query is group-scoped and an
 * orphan belongs to no group. That is where the 21 orphaned records cleaned up
 * on 2026-09-09 came from, and one throwaway-group lifecycle on 2026-09-10 was
 * observed leaving 3 more.
 *
 * This module reads the models directory and keeps whatever actually declares a
 * `groupId` path, so a new model is covered the moment it exists. See
 * CLAUDE.md "Known History & Gotchas" #10.
 *
 * `Group` itself is deliberately excluded — it is keyed by `_id`, not `groupId`,
 * and callers delete it separately after clearing everything that references it.
 */
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', '..', 'models');

function groupScopedModels() {
  return fs
    .readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const name = path.basename(f, '.js');
      let model;
      try {
        model = require(path.join(MODELS_DIR, f));
      } catch {
        return null; // not a model module
      }
      if (!model || typeof model.deleteMany !== 'function' || !model.schema) return null;
      if (!model.schema.path('groupId')) return null;
      return { name, model };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { groupScopedModels };
