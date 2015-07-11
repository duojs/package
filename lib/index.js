
/**
 * Module dependencies
 */

var Emitter = require('events').EventEmitter;
var write = require('fs').createWriteStream;
var debug = require('debug')('duo-package');
var read = require('fs').createReadStream;
var resolve = require('gh-resolve');
var mkdir = require('mkdirp').sync;
var fmt = require('util').format;
var enstore = require('enstore');
var tmp = require('os').tmpdir();
var unyield = require('unyield');
var rm = require('rimraf-then');
var join = require('path').join;
var tar = require('tar-fs');
var zlib = require('zlib');
var util = require('util');
var fs = require('co-fs');

/**
 * Export `Package`
 */

module.exports = Package;

/**
 * Inflight
 */

var inflight = {};

/**
 * Cache tarballs in "$tmp/duo"
 * and make sure it exists
 */

var cachepath = join(tmp, 'duo');
mkdir(cachepath);

/**
 * Unauthorized string
 */

var unauthorized = 'You have not authenticated and this repo may be private.'
  + ' Make sure you have a ~/.netrc entry or specify $GH_TOKEN=<token>.';

/**
 * Initialize `Package`
 *
 * @param {String} repo
 * @param {String} ref
 * @api public
 */

function Package(repo, ref) {
  if (!(this instanceof Package)) return new Package(repo, ref);

  this.repo = repo.replace(':', '/');
  this.tok = null;
  this.setMaxListeners(Infinity);
  this.dir = process.cwd();
  this.ua = 'duo-package';
  this.resolved = false;
  this.ref = ref || '*';
  this.retries = 3;
  Emitter.call(this);
}

/**
 * Inherit `EventEmitter`
 */

util.inherits(Package, Emitter);

/**
 * Static property for accessing the cache location.
 */

Package.cachepath = cachepath;

/**
 * Static method for cleaning the cache.
 */

Package.cleanCache = function *() {
  yield rm(cachepath);
};

/**
 * Set the directory to install into
 *
 * @param {String} dir
 * @return {Package} self
 * @api public
 */

Package.prototype.directory = function(dir) {
  if (!dir) return this.dir;
  this.dir = dir;
  return this;
};

/**
 * Get the local directory path
 *
 * @return {String}
 * @api public
 */

Package.prototype.path = function(path) {
  return join(this.dir, this.slug(), path || '');
};

/**
 * Get or set the User-Agent
 *
 * @param {String} ua (optional)
 * @return {Package|String}
 */

Package.prototype.useragent = function(ua) {
  if (!ua) return this.ua;
  this.ua = ua;
  return this;
};

/**
 * Authenticate with github
 *
 * @param {String} token
 * @return {String|Package} self
 * @api public
 */

Package.prototype.token = function(token) {
  if (!arguments.length) return this.tok;
  this.tok = token;
  return this;
};

/**
 * Set the cache instance to use.
 *
 * @param {Cache} cache
 * @return {Cache|Package}
 * @api public
 */

Package.prototype.cache = function (cache) {
  if (!arguments.length) return this._cache;
  this._cache = cache;
  return this;
};

/**
 * Resolve the reference on github
 *
 * @return {String}
 * @api public
 */

Package.prototype.resolve = unyield(function *() {
  // resolved
  if (this.resolved) {
    this.debug('resolved from cache %s', this.resolved);
    return this.resolved;
  }

  // resolving
  this.emit('resolving');
  this.debug('resolving');

  // resolve
  var ref = yield resolve(this.repo + '@' + this.ref, {
    token: this.token(),
    cache: this.cache()
  });

  // resolved
  this.resolved = ref.name;
  this.debug('resolved');
  this.emit('resolve');

  return ref.name;
});

/**
 * Fetch the tarball from github
 * extracting to `dir`
 *
 * @return {Package} self
 * @api public
 */

Package.prototype.fetch = unyield(function *() {
  // resolve
  var ref = yield this.resolve();
  var token = this.tok ? this.tok + '@' : '';
  var url = fmt('https://%sgithub.com/%s/archive/%s.tar.gz', token, this.repo, ref);
  var cache = join(cachepath, this.slug() + '.tar.gz');
  var dest = this.path();

  // inflight, wait till other package completes
  if (inflight[dest]) {
    var pkg = inflight[dest];
    yield function(done){ pkg.once('fetch', done); };
  }

  // set package as inflight
  inflight[dest] = this;

  // check if directory already exists
  if (yield this.exists()) {
    // already exists
    this.emit('fetching');
    this.debug('already exists');
    this.emit('fetch');
    delete inflight[dest];

    return this;
  }

  // check the cache
  if (yield exists(cache)) {
    // extracting
    this.emit('fetching');
    this.emit('installing');
    this.debug('extracting from cache');

    // extract
    yield this.extract(cache, dest);

    // extracted
    this.emit('fetch');
    this.emit('install');
    this.debug('extracted from cache');
    delete inflight[dest];

    return this;
  }

  // fetching
  this.emit('fetching');
  this.emit('installing');
  this.debug('fetching from %s', url);

  // download tarball and extract
  var store = yield this.download(url);

  // cache, extract
  yield [
    this.write(store, cache),
    this.extract(store, dest)
  ];

  // fetch
  this.emit('fetch');
  this.emit('install');
  this.debug('fetched from %s', url);
  delete inflight[dest];

  return this;
});

