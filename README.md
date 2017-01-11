[![Website](https://img.shields.io/website-up-down-green-red/https/reun.solsort.com.svg)](https://reun.solsort.com/)
[![Build Status](https://travis-ci.org/solsort/reun.svg?branch=master)](https://travis-ci.org/solsort/reun)
[![npm](https://img.shields.io/npm/v/reun.svg)](https://www.npmjs.com/package/reun)

# <img src=https://reun.solsort.com/icon.png width=64 height=64> REUN - require(unpkg) 

Reun is:

- 100% client-side nodejs-like `require` for the browser.
- using https://unpkg.com/.
- dynamic, just `require(...)` whatever module you want from your source file. No need for `package.json`, - versions can be passed to require, i.e. `require('module@1.2.3')`.
- pretending to be a synchronous, even though it is asynchrounous. Tries to work in the typical cases, and will always fail in certain documented edge cases. Pragmatic, and not standard compliant.
- able to directly load many nodejs modules, that has not been packaged for the browser.
- adding custom functionality when desired, i.e. `module.meta`

## API

- `reun.run(source_string, url)` execute the source, as a module. `require()` is available and is pretending to be synchronous, and done relative to the `url`.
- `reun.require(module)` loads a module, path is relative to the `location.href` if available. Returns a promise.

## Usage example

`index.html`:
```html
<!DOCTYPE html>
<html>
  <body>
    <script src=https://unpkg.com/reun></script>
    <script>reun.require('./example.js');</script>
  </body>
</html>
```

`example.js`:
```javascript
var uniq = require('uniq');
console.log(uniq([1,4,2,8,4,2,1,3,2]));
```

## Extensions

- `require('module@0.2.3')` allows you to require a specific version
- `module.meta` allows you to set meta information about your module, - this may later be used to automatically package the module for npm, cordova, ...

## Incompatibilities

The implementation is a hack. We want to _pretend_ to be synchronous, but we also do not want to block the main thread. Instead `require` throws an exception when a module is not loaded yet. When we run a file, we catch this exception, load the module asynchrounously, and then rerun the file. Later on we might also search the source for `require("...")`, or `require('...')` and try to preload these modules, but this is not implemented yet.

Also we just resolve the module name as `'https://unpkg.com/' + module_name`. To be more compatible with node modules, we may check the `package.json` in the future to make sure that the relative paths in the require works.

- Custom exceptions from `require` should not caught.
- Code before a require, may be executed multiple times, - should be side-effect free.
- `require` may fail within callbacks, if the module has not been loaded before.
- If the source lives in a subdirectory, and the module is not packaged for the web, and contains relative paths, - the paths are wrongly resolved. A workaround is to `require('module/lib/index.js')` instead of `require('module')`.
- It does obviously not work with every module.

In spite of these limitations, it is still possible to `require` many nodejs module directly to the web.
