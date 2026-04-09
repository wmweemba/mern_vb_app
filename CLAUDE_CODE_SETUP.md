# Claude Code Setup Guide — Chama360 Sprint
### April 2026 | William Mweemba

---

## 1. CLAUDE.md Placement

Drop `CLAUDE.md` in the **monorepo root** (same level as the root `package.json`):

```
mern_vb_app/
├── CLAUDE.md        ← put it here
├── package.json
├── mern_vb_backend/
└── mern-vb-frontend/
```

Claude Code reads this automatically on every session. No configuration needed.

---

## 2. Recommended Skills — Curated Shortlist

After reviewing composiohq/awesome-claude-skills, anthropics repos, and obra/superpowers,
here is an honest assessment: most community skill repos are prompt collections, not
structured Claude Code skills. The signal-to-noise ratio is low.

For your MERN PWA stack, here is what actually matters:

### Skills Worth Setting Up

**A. Create a local `.claude/` skills folder in your repo root:**

```
mern_vb_app/
├── .claude/
│   ├── skills/
│   │   ├── mern-patterns.md
│   │   ├── pwa-checklist.md
│   │   ├── security-checklist.md
│   │   └── financial-logic-rules.md
│   └── commands/
│       ├── audit-balance.md
│       ├── new-feature.md
│       └── pre-commit.md
```

**B. The four skills you actually need — build these yourself (takes 30 mins once):**

### Skill 1: `financial-logic-rules.md`
Your most important skill. Reference it before any calculation change.
Content: the bank balance formula, reducing vs flat rate, atomic transaction rules,
the list of known corruption patterns from the CHANGELOG.

### Skill 2: `mern-patterns.md`
Content: your folder conventions, how to add a new route (controller → routes → test),
Mongoose session pattern for atomic ops, the global event system pattern.

### Skill 3: `pwa-checklist.md`
Content: vite.config.js PWA constraints, what breaks offline support, how to test
install behaviour, manifest requirements. Short — 20 lines is enough.

### Skill 4: `security-checklist.md`
Content: JWT middleware must be on all routes, role middleware order, never skip
auth on new endpoints, CORS domains, env var rules (no hardcoding).

**Why build your own instead of grabbing community repos?**
Community skills are generic. Yours will know that fine payments only credit the bank
on payment (not issuance), that Opus-generated plans go in `docs/plan_*.md`, and that
backend PDF generation was intentionally removed. Generic skills don't know any of that.

### Claude Code Custom Commands (high value, low effort)

Create these in `.claude/commands/`:

**`new-feature.md`** — prompts Claude to:
1. Check CLAUDE.md constraints before starting
2. Plan the feature in a `docs/plan_[feature].md` file first
3. Write tests before implementation
4. Run existing tests before committing

**`audit-balance.md`** — prompts Claude to:
1. Run `node scripts/auditBankBalance.js`
2. Compare result to app-reported balance
3. Flag any discrepancy > ZMW 1

**`pre-commit.md`** — prompts Claude to:
1. Run `pnpm test` in both workspaces
2. Check for console.log statements
3. Verify no hardcoded values (URLs, amounts, rates)
4. Confirm env vars are referenced, not inlined

---

## 3. Manual Model-Switching Protocol

You are on Claude Pro. No automated model routing. That's fine — manual discipline
with a clear trigger system is more reliable for a solo sprint than a pipeline
you'd spend evenings debugging.

### The Two-Mode System

**MODE A — PLAN MODE (invoke Opus manually)**

Trigger: before any task where getting it wrong means data corruption or a full
refactor later.

How to invoke in Claude Code:
```bash
claude --model claude-opus-4-5
```

What to ask Opus to produce:
- A `docs/plan_[feature].md` file with:
  - What is being built and why
  - Files that will be touched
  - Step-by-step implementation order
  - Edge cases and risks
  - Test cases to write

You review this plan. If it makes sense, switch to Sonnet and implement it.

**Opus triggers (be disciplined — don't use it for everything):**
- Designing GroupSettings schema + migration strategy
- Planning the groupSettings wiring across controllers
- Figuring out a bank balance bug
- Designing the onboarding wizard flow
- Any task touching loanCalculator.js

**MODE B — BUILD MODE (Sonnet — default)**

Everything else:
- UI components and forms
- Implementing a plan already written in `docs/plan_*.md`
- Writing tests
- CSS/layout fixes
- Routine CRUD endpoints
- CHANGELOG updates
- README edits

### The Discipline Rule

> "If I need to think, use Opus to think first and write it down.
>  If I need to build, use Sonnet to execute what's already been thought through."

Never ask Opus to implement. Never ask Sonnet to design financial logic from scratch.

### Context Management (Critical for 1.5hr sessions)

Each Claude Code session starts fresh. To avoid wasting 20 mins re-explaining
context every evening:

1. Keep `CLAUDE.md` updated — it's your persistent memory
2. Start each session with: `"Read CLAUDE.md and tell me what we're doing tonight"`
3. When Opus writes a plan, it goes in `docs/plan_[feature].md` — Sonnet reads it next session
4. End each session with: `"Update CLAUDE.md with anything that changed tonight"`

---

## 4. Folder Structure to Create Now

Run this from your repo root:

```bash
mkdir -p .claude/skills
mkdir -p .claude/commands
mkdir -p docs
```

Then create these stub files and fill them in over the next 2 evenings:

```bash
touch .claude/skills/financial-logic-rules.md
touch .claude/skills/mern-patterns.md
touch .claude/skills/pwa-checklist.md
touch .claude/skills/security-checklist.md
touch .claude/commands/new-feature.md
touch .claude/commands/audit-balance.md
touch .claude/commands/pre-commit.md
```

The `docs/` folder is where Opus-generated plans will live:
```bash
# Example — Opus creates this, Sonnet reads it
docs/plan_group-settings.md
docs/plan_onboarding-wizard.md
docs/plan_clerk-auth.md
```

---

## 5. Tonight's Day 1 Session — Exactly What to Do

**Time budget: 1.5–2 hours**

Open Claude Code in your repo root. Start with:
```
"Read CLAUDE.md. Tonight is Day 1 of the April sprint. 
I need to map the codebase — find where interest calculations, 
bank balance updates, and fines logic live. Then we'll do a 
numbers audit against the real group data. Let's start."
```

Claude Code will know the full context from CLAUDE.md and get straight to work.

For the numbers audit (manual — do this yourself in parallel):
- Open MongoDB Atlas or your local DB
- Export all transactions since cycle start
- Recreate bank balance from scratch using the formula in CLAUDE.md
- Compare to what the app shows

Log everything in the sprint doc as you go.

---

## 6. The Shiny Object Defence in Claude Code

When a new idea hits mid-session:

```
"Park this idea: [idea]. 
Add it to the Shiny Object Parking Lot in the sprint doc. 
Then bring me back to [current task]."
```

Claude Code will log it and refocus. You've built the habit into the tooling.

---

*Setup time: ~45 mins to complete steps 1–4*
*Payoff: every evening session starts immediately, no re-explaining context*
