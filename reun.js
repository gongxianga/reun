// <img src=https://reun.solsort.com/icon.png width=96 height=96 align=right> 
//
// [![website](https://img.shields.io/badge/website-reun.solsort.com-blue.svg)](https://reun.solsort.com/)
// [![github](https://img.shields.io/badge/github-solsort/reun-blue.svg)](https://github.com/solsort/reun)
// [![travis](https://img.shields.io/travis/solsort/reun.svg)](https://travis-ci.org/solsort/reun)
// [![npm](https://img.shields.io/npm/v/reun.svg)](https://www.npmjs.com/package/reun)
// 
// TODO: unit testing
// TODO: documentaiton, - merge into source
//
// # REUN - require(unpkg) 
// 
// Reun is:
// 
// - 100% client-side nodejs-like `require` for the browser.
// - using https://unpkg.com/.
// - dynamic, just `require(...)` whatever module you want from your source file. No need for `package.json`, - versions can be passed to require, i.e. `require('module@1.2.3')`.
// - pretending to be a synchronous, even though it is asynchrounous. Tries to work in the typical cases, and will always fail in certain documented edge cases. Pragmatic, and not standard compliant.
// - able to directly load many nodejs modules, that has not been packaged for the browser.
// - adding custom functionality when desired, i.e. `module.meta`
// 
// ## API
// 
// - `reun.eval(code, [opt])` execute `code`, where `code` is either a function, or the string source of a module. `require()` is available and is pretending to be synchronous, and done relative to the `opt.uri`. Returns a promise of the function result or module-exports.
// - `reun.require(module, [opt])` loads a module, path is relative to the `location.href` if available. Returns a promise.
// 
// ## Usage example
// 
// `index.html`:
// ```html
// <!DOCTYPE html>
// <html>
//   <body>
//     <script src=https://unpkg.com/reun></script>
//     <script>reun.require('./example.js');</script>
//   </body>
// </html>
// ```
// 
// `example.js`:
// ```javascript
// var uniq = require('uniq');
// console.log(uniq([1,4,2,8,4,2,1,3,2]));
// ```
// 
// ## Extensions
// 
// - `require('module@0.2.3')` allows you to require a specific version
// - `module.meta` allows you to set meta information about your module, - this may later be used to automatically package the module for npm, cordova, ...
// 
// ## Incompatibilities
// 
// The implementation is a hack. We want to _pretend_ to be synchronous, but we also do not want to block the main thread. Instead `require` throws an exception when a module is not loaded yet. When we run a file, we catch this exception, load the module asynchrounously, and then rerun the file. Later on we might also search the source for `require("...")`, or `require('...')` and try to preload these modules, but this is not implemented yet.
// 
// Also we just resolve the module name as `'https://unpkg.com/' + module_name`. To be more compatible with node modules, we may check the `package.json` in the future to make sure that the relative paths in the require works.
// 
// - Custom exceptions from `require` should not caught.
// - Code before a require, may be executed multiple times, - should be side-effect free.
// - `require` may fail within callbacks, if the module has not been loaded before.
// - If the source lives in a subdirectory, and the module is not packaged for the web, and contains relative paths, - the paths are wrongly resolved. A workaround is to `require('module/lib/index.js')` instead of `require('module')`.
// - It does obviously not work with every module.
// 
// In spite of these limitations, it is still possible to `require` many nodejs module directly to the web.
//
// # REUN - require(unpkg)
//
// ## Project setup

