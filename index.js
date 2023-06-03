#!/usr/bin/env node

import {open, opendir, stat} from 'node:fs/promises';

import {parse, print} from 'recast';
import typeScriptParser from 'recast/parsers/typescript.js';

const options = {dryRun: false, extensions: ['.d.ts'], packages: new Set(), verbose: false};

/**
 * Recursively discovers matching files and directories in the given path and corrects any
 * unqualified exports and imports by appending the appropriate file names and extensions.
 */
async function processFiles(rootPath) {
  for await (const directoryEntry of await opendir(rootPath)) {
    /** Whether the current file contained exports/imports that have been corrected. */
    let hasFileBeenCorrected = false;
    /** Whether the path to the current file has so far been logged. */
    let hasPathBeenPrinted = false;
    /** Absolute path to the current directory or file. */
    const path = `${rootPath}/${directoryEntry.name}`;

    /**
     * @param {string} message
     * @param {'error' | 'info'} severity
     */
    const log = (message, severity = 'info') => {
      if (severity == 'info' && !options.verbose) return;

      if (!hasPathBeenPrinted) {
        hasPathBeenPrinted = true;
        console.log(path);
      }

      (severity == 'error' ? console.error : console.log)('\t', message);
    };

    if (directoryEntry.isDirectory() && directoryEntry.name != 'node_modules') {
      await processFiles(path);
    } else if (options.extensions.some((extension) => directoryEntry.name.endsWith(extension))) {
      const file = await open(path, 'r+');

      try {
        const ast = parse((await file.readFile()).toString(), {parser: typeScriptParser});

        for (const node of ast.program.body) {
          if ((node.type.startsWith('Export') || node.type.startsWith('Import'))
            && node.source?.value.startsWith('.')) {
            const unqualifiedPath = node.source.value;

            /** @type {Awaited<ReturnType<stat>>} */
            let stats;
            for (const suffix of ['', '/index.js', '.js']) {
              try {
                const qualifiedPath = `${unqualifiedPath}${suffix}`;
                stats = await stat(`${rootPath}/${qualifiedPath}`);
                if (!stats.isFile() /* is directory */) continue; // try next suffix

                if (suffix) { // needs qualification
                  log(`🛠️  ${unqualifiedPath} → ${qualifiedPath}`);
                  node.source.value = qualifiedPath;
                  hasFileBeenCorrected = true;
                } else { // already fully qualified
                  log(`✔️  ${qualifiedPath}`);
                }
                break;
              } catch (error) {
                if (error.code == 'ENOENT' /* no such file or directory */) continue; // try next suffix
                throw error;
              }
            }
            if (!stats) log(`❌  ${unqualifiedPath}`, 'error');
          }
        }

        // write modified file
        if (hasFileBeenCorrected && !options.dryRun) {
          await file.truncate();
          await file.write(print(ast, {quote: 'single'}).code, 0);
        }
      } finally {
        await file.close();
      }
    }
  }
}

for (const argument of process.argv.slice(2)) {
  switch (argument) {
    case '--dry-run': options.dryRun = options.verbose = true; break;
    case '--verbose': options.verbose = true; break;
    default:
      if (argument.startsWith('--extensions=')) {
        const extensions = argument.split('=')[1].split(',').filter((extension) => Boolean(extension.trim()));
        if (extensions.length) options.extensions = extensions;
      } else if (!argument.startsWith('--') && argument.match(/^[^._][^~)('!*]{1,214}$/)) {
        options.packages.add(argument);
      }
  }
}

if (options.packages.size) {
  options.packages.forEach(async (packageName) => await processFiles(`./node_modules/${packageName}`));
} else {
  console.log(`npx renova [--dry-run] [--extensions=<extension>,...] [--verbose] <package> ...

    <package>: Name of a package under ./node_modules to patch, e.g. '@apollo/client'.

    --dry-run: Print potential outcome without altering files. Implies --verbose.
 --extensions: Comma-separated list of file name extensions to process. Defaults to '.d.ts'.
    --verbose: Print all matching exports and imports.`);
}
