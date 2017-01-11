(function() {
  "use strict";

  function urlGet(url) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onreadystatechange = function() {
        if(xhr.readyState === 4) {
          if(typeof xhr.responseText === 'string') {
            resolve(xhr.responseText);
          } else {
            reject(xhr);
          }
        }
      }
      xhr.send();
    });
  }

  function RequireError(module, url) { 
    this.module = module; 
    this.url = url;
  }
  RequireError.prototype.toString = function() {
    return 'RequireError:' + this.module +
      ' url:' + this.url;
  }

  function moduleUrl(path, module) {
    if(module === 'reun') {
      return 'reun';
    }
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
  function _run(src, path) {
    //console.log('run', src);
    var require = function require(module) {
      var url = moduleUrl(path, module);
      //console.log('require', module, url);
      if(!modules[url]) {
        throw new RequireError(module, url);
      } 
      return modules[url];
    };
    var wrappedSrc = '(function(module,exports,require){' +
      src + '})//# sourceURL=' + path;
    var module = {
      require: require,
      id: path.replace('https://unpkg.com/', ''),
      uri: path,
      exports: {}};
    try {
      eval(wrappedSrc)(module, module.exports, require);
    } catch (e) {
      if(e.constructor !== RequireError) {
        throw e;
      }
      return urlGet(e.url)
        .then(function(moduleSrc) {
          return _run(moduleSrc, e.url);
        })
      .then(function(module) {
        //console.log('loaded', e.url);
        modules[e.url] = module.exports;
      })
      .then(function() {
        return _run(src, path);
      });
    }
    return Promise.resolve(module);
  }

  var runQueue = Promise.resolve();
  function run(src, path) {
    runQueue = runQueue.then(function() {
      return _run(src, path);
      console.log('then', e);
    }).catch(function(e) {
      setTimeout(function() {
        throw e;
      }, 0);
    });
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
