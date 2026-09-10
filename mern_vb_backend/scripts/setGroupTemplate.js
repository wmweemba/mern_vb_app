/**
 * Re-templates an existing group onto a GroupTemplate — Session 7 step 1 of
 * docs/plan_db_cutover_and_grace_migration.md.
 *
 * Needed because groups created before Phase 1 have no `templateKey` and no
 * `policies`, so `resolveLoanAccrualStrategy()` falls back to scheduled lending.
 * A grocery-chilimba group left in that state would keep producing fixed
 * installment loans instead of a revolving credit line.
 *
 * **Copies policies, features and vocabulary — deliberately NOT `defaults`.**
 * A live group's interestRate / monthlyContribution / cycleLengthMonths are real
 * configuration the treasurer has already set, not template defaults, and
 * overwriting them with catalogue values would silently restate their rules. Any
 * difference is REPORTED for a human to decide, never applied.
 *
 * The app's own PUT /api/group-settings/template refuses once a group has any
 * non-archived transaction — correct for self-service, but this is the migration
 * path, run deliberately with the treasurer's agreement and a backup behind it.
 *
 *   node scripts/setGroupTemplate.js --group <id> --template grocery_chilimba
 *   node scripts/setGroupTemplate.js --group <id> --template grocery_chilimba --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { printTarget, maskUri } = require('./utils/productionGuard');
const Group = require('../models/Group');
const GroupSettings = require('../models/GroupSettings');
const GroupTemplate = require('../models/GroupTemplate');

const APPLY = process.argv.includes('--apply');
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };

(async () => {
  const groupId = arg('--group');
  const templateKey = arg('--template');
  if (!groupId || !templateKey) {
    console.error('Usage: node scripts/setGroupTemplate.js --group <id> --template <key> [--apply]');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, { serverApi: { version: '1', strict: true, deprecationErrors: true } });

  console.log('\n🧩 Re-template group');
  printTarget(maskUri(uri), APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes — pass --apply to execute)');

  const group = await Group.findById(groupId);
  if (!group) throw new Error(`No group ${groupId}`);
  const settings = await GroupSettings.findOne({ groupId });
  if (!settings) throw new Error(`No GroupSettings for ${groupId}`);
  const template = await GroupTemplate.findOne({ key: templateKey, active: true });
  if (!template) throw new Error(`No active GroupTemplate "${templateKey}" — run scripts/seedGroupTemplates.js`);

  console.log(`\n   Group: ${group.name}`);
  console.log(`   templateKey: ${settings.templateKey || '(none)'}  ->  ${template.key}`);
  console.log(`   loanAccrual: ${settings.policies?.loanAccrual || '(none)'}  ->  ${template.policies?.loanAccrual}`);
  console.log(`   interestObligation: ${settings.policies?.interestObligation || '(none)'}  ->  ${template.policies?.interestObligation}`);

  // Report — never apply — differences in real configuration.
  const DEFAULT_KEYS = ['interestRate', 'monthlyContribution', 'cycleLengthMonths', 'interestMethod', 'profitSharingMethod'];
  const diffs = DEFAULT_KEYS
    .filter(k => template.defaults?.[k] !== undefined && String(settings[k]) !== String(template.defaults[k]))
    .map(k => `${k}: group has ${settings[k]}, template default is ${template.defaults[k]}`);
  if (diffs.length) {
    console.log('\n   ⚠️  Group configuration differs from the template defaults. NOT changed —');
    console.log('      these are the treasurer\'s real settings. Change them deliberately if wrong:');
    diffs.forEach(d => console.log(`      - ${d}`));
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  settings.templateKey = template.key;
  settings.policies = { ...(settings.policies || {}), ...(template.policies || {}) };
  if (template.features) settings.features = { ...(settings.features || {}), ...template.features };
  if (template.vocabulary) settings.vocabulary = { ...(settings.vocabulary || {}), ...template.vocabulary };
  await settings.save();

  console.log('\n✅ Re-templated. Policies, features and vocabulary copied; defaults left untouched.\n');
  await mongoose.disconnect();
})().catch(err => { console.error('\n❌', err.message, '\n'); process.exit(1); });
