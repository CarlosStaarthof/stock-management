# init.ps1 — the single verification gate for this repository.
#
# Every agent runs this before starting work and before declaring anything done.
# It must finish with "[OK] Environment ready".
#
# Steps whose tooling is not present yet are SKIPPED, not failed. That keeps the
# gate meaningful from the very first commit, before any application code exists.

$ErrorActionPreference = 'Continue'
$script:Failures = @()
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step { param($Name) Write-Host ""; Write-Host "==> $Name" -ForegroundColor Cyan }
function Write-Ok   { param($Msg)  Write-Host "    [ok]   $Msg" -ForegroundColor Green }
function Write-Skip { param($Msg)  Write-Host "    [skip] $Msg" -ForegroundColor DarkGray }
function Write-Bad  { param($Msg)  Write-Host "    [FAIL] $Msg" -ForegroundColor Red; $script:Failures += $Msg }

# ---------------------------------------------------------------- 1. structure
Write-Step "Harness integrity"

$Required = @(
    'AGENTS.md',
    'CLAUDE.md',
    'CHECKPOINTS.md',
    'feature_list.json',
    'docs/architecture.md',
    'docs/conventions.md',
    'docs/verification.md',
    'docs/domain-glossary.md',
    'specs/product-brief.md',
    'specs/domain-model.md',
    'progress/current.md',
    'progress/history.md',
    '.claude/agents/leader.md',
    '.claude/agents/explorer.md',
    '.claude/agents/spec-writer.md',
    '.claude/agents/implementer.md',
    '.claude/agents/reviewer.md'
)

$missing = @()
foreach ($f in $Required) {
    if (-not (Test-Path (Join-Path $Root $f))) { $missing += $f }
}
if ($missing.Count -eq 0) {
    Write-Ok "$($Required.Count) required files present"
} else {
    foreach ($m in $missing) { Write-Bad "missing required file: $m" }
}

# Agent definitions must carry YAML frontmatter with a name.
Get-ChildItem (Join-Path $Root '.claude/agents') -Filter *.md -ErrorAction SilentlyContinue | ForEach-Object {
    $head = Get-Content $_.FullName -TotalCount 5
    if (($head.Count -lt 1) -or ($head[0] -ne '---')) {
        Write-Bad "$($_.Name): missing YAML frontmatter"
    } elseif (-not ($head -match '^name:\s*\S+')) {
        Write-Bad "$($_.Name): frontmatter has no name field"
    }
}

# ------------------------------------------------------------- 2. feature list
Write-Step "Feature list"

$flPath = Join-Path $Root 'feature_list.json'
$fl = $null
if (Test-Path $flPath) {
    try {
        $fl = Get-Content $flPath -Raw | ConvertFrom-Json
        Write-Ok "feature_list.json parses"
    } catch {
        Write-Bad "feature_list.json is not valid JSON: $($_.Exception.Message)"
    }
}

if ($null -ne $fl) {
    $validStatus = $fl.rules.valid_status
    $validSpec   = $fl.rules.valid_spec_status
    $inProgress  = @()

    foreach ($feat in $fl.features) {
        $label = "#$($feat.id) $($feat.name)"

        if ($validStatus -notcontains $feat.status) {
            Write-Bad "$label has invalid status '$($feat.status)'"
        }
        if ($validSpec -notcontains $feat.spec_status) {
            Write-Bad "$label has invalid spec_status '$($feat.spec_status)'"
        }
        if ($feat.status -eq 'in_progress') { $inProgress += $label }

        # A feature whose spec is drafted or approved must actually have that file.
        if ($feat.spec_status -ne 'missing') {
            if (-not (Test-Path (Join-Path $Root $feat.spec_file))) {
                Write-Bad "$label declares spec_status '$($feat.spec_status)' but $($feat.spec_file) does not exist"
            }
        }
        # The convention is enforced, not merely documented: NNN is the feature id
        # and the slug is the feature name. This is the check whose absence let
        # feature #1 point at a reference document for three sessions.
        $expected = "specs/features/{0:d3}-{1}.md" -f [int]$feat.id, $feat.name
        if ($feat.spec_file -ne $expected) {
            Write-Bad "$label spec_file is '$($feat.spec_file)'; convention requires '$expected'"
        }

        # Nothing may be implemented without an approved spec.
        if (($feat.status -eq 'done') -and ($feat.spec_status -ne 'approved')) {
            Write-Bad "$label is done but its spec is not approved"
        }
        if (($feat.status -eq 'done') -and ($feat.acceptance.Count -eq 0)) {
            Write-Bad "$label is done but has no acceptance criteria"
        }
    }

    if ($inProgress.Count -le 1) {
        Write-Ok "$($fl.features.Count) features, $($inProgress.Count) in progress"
    } else {
        Write-Bad "more than one feature in_progress: $($inProgress -join ', ')"
    }
}

# ------------------------------------------------------------ 3. source sample
Write-Step "Source workbook untouched"

