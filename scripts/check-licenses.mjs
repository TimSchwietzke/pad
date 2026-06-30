#!/usr/bin/env node
// License gate. Fails (exit 1) if any SHIPPED dependency carries a copyleft
// license that would jeopardize selling pad as proprietary software — GPL, AGPL,
// LGPL and other strong copyleft. Permissive licenses (MIT/BSD/ISC/Apache-2.0)
// pass; MPL-2.0 is allowed on purpose (weak, file-level copyleft — fine for
// proprietary use). A denylist is used, not an allowlist, so harmless new SPDX
// variants don't cause false failures; only the real risks trip it.
//
// Scope = what actually ships: the npm packages installed under frontend/ and the
// Go modules compiled into the pad binary (not the full `go list -m all` graph,
// which also pulls in goose's optional, unused DB drivers).
//
// Run from the repo root: `node scripts/check-licenses.mjs`.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

// Licenses that block proprietary distribution -> hard fail.
const DENY = /AGPL|LGPL|GPL|SSPL|\bOSL\b|EUPL|CDDL|CPAL|\bEPL\b|CC-BY-SA/i
// Weak copyleft we accept explicitly (so it can never be caught by DENY).
const ALLOW = /MPL-2\.0|Mozilla Public/i

const offenders = []
const summary = {}
const tally = (lic) => {
  summary[lic] = (summary[lic] || 0) + 1
}
const isDenied = (lic) => DENY.test(lic) && !ALLOW.test(lic)

// ---- frontend: every installed npm package -------------------------------
function scanNodeModules(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === '.bin') continue
    const p = join(dir, e.name)
    if (e.name.startsWith('@')) {
      scanNodeModules(p) // scoped packages: recurse into the scope dir
      continue
    }
    const pkg = join(p, 'package.json')
    if (existsSync(pkg)) {
      try {
        const j = JSON.parse(readFileSync(pkg, 'utf8'))
        let lic =
          j.license ||
          (Array.isArray(j.licenses) ? j.licenses.map((x) => x.type || x).join(' OR ') : j.licenses) ||
          'UNKNOWN'
        if (typeof lic === 'object') lic = JSON.stringify(lic)
        tally(lic)
        if (isDenied(lic)) offenders.push(`npm  ${j.name}@${j.version} :: ${lic}`)
      } catch {
        // unreadable package.json — skip
      }
    }
    const nested = join(p, 'node_modules')
    if (existsSync(nested)) scanNodeModules(nested)
  }
}
scanNodeModules(join(repoRoot, 'frontend', 'node_modules'))

// ---- backend: Go modules actually linked into the pad binary -------------
function classifyGoLicense(text) {
  if (/GNU AFFERO|AGPL/i.test(text)) return 'AGPL'
  if (/LESSER GENERAL PUBLIC|LGPL/i.test(text)) return 'LGPL'
  if (/GNU GENERAL PUBLIC/i.test(text)) return 'GPL'
  if (/Mozilla Public License/i.test(text)) return 'MPL-2.0'
  if (/Apache License/i.test(text)) return 'Apache-2.0'
  if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT'
  if (/Redistribution and use in source and binary/i.test(text)) return 'BSD'
  if (/ISC License|Internet Systems Consortium/i.test(text)) return 'ISC'
  return 'OTHER/UNKNOWN'
}

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'LICENCE', 'License', 'license', 'LICENSE-MIT']

let goOut = ''
try {
  goOut = execFileSync(
    'go',
    ['list', '-deps', '-f', '{{if and (not .Standard) .Module}}{{.Module.Dir}}|{{.Module.Path}}{{end}}', './cmd/pad'],
    { cwd: join(repoRoot, 'backend'), encoding: 'utf8' },
  )
} catch (err) {
  console.error('failed to run `go list` for the backend:', err.message)
  process.exit(2)
}

const seen = new Set()
for (const line of goOut.split(/\r?\n/)) {
  const [dir, modPath] = line.split('|')
  if (!dir || !modPath || seen.has(modPath)) continue
  seen.add(modPath)
  if (modPath.startsWith('github.com/TimSchwietzke/pad')) continue // our own code
  let lic = 'OTHER/UNKNOWN'
  for (const n of LICENSE_FILES) {
    const f = join(dir, n)
    if (existsSync(f)) {
      try {
        lic = classifyGoLicense(readFileSync(f, 'utf8').slice(0, 4000))
        break
      } catch {
        // unreadable — keep looking
      }
    }
  }
  tally(lic)
  if (isDenied(lic)) offenders.push(`go   ${modPath} :: ${lic}`)
}

// ---- report --------------------------------------------------------------
console.log('license summary (shipped dependencies):')
for (const [lic, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${lic}`)
}

if (offenders.length) {
  console.error('\nDISALLOWED copyleft license(s) found — pad could not ship as proprietary:')
  for (const o of offenders) console.error('  ' + o)
  console.error('\nResolve by removing/replacing the dependency, or (if genuinely safe) widen the allow-list in scripts/check-licenses.mjs.')
  process.exit(1)
}
console.log('\nOK: no disallowed copyleft licenses in shipped dependencies.')
