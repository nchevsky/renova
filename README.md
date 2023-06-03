# Overview

`renova` patches third-party packages with non-fully-ESM-compliant source and/or TypeScript declaration files (e.g. `@apollo/client`) by appending explicit file names and extensions to unqualified `export` and `import` statements, facilitating `nodenext`/`node16`+ module resolution of dependencies with legacy exports.

For example, given the following source tree:

- `directory/`
  - `index.js`
- `file.js`

Unqualified exports and imports are corrected as follows:

## Input
```js
export {foo} from './directory';
import bar from './file';
```

## Output
```js
export {foo} from './directory/index.js';
import bar from './file.js';
```

# Usage

## Automatic

📍 `package.json`

```json
{
  "scripts": {
    "dependencies": "renova @apollo/client"
  }
}
```

This will patch `@apollo/client`'s `.d.ts` files whenever dependencies are installed or upgraded.

💡 Note that, when run from the `dependencies` lifecycle script, no output may be printed. In contrast, `postinstall` does allow output but is only executed when installing _all_ dependencies; not when installing or upgrading one or more specific packages.

## Manual
```shell
$ npx renova [--dry-run] [--extensions=<extension>,...] [--verbose] <package> ...

    <package>: Name of a package under ./node_modules to patch, e.g. '@apollo/client'.

    --dry-run: Print potential outcome without altering files. Implies --verbose.
 --extensions: Comma-separated list of file name extensions to process. Defaults to '.d.ts'.
    --verbose: Print all matching exports and imports.
```

# Example
```shell
# first-time run
$ npx renova --verbose @apollo/client
./node_modules/@apollo/client/cache/core/cache.d.ts
         🛠️ ../../utilities → ../../utilities/index.js
         🛠️ ./types/DataProxy → ./types/DataProxy.js
         🛠️ ./types/Cache → ./types/Cache.js
...

# safe to run on an already-patched package
$ npx renova --verbose @apollo/client
./node_modules/@apollo/client/cache/core/cache.d.ts
         ✔️ ../../utilities/index.js
         ✔️ ./types/DataProxy.js
         ✔️ ./types/Cache.js
...
```
