#!/usr/bin/env bash
# init.sh — the single verification gate for this repository.
#
# Every agent runs this before starting work and before declaring anything done.
# It must finish with "[OK] Environment ready".
#
# Steps whose tooling is not present yet are SKIPPED, not failed. That keeps the
# gate meaningful from the very first commit, before any application code exists.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

FAILURES=()

step() { printf '\n==> %s\n' "$1"; }
ok()   { printf '    [ok]   %s\n' "$1"; }
skip() { printf '    [skip] %s\n' "$1"; }
bad()  { printf '    [FAIL] %s\n' "$1"; FAILURES+=("$1"); }

# ---------------------------------------------------------------- 1. structure
step "Harness integrity"

REQUIRED=(
  AGENTS.md
  CLAUDE.md
  CHECKPOINTS.md
  feature_list.json
  docs/architecture.md
  docs/conventions.md
  docs/verification.md
  docs/domain-glossary.md
  specs/product-brief.md
  specs/domain-model.md
  progress/current.md
  progress/history.md
  .claude/agents/leader.md
  .claude/agents/explorer.md
  .claude/agents/spec-writer.md
  .claude/agents/implementer.md
  .claude/agents/reviewer.md
)

missing=0
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then bad "missing required file: $f"; missing=1; fi
done
[ "$missing" -eq 0 ] && ok "${#REQUIRED[@]} required files present"