/**
 * Check if the package exists.
 *
 * @return {Boolean}
 * @api private
 */

Package.prototype.exists = unyield(function*(){
  return yield exists(this.path());
});

/**
 * Get the slug
 *
 * @return {String}
 * @api public
 */

Package.prototype.toString =
Package.prototype.slug = function() {
  var repo = this.repo.replace('/', '-');
  var ref = this.resolved || this.ref;
  return repo + '@' + ref;
};

/**
 * Reliably download the package.
 * Returns a store to be piped around.
 *
 * @param {String} url
 * @return {Function}
 * @api private
 */

Package.prototype.download = function(url) {
  var store = enstore();
  var gzip = store.createWriteStream();
  var opts = { headers: {} };
  var tok = this.token();
  var self = this;
  var prev = 0;
  var len = 0;

  // options
  opts.headers['User-Agent'] = this.ua;
  opts.url = url;

  return function(fn) {
    var req = request(opts);
    debug(curl(opts));

    // handle any errors from the request
    req.on('error', error);

    store.on('end', function() {
      return fn(null, store);
    });

    req.on('response', function(res) {
      var status = res.statusCode;
      var headers = res.headers;

      // github doesn't always return a content-length (wtf?)
      var total = +headers['content-length'];

      // Ensure that we have the write status code
      if (status < 200 || status >= 300) {
        var statusError = status === 404 && !tok
          ? self.error('returned with status code: %s. %s', status, unauthorized)
          : self.error('returned with status code: %s', status);
        return fn(statusError);
      }

      // listen for data and emit percentages
      req.on('data', function(buf) {
        len += buf.length;
        var percent = Math.round(len / total * 100);
        // TODO figure out what to do when no total
        if (!total || prev >= percent) return;
        self.debug('progress %s', percent);
        self.emit('progress', percent);
        prev = percent;
      });

      // pipe data into gunzip, then in-memory store
      req.pipe(zlib.createGunzip())
        .on('error', error)
        .pipe(gzip);
    });

    function error(err) {
      self.debug('error encountered: %s', err.message);
      if (self.retries-- <= 0) { // after all retry attempts
        fn(self.error(err));
      } else {
        self.debug('retry');
        self.download(url);
      }
    }
  };
};

/**
 * Extract the tarball
 *
 * @param {Enstore|String} store
 * @param {String} dest
 * @return {Function}
 * @api private
 */

Package.prototype.extract = function(store, dest) {
  var self = this;

  // create a stream
  var stream = typeof store === 'string'
    ? read(store)
    : store.createReadStream();

  return function(fn) {
    stream
      .on('error', error)
      .pipe(tar.extract(dest, { strip: 1 }))
      .on('error', error)
      .on('finish', fn);

    function error(err) {
      return fn(self.error(err));
    }
  };
};

/**
 * Write the tarball
 *
 * @param {Enstore} store
 * @param {String} dest
 * @return {Function}
 * @api private
 */

Package.prototype.write = function(store, dest) {
  var read = store.createReadStream();
  var stream = write(dest);
  var self = this;

  return function(fn) {
    read.pipe(stream)
      .on('error', error)
      .on('finish', fn);

    function error(err) {
      return fn(self.error(err));
    }
  };
};

/**
 * Debug
 *
 * @param {String} msg
 * @param {Mixed, ...} args
 * @return {Package}
 * @api private
 */

Package.prototype.debug = function(msg) {
  var args = [].slice.call(arguments, 1);
  msg = fmt('%s: %s', this.slug(), msg);
  debug.apply(debug, [msg].concat(args));
  return this;
};

/**
 * Error
 *
 * @param {String} msg
 * @return {Error}
 * @api private
 */

Package.prototype.error = function(msg) {
  msg = fmt('%s: %s', this.slug(), msg.message || msg);
  var args = [].slice.call(arguments, 1);
  return new Error(fmt.apply(null, [msg].concat(args)));
};

/**
 * Display the curl request
 *
 * @param {Object} opts
 * @return {String}
 * @api private
 */

function curl(opts) {
  var arr = ['curl'];

  // options
  arr.push('-v');
  arr.push('-L');

  // headers
  Object
    .keys(opts.headers)
    .forEach(function(header) {
      arr.push(fmt('-H "%s: %s"', header, opts.headers[header]));
    });

  // url
  arr.push(opts.url);

  return arr.join(' ');
}

/**
 * Lazy-load request
 */

function request() {
  var req = require('request');
  return req.apply(req, arguments);
}

/**
 * Exists
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

function *exists(path) {
  try {
    yield fs.stat(path);
    return true;
  } catch (e) {
    return false;
  }
}
