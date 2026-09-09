// Shared database-safety primitives for scripts/.
//
// Deliberately NOT a single enforced rule. Production is a dedicated, private
// Coolify Mongo instance reachable only via `docker exec` inside the Coolify
// network — scripts are routinely run against it *on purpose* (the audit
// script, cleanupOrphanedRecords.js, deleteGroups.js all do). A blanket
// "refuse production" check would just add friction to the normal, intended
// use of this folder.
//
// Instead: each script decides, from its own intent, which database (if any)
// it should refuse — e.g. deleteGroups.js refuses to --apply against Atlas,
// because the groups on its list are deliberately kept there;
// removeGraceCopyFromAtlas.js refuses anything that ISN'T Atlas, because
// Grace's group belongs only in production. Use these primitives to build
// that check, and always print the resolved target before doing anything.
// See docs/plan_db_cutover_and_grace_migration.md Session 2b step 2.

const PRODUCTION_MARKERS = [
  /bw0k4sgwsw8kkkg4skkc8ksw/i, // production Mongo container hostname on the Coolify box
  /78\.47\.128\.95/,           // Hetzner box public IP, in case a URI ever routes through it directly
];

const ATLAS_MARKERS = [/mongodb\+srv:\/\//i];

function isProductionUri(uri) {
  return PRODUCTION_MARKERS.some((pattern) => pattern.test(uri || ''));
}

function isAtlasUri(uri) {
  return ATLAS_MARKERS.some((pattern) => pattern.test(uri || ''));
}

function maskUri(uri) {
  if (!uri) return '(none)';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

/** Prints the resolved target + mode. Call this first, in every script. */
function printTarget(uri, mode) {
  console.log(`  Target database: ${maskUri(uri)}`);
  if (mode) console.log(`  Mode: ${mode}`);
}

module.exports = { isProductionUri, isAtlasUri, maskUri, printTarget };
