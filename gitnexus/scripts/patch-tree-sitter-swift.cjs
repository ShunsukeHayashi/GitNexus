#!/usr/bin/env node
/**
 * WORKAROUND: tree-sitter-swift@0.6.0 binding.gyp build failure
 *
 * Background:
 *   tree-sitter-swift@0.6.0's binding.gyp contains an "actions" array that
 *   invokes `tree-sitter generate` to regenerate parser.c from grammar.js.
 *   This is intended for grammar developers, but the published npm package
 *   already ships pre-generated parser files (parser.c, scanner.c), so the
 *   actions are unnecessary for consumers. Since consumers don't have
 *   tree-sitter-cli installed, the actions always fail during `npm install`.
 *
 * Why we can't just upgrade:
 *   tree-sitter-swift@0.7.1 fixes this (removes postinstall, ships prebuilds),
 *   but it requires tree-sitter@^0.22.1. The upstream project pins tree-sitter
 *   to ^0.21.0 and all other grammar packages depend on that version.
 *   Upgrading tree-sitter would be a separate breaking change.
 *
 * How this workaround works:
 *   tree-sitter-swift is listed as an optionalDependency, so npm won't abort
 *   if its native build fails. However, npm may also remove the package
 *   entirely after a failed build. This script handles both cases:
 *
 *   1. If tree-sitter-swift exists but has no native binding:
 *      patch binding.gyp and rebuild
 *   2. If tree-sitter-swift was removed by npm after build failure:
 *      re-install with --ignore-scripts, patch, and rebuild
 *
 * TODO: Remove this script when tree-sitter is upgraded to ^0.22.x,
 *       which allows using tree-sitter-swift@0.7.1+ directly.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const nodeModules = path.join(__dirname, '..', 'node_modules');
const swiftDir = path.join(nodeModules, 'tree-sitter-swift');
const bindingPath = path.join(swiftDir, 'binding.gyp');

function patchAndRebuild() {
  const content = fs.readFileSync(bindingPath, 'utf8');

  if (content.includes('"actions"')) {
    // Strip Python-style comments (#) and trailing commas before JSON parsing
    // binding.gyp uses GYP format which allows both, but JSON.parse does not
    const cleaned = content
      .replace(/#[^\n]*/g, '')
      .replace(/,\s*([}\]])/g, '$1');
    const gyp = JSON.parse(cleaned);

    if (gyp.targets && gyp.targets[0] && gyp.targets[0].actions) {
      delete gyp.targets[0].actions;
      fs.writeFileSync(bindingPath, JSON.stringify(gyp, null, 2) + '\n');
      console.log('[tree-sitter-swift] Patched binding.gyp (removed actions array)');
    }
  }

  // Check if native binding already exists
  const bindingNode = path.join(swiftDir, 'build', 'Release', 'tree_sitter_swift_binding.node');
  if (fs.existsSync(bindingNode)) {
    return; // Already built
  }

  console.log('[tree-sitter-swift] Building native binding...');
  execSync('npx node-gyp rebuild', {
    cwd: swiftDir,
    stdio: 'pipe',
    timeout: 120000,
  });
  console.log('[tree-sitter-swift] Native binding built successfully');
}

try {
  // Case 1: package exists (npm kept it despite failed build)
  if (fs.existsSync(bindingPath)) {
    patchAndRebuild();
    process.exit(0);
  }

  // Case 2: package was removed by npm after build failure — re-install without scripts
  if (!fs.existsSync(swiftDir)) {
    console.log('[tree-sitter-swift] Package missing, re-installing with --ignore-scripts...');
    execSync('npm install tree-sitter-swift@0.6.0 --ignore-scripts --no-save', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      timeout: 60000,
    });
  }

  if (fs.existsSync(bindingPath)) {
    patchAndRebuild();
  } else {
    console.warn('[tree-sitter-swift] Could not install package. Swift support will be disabled.');
  }
} catch (err) {
  console.warn('[tree-sitter-swift] Could not build native binding:', err.message);
  console.warn('[tree-sitter-swift] Swift files will be skipped during analysis.');
}