(function() { "use strict";
  var da = typeof direape !== 'undefined' ? direape : require('direape');
  da.testSuite('reun');
  var reun = da.global.reun || {};
  var modules = {
    reun: reun,
    direape: da
  };

  // ## `reun.eval(src|fn, opt);`
  //
  // Functions will be called as a module with `require`, `exports`, and `module` as parameters, - similar to <http://requirejs.org/docs/commonjs.html>

  var runQueue = new Promise((resolve) => da.ready(() => resolve()));

  reun.eval = (fn, opt) => {
    runQueue = runQueue.then(() => do_eval(fn, opt))
      .catch((e)  => da.nextTick(() => { throw e; }));
    return runQueue;
  };

  da.handle('reun:eval', reun.eval);

  // ## `reun.require(module-name, opt);`

  reun.require = (name, opt) => 
    reun.eval('module.exports = require("' + name + '",' +
          JSON.stringify(opt || {}) + ');',
        Object.assign({uri: da.global.location && da.global.location.href || './'}, opt));

  da.handle('reun:require', reun.require);

  // ## Implementation details
  //
  // ### moduleUrl
  //
  // Convert a require-address to a url.
  // path is baseurl used for mapping relative file paths (`./hello.js`) to url.

  function moduleUrl(module, opt) {
    var path = opt.uri || '';

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

  // ### do_eval

  function do_eval(fn, opt) {
    opt = opt || {};
    if(typeof fn === 'string') {
      fn = stringToFunction(fn, opt);
    }
    return executeModule(fn, opt);
  };

  // ### executeModule

  function executeModule(fn, opt) {
    opt.uri = opt.uri || '';
    var require = (name, opt) => reun_require(name, opt, module);
    var module = {
      require: require,
      uri: opt.uri,
      id: opt.uri.replace('https://unpkg.com/', '').replace(/@[^/]*/, ''),
      exports: {}
    };
    if(opt.main) {
      require.main = module;
    }

    return rerunModule(fn, module);
  }

  // ### rerunModule
  //
  function rerunModule(fn, module) {
    var result;
    try {
      fn(module.require, module.exports, module);
      result = module.exports;
    } catch (e) {
      if(e.constructor !== RequireError) {
        throw e;
      }
      return da.call(da.nid, 'da:GET', e.url)
        .catch(() => {
          throw new Error('require could not load "' + e.url + '" ' +
              'Possibly module incompatible with http://reun.solsort.com/'); })
        .then((moduleSrc) => executeModule(stringToFunction(moduleSrc, e.opt), 
              e.opt))
        .then((exports) => assignModule(e.url, exports))
        .then(() => rerunModule(fn, module));
    }
    return Promise.resolve(result);
  }

  // ### `shortName(uri)`

  function assignModule(uri, exports) {

    modules[uri] = exports;
    //
    // Find the short name of the module, and remember it by that alias,
    // to make sure that later requires for the module without version/url
    // returns the already loaded module.
    //

    if(exports.meta && exports.meta.id) {
      modules[exports.meta.id] = exports;
    }

    var name = uri
      .replace('https://unpkg.com/', '')
      .replace(/[@/].*/, '');
    if(!modules[name]) {
      modules[name] = exports;
    }
  }

  // ### reun_require

  function reun_require(name, opt, parentModule) {
    if(modules[name]) {
      return modules[name];
    }
    var url = moduleUrl(name, parentModule);
    if(!modules[url]) {
      throw new RequireError(name, url, opt);
    } 
    return modules[url];
  }

  // ### stringToFunction

  function stringToFunction(src, opt) {
    var wrappedSrc = '(function(require,exports,module){' +
      src + '})//# sourceURL=' + opt.uri;
    return eval(wrappedSrc);
  }

  // ### RequireError
  //
  // When trying to load at module, that is not loaded yet, we throw this error:

  function RequireError(module, url, opt) { 
    this.module = module; 
    this.url = url;
    opt = opt || {};
    opt.uri = url;
    this.opt = opt;
  }
  RequireError.prototype.toString = function() {
    return 'RequireError:' + this.module +
      ' url:' + this.url;
  }

  // ## Main / test runner

  da.ready(() => {
    if((da.isNodeJs() && require.main === module && process.argv[2] === 'test') ||
        (da.global.location && da.global.location.hostname === 'localhost')) {
      da.runTests('reun')
        .then(() => da.isNodeJs() && process.exit(0))
        .catch(() => da.isNodeJs() && process.exit(1));
    }
  });
  if(typeof module === 'object') {
    module.exports = reun;
  } else {
    self.reun = reun;
  }

  // ## end
})();

// # License
// 
// This software is copyrighted solsort.com ApS, and available under GPLv3, as well as proprietary license upon request.
// 
// Versions older than 10 years also fall into the public domain.
// 