for f in .claude/agents/*.md; do
  [ -e "$f" ] || continue
  if [ "$(head -n 1 "$f")" != "---" ]; then
    bad "$(basename "$f"): missing YAML frontmatter"
  elif ! head -n 5 "$f" | grep -qE '^name:[[:space:]]*\S+'; then
    bad "$(basename "$f"): frontmatter has no name field"
  fi
done

# ------------------------------------------------------------- 2. feature list
step "Feature list"

if command -v node >/dev/null 2>&1; then
  fl_out="$(node - <<'NODE'
const fs = require('fs');
let fl;
try {
  fl = JSON.parse(fs.readFileSync('feature_list.json', 'utf8'));
} catch (e) {
  console.log(`    [FAIL] feature_list.json is not valid JSON: ${e.message}`);
  process.exit(1);
}
console.log('    [ok]   feature_list.json parses');

const problems = [];
const { valid_status: vs, valid_spec_status: vss } = fl.rules;
const inProgress = [];

for (const f of fl.features) {
  const label = `#${f.id} ${f.name}`;
  if (!vs.includes(f.status)) problems.push(`${label} has invalid status '${f.status}'`);
  if (!vss.includes(f.spec_status)) problems.push(`${label} has invalid spec_status '${f.spec_status}'`);
  if (f.status === 'in_progress') inProgress.push(label);
  if (f.spec_status !== 'missing' && !fs.existsSync(f.spec_file))
    problems.push(`${label} declares spec_status '${f.spec_status}' but ${f.spec_file} does not exist`);
  if (f.status === 'done' && f.spec_status !== 'approved')
    problems.push(`${label} is done but its spec is not approved`);
  if (f.status === 'done' && (!f.acceptance || f.acceptance.length === 0))
    problems.push(`${label} is done but has no acceptance criteria`);
  // The convention is enforced, not merely documented.
  const expected = `specs/features/${String(f.id).padStart(3, '0')}-${f.name}.md`;
  if (f.spec_file !== expected)
    problems.push(`${label} spec_file is '${f.spec_file}'; convention requires '${expected}'`);
}

if (inProgress.length > 1) problems.push(`more than one feature in_progress: ${inProgress.join(', ')}`);
else console.log(`    [ok]   ${fl.features.length} features, ${inProgress.length} in progress`);

for (const p of problems) console.log(`    [FAIL] ${p}`);
process.exit(problems.length ? 1 : 0);
NODE
)"
  printf '%s
' "$fl_out"
  # one entry per problem, so this gate and init.ps1 agree on their own failure count
  while IFS= read -r line; do
    case "$line" in *"[FAIL]"*) FAILURES+=("${line#*"[FAIL] "}");; esac
  done <<< "$fl_out"
else
  skip "node not available; cannot validate feature_list.json"
fi

# ------------------------------------------------------------ 3. source sample
step "Source workbook untouched"

if [ -d .git ]; then
  dirty="$(git status --porcelain -- Samples 2>/dev/null)"
  if [ -z "$dirty" ]; then ok "Samples/ has no uncommitted changes"
  else bad "Samples/ has been modified: $dirty"; fi
else
  skip "not a git repository yet"
fi

# -------------------------------------------------------------- 4. node/js app
step "Application"

if [ ! -f package.json ]; then
  skip "no package.json yet (feature #2 app_scaffold)"
else
  if ! command -v node >/dev/null 2>&1; then
    bad "node is not on PATH"
  else
    NODE_VERSION="$(node --version)"
    MAJOR="${NODE_VERSION#v}"; MAJOR="${MAJOR%%.*}"
    if [ "$MAJOR" -lt 20 ]; then bad "node $NODE_VERSION is too old; need >= 20"
    else ok "node $NODE_VERSION"; fi
  fi

  if [ ! -d node_modules ]; then
    echo "    installing dependencies..."
    npm ci || bad "npm ci failed"
  else
    ok "node_modules present"
  fi

  if [ -f prisma/schema.prisma ]; then
    npx prisma validate >/dev/null 2>&1 && ok "prisma schema valid" || bad "prisma validate failed"
  else
    skip "no prisma schema yet (feature #4 domain_schema)"
  fi

  for s in typecheck lint test:unit test:e2e; do
    if node -e "process.exit(require('./package.json').scripts?.['$s'] ? 0 : 1)"; then
      echo "    npm run $s"
      npm run "$s" --silent && ok "npm run $s" || bad "npm run $s failed"
    else
      skip "no '$s' script yet"
    fi
  done
fi

# ------------------------------------------------------------------ 5. database
# Added by feature #3 auth_and_roles.
#
# The service tests and the migration check need a real Postgres. A machine that has not
# been given one is not broken, so this step SKIPS and says so rather than failing - the
# gate would otherwise block all work until Neon is configured. CHECKPOINTS.md C2.1
# closes the hole that opens: a feature may not be closed on a run that skipped here.
step "Database"

DB_SKIPPED=0

db_skip() {
  detail="${1#"[probe] "}"
  case "$detail" in
    "unreachable "*) detail="database unreachable at ${detail#unreachable }" ;;
  esac
  # Deliberately at column 0, unlike every other skip: AC-24 asks for a line that
  # BEGINS "[skip] " and ENDS "database-dependent checks skipped".
  printf '[skip] %s - database-dependent checks skipped\n' "$detail"
  DB_SKIPPED=1
}

if [ ! -f package.json ]; then
  skip "no package.json yet (feature #2 app_scaffold)"
elif ! node -e "process.exit(require('./package.json').scripts?.['test:db'] ? 0 : 1)"; then
  skip "no 'test:db' script yet"
else
  # One probe, shared with init.ps1, so the two scripts cannot disagree about whether a
  # database is there. It names the host and never the credentials.
  probe_ok=1
  probe_line=""
  for variable in DATABASE_URL TEST_DATABASE_URL; do
    if [ "$probe_ok" -eq 1 ]; then
      if probe_out="$(node scripts/db-probe.mjs "$variable")"; then
        :
      else
        probe_ok=0
        probe_line="$(printf '%s' "$probe_out" | tail -n 1)"
      fi
    fi
  done

  if [ "$probe_ok" -eq 0 ]; then
    db_skip "$probe_line"
  else
    ok "database reachable"

    if npx prisma migrate status; then
      ok "prisma migrate status"
    else
      bad "prisma migrate status: a migration is pending, or the schema has drifted"
    fi

    echo "    npm run test:db"
    npm run test:db --silent && ok "npm run test:db" || bad "npm run test:db failed"
  fi
fi

# ------------------------------------------------------------------- 6. verdict
echo
if [ "${#FAILURES[@]}" -eq 0 ]; then
  if [ "$DB_SKIPPED" -eq 1 ]; then
    echo "[OK] Environment ready (database checks skipped)"
  else
    echo "[OK] Environment ready"
  fi
  exit 0
else
  echo "[FAILED] ${#FAILURES[@]} problem(s):"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  echo
  echo "Do not mark any feature done. Record the blocker in progress/current.md."
  exit 1
fi
