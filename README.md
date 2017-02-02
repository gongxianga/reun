<img src=https://reun.solsort.com/icon.png width=96 height=96 align=right> 

[![website](https://img.shields.io/badge/website-reun.solsort.com-blue.svg)](https://reun.solsort.com/)
[![github](https://img.shields.io/badge/github-solsort/reun-blue.svg)](https://github.com/solsort/reun)
[![travis](https://img.shields.io/travis/solsort/reun.svg)](https://travis-ci.org/solsort/reun)
[![npm](https://img.shields.io/npm/v/reun.svg)](https://www.npmjs.com/package/reun)


# REUN - require(unpkg) 

Reun is:

- 100% client-side nodejs-like `require` for the browser.
- using https://unpkg.com/.
- dynamic, just `require(...)` whatever module you want from your source file. No need for `package.json`, - versions can be passed to require, i.e. `require('module@1.2.3')`.
- pretending to be a synchronous, even though it is asynchrounous. Tries to work in the typical cases, and will always fail in certain documented edge cases. Pragmatic, and not standard compliant.
- able to directly load many nodejs modules, that has not been packaged for the browser.
- adding custom functionality when desired, i.e. `module.meta`

## API

- `reun.run(code, [base_url])` execute `code`, where `code` is either a function, or the string source of a module. `require()` is available and is pretending to be synchronous, and done relative to the `base_url`. Returns a promise of the function result or module-exports.
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

# Source Code
    
    (function() { "use strict";
    
    
Http(s) get utility function, as `fetch` is not generally available yet.

      function urlGet(url) {
        return new Promise(function(resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url);
          xhr.onreadystatechange = function() {
            if(xhr.readyState === 4) {
              if(xhr.status === 200 && typeof xhr.responseText === 'string') {
                resolve(xhr.responseText);
              } else {
                reject(xhr);
              }
            }
          }
          xhr.send();
        });
      }
    
    
When trying to load at module, that is not loaded yet, we throw this error:

      function RequireError(module, url) { 
        this.module = module; 
        this.url = url;
      }
      RequireError.prototype.toString = function() {
        return 'RequireError:' + this.module +
          ' url:' + this.url;
      }
    
Convert a require-address to a url.
path is baseurl used for mapping relative file paths (`./hello.js`) to url.

      function moduleUrl(path, module) {
        if(module.slice(0,4) === 'reun') {
          return 'reun';
        }
        if(module.startsWith('https:') ||
            module.startsWith('http:')) {
          return module;
        }
        path = path.replace(/[?#].*/, '');
        path = (module.startsWith('.')
            ? path.replace(/[/][^/]*$/, '/')  
            : 'https://unpkg.com/');
        path = path + module;
        while(path.indexOf('/./') !== -1) {
          path = path.replace('/./', '/');
        }
        var prevPath;
        do {
          prevPath = path;
          path = path.replace(/[/][^/]*[/][.][.][/]/g, '/');
        } while(path !== prevPath);
        return path;
      }
    
      var modules = {reun:{run:run,run:run}};
      function _run(code, path) {
        var result, wrappedSrc, module;
        path = typeof path === 'string' ? path : '';
        var require = function require(module) {
          var url = moduleUrl(path, module);
          if(!modules[url]) {
            throw new RequireError(module, url);
          } 
          return modules[url];
        };
        if(typeof code === 'string') {
          wrappedSrc = '(function(module,exports,require){' +
            code + '})//# sourceURL=' + path;
          module = {
            require: require,
            id: path.replace('https://unpkg.com/', ''),
            uri: path,
            exports: {}};
          code = function() {
            eval(wrappedSrc)(module, module.exports, require);
            return module.exports;
          };
        } else if(typeof self.require === 'undefined') {
          self.require = require;
        }
        try {
          result = code();
        } catch (e) {
          if(e.constructor !== RequireError) {
            throw e;
          }
          return urlGet(e.url)
            .catch(function() {
              throw new Error('require could not load "' + e.url + '" ' +
                  'Possibly module incompatible with http://reun.solsort.com/');
            }).then(function(moduleSrc) {
              return _run(moduleSrc, e.url);
            }).then(function(exports) {
              modules[e.url] = exports;
            }).then(function() {
              return _run(code, path);
            });
        }
        return Promise.resolve(result);
      }
    
      var runQueue = Promise.resolve();
      function run(code, path) {
        runQueue = runQueue.then(function() {
          return _run(code, path);
        }).catch(function(e) {
          setTimeout(function() {
            throw e;
          }, 0);
        });
        return runQueue;
      }
    
      var reun = {
        run: run,
        require: function require(name) {
          if(self.module && self.module.require) {
            return Promise.resolve(require(name));
          }
          return run('module.exports = require(\'' + name + '\');', 
              self.location && self.location.href || './');
        }
      };
    
      if(typeof module === 'object') {
        module.exports = reun;
      } else {
        self.reun = reun;
      }
    })();
    
# License

This software is copyrighted solsort.com ApS, and available under GPLv3, as well as proprietary license upon request.

Versions older than 10 years also fall into the public domain.

    