if (Test-Path (Join-Path $Root '.git')) {
    $dirty = & git -C $Root status --porcelain -- Samples 2>$null
    if ([string]::IsNullOrWhiteSpace($dirty)) {
        Write-Ok "Samples/ has no uncommitted changes"
    } else {
        Write-Bad "Samples/ has been modified: $dirty"
    }
} else {
    Write-Skip "not a git repository yet"
}

# -------------------------------------------------------------- 4. node/js app
Write-Step "Application"

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
    Write-Skip "no package.json yet (feature #2 app_scaffold)"
} else {
    $node = (Get-Command node -ErrorAction SilentlyContinue)
    if ($null -eq $node) {
        Write-Bad "node is not on PATH"
    } else {
        $nodeVersion = & node --version
        $major = [int]($nodeVersion -replace '^v(\d+)\..*$', '$1')
        if ($major -lt 20) {
            Write-Bad "node $nodeVersion is too old; need >= 20"
        } else {
            Write-Ok "node $nodeVersion"
        }
    }

    if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
        Write-Host "    installing dependencies..."
        & npm ci --prefix $Root
        if ($LASTEXITCODE -ne 0) { Write-Bad "npm ci failed" } else { Write-Ok "dependencies installed" }
    } else {
        Write-Ok "node_modules present"
    }

    $pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    $scripts = @()
    if ($pkg.scripts) { $scripts = $pkg.scripts.PSObject.Properties.Name }

    if (Test-Path (Join-Path $Root 'prisma/schema.prisma')) {
        & npx prisma validate
        if ($LASTEXITCODE -ne 0) { Write-Bad "prisma validate failed" } else { Write-Ok "prisma schema valid" }
    } else {
        Write-Skip "no prisma schema yet (feature #4 domain_schema)"
    }

    foreach ($s in @('typecheck', 'lint', 'test:unit', 'test:e2e')) {
        if ($scripts -contains $s) {
            Write-Host "    npm run $s"
            & npm run $s --silent
            if ($LASTEXITCODE -ne 0) { Write-Bad "npm run $s failed" } else { Write-Ok "npm run $s" }
        } else {
            Write-Skip "no '$s' script yet"
        }
    }
}

# ------------------------------------------------------------------ 5. database
# Added by feature #3 auth_and_roles.
#
# The service tests and the migration check need a real Postgres. A machine that has not
# been given one is not broken, so this step SKIPS and says so rather than failing - the
# gate would otherwise block all work until Neon is configured. CHECKPOINTS.md C2.1
# closes the hole that opens: a feature may not be closed on a run that skipped here.
Write-Step "Database"

$script:DbSkipped = $false

function Write-DbSkip {
    param($ProbeLine)
    $detail = $ProbeLine.Replace('[probe] ', '')
    if ($detail.StartsWith('unreachable ')) {
        $detail = 'database unreachable at ' + $detail.Substring(12)
    }
    # Deliberately at column 0, unlike every other skip: AC-24 asks for a line that
    # BEGINS "[skip] " and ENDS "database-dependent checks skipped".
    Write-Host "[skip] $detail - database-dependent checks skipped" -ForegroundColor DarkGray
    $script:DbSkipped = $true
}

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
    Write-Skip "no package.json yet (feature #2 app_scaffold)"
} elseif ($scripts -notcontains 'test:db') {
    Write-Skip "no 'test:db' script yet"
} else {
    # One probe, shared with init.sh, so the two scripts cannot disagree about whether a
    # database is there. It names the host and never the credentials.
    $probeOk = $true
    $probeLine = ''
    foreach ($variable in @('DATABASE_URL', 'TEST_DATABASE_URL')) {
        if ($probeOk) {
            $probeOut = & node (Join-Path $Root 'scripts/db-probe.mjs') $variable
            if ($LASTEXITCODE -ne 0) {
                $probeOk = $false
                $probeLine = ($probeOut | Select-Object -Last 1)
            }
        }
    }

    if (-not $probeOk) {
        Write-DbSkip $probeLine
    } else {
        Write-Ok "database reachable"

        & npx prisma migrate status
        if ($LASTEXITCODE -ne 0) {
            Write-Bad "prisma migrate status: a migration is pending, or the schema has drifted"
        } else {
            Write-Ok "prisma migrate status"
        }

        Write-Host "    npm run test:db"
        & npm run test:db --silent
        if ($LASTEXITCODE -ne 0) { Write-Bad "npm run test:db failed" } else { Write-Ok "npm run test:db" }
    }
}

# ------------------------------------------------------------------- 6. verdict
Write-Host ""
if ($script:Failures.Count -eq 0) {
    if ($script:DbSkipped) {
        Write-Host "[OK] Environment ready (database checks skipped)" -ForegroundColor Green
    } else {
        Write-Host "[OK] Environment ready" -ForegroundColor Green
    }
    exit 0
} else {
    Write-Host "[FAILED] $($script:Failures.Count) problem(s):" -ForegroundColor Red
    foreach ($f in $script:Failures) { Write-Host "  - $f" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Do not mark any feature done. Record the blocker in progress/current.md." -ForegroundColor Yellow
    exit 1
}
