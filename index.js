
/**
 * Module dependencies
 */

var debug = require('debug')('duo-package');
var Emitter = require('events').EventEmitter;
var write = require('fs').createWriteStream;
var read = require('fs').createReadStream;
var resolve = require('gh-resolve');
var mkdir = require('mkdirp').sync;
var netrc = require('node-netrc');
var fmt = require('util').format;
var enstore = require('enstore');
var request = require('request');
var tmp = require('os').tmpdir();
var thunk = require('thunkify');
var semver = require('semver');
var tar = require('tar-fs');
var path = require('path');
var zlib = require('zlib');
var fs = require('co-fs');
var url = require('url');
var join = path.join;

/**
 * Export `Package`
 */

module.exports = Package;

/**
 * Thunkify functions
 */

resolve = thunk(resolve);

/**
 * Inflight
 */

var inflight = {};

/**
 * Refs.
 */

var refs = {};

/**
 * Home directory
 */

var home = process.env.HOME || process.env.HOMEPATH;

/**
 * Cache tarballs in "$tmp/duo"
 * and make sure it exists
 */

var cachepath = join(tmp, 'duo');
mkdir(cachepath);

/**
 * API url
 */

var api = 'https://api.github.com';

/**
 * auth from ~/.netrc
 */

var auth = netrc('api.github.com') || {
  login: process.env.GH_USER,
  password: process.env.GH_TOKEN
};

/**
 * Logging
 */

auth.login && auth.password
  ? debug('read auth details from ~/.netrc')
  : debug('could not read auth details from ~/.netrc')

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
  this.token = auth.password || null;
  this.user = auth.login || null;
  this.setMaxListeners(Infinity);
  this.dir = process.cwd();
  this.ua = 'duo-package';
  this.resolved = false;
  this.ref = ref || '*';
  this._cache = true;
  Emitter.call(this);
};

/**
 * Inherit `EventEmitter`
 */

Package.prototype.__proto__ = Emitter.prototype;

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
 * @param {String} user
 * @param {String} token
 * @return {Package} self
 * @api public
 */

Package.prototype.auth = function(user, token) {
  this.user = user || this.user;
  this.token = token || this.token;
  return this;
};

/**
 * Ensure we're authenticated
 *
 * @return {Package}
 * @api private
 */

Package.prototype.authenticated = function(){
  var auth = this.user && this.token;
  if (auth) return this;
  throw this.error([
    'Github authentication error:',
    'make sure you have ~/.netrc or',
    'specify $GH_USER=<user> $GH_TOKEN=<token>.'
  ].join(' '));
};

/**
 * Resolve the reference on github
 *
 * @return {String}
 * @api public
 */

Package.prototype.resolve = function *() {
  this.authenticated();

  // if it's a valid version
  // or invalid range, no need to resolve.
  if (semver.valid(this.ref) || !semver.validRange(this.ref)) {
    this.resolved = this.ref;
    return this.resolved;
  }

  // check if ref is in the cache
  var slug = this.repo + '@' + this.ref;
  this.resolved = this.resolved || cached(this.repo, this.ref);

  // resolved
  if (this.resolved) {
    this.debug('got %s from cache', this.resolved);
    return this.resolved;
  }

  // resolve
  this.emit('resolving');
  var ref = yield resolve(slug, this.user, this.token);

  // couldn't resolve
  if (!ref) throw error('%s: reference %s not found', this.slug(), this.ref);

  // cache
  this.emit('resolve');
  this.resolved = ref.name;
  (refs[this.repo] = refs[this.repo] || []).push(ref.name);
  return ref.name;
};

/**
 * Fetch the tarball from github
 * extracting to `dir`
 *
 * @param {Object} opts
 * @return {Package} self
 * @api public
 */

Package.prototype.fetch = function *(opts) {
  this.authenticated();

  opts = opts || {};
  opts.force = opts.force == undefined ? opts.force : false;

  // resolve
  var ref = this.resolved || (yield this.resolve());
  var url = fmt('%s/repos/%s/tarball/%s', api, this.repo, ref);
  var cache = join(cachepath, this.slug() + '.tar.gz');
  var dest = this.path();

  // inflight, wait till other package completes
  if (inflight[dest]) {
    var pkg = inflight[dest];
    yield function(done){ pkg.once('fetch', done); }
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
    this.debug('extracting from cache')

    // extract
    yield this.extract(cache, dest);

    // extracted
    this.emit('fetch');
    this.debug('extracted from cache')
    delete inflight[dest];

    return this;
  }

  // fetching
  this.emit('fetching');
  this.debug('fetching from %s', url);

  // download tarball and extract
  var store = yield this.download(this.options(url));

  if (this._cache) {
    yield [this.write(store, cache), this.extract(store, dest)];
  } else {
    yield this.extract(store, dest);
  }

  // fetch
  this.emit('fetch');
  this.debug('fetched from %s', url);
  delete inflight[dest];

  return this;
};

/**
 * Check if the package exists.
 *
 * @return {Boolean}
 * @api private
 */

Package.prototype.exists = function*(){
  return yield exists(this.path());
};

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
 * Return request options for `url`.
 *
 * @param {String} url
 * @param {Object} [opts]
 * @return {Object}
 * @api private
 */

Package.prototype.options = function(url, other){
  var token = this.token;
  var user = this.user;

  var opts = {
    url: url,
    headers: { 'User-Agent': this.ua }
  };

  if (other) {
    for (var k in other) opts[k] = other[k];
  }

  if (token) opts.headers.Authorization = 'Bearer ' + token;

  return opts;
};

/**
 * Reliably download the package.
 * Returns a store to be piped around.
 *
 * @param {Object} opts
 * @return {Function}
 * @api private
 */

Package.prototype.download = function(opts) {
  var store = enstore();
  var gzip = store.createWriteStream();
  var self = this;
  var prev = 0;
  var len = 0;

  return function(fn) {
    var req = request(opts);

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
        return fn(self.error('returned with status code: %s', status));
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
      })

      // pipe data into gunzip, then in-memory store
      req.pipe(zlib.createGunzip())
        .on('error', error)
        .pipe(gzip);

      // abort if there's an interruption
      process.on('SIGINT', function() { req.abort(); })
    });

    function error(err) {
      return fn(self.error(err));
    }
  }
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
  var stream = 'string' == typeof store
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
      .on('finish', fn)

    function error(err) {
      return fn(self.error(err));
    }
  };
};


/**
 * Debug
 *
 * @param {String} str
 * @param {Mixed, ...} args
 * @return {Package}
 * @api private
 */

Package.prototype.debug = function(str) {
  var args = [].slice.call(arguments, 1);
  var slug = this.slug();
  str = fmt('%s: %s', slug, str);
  debug.apply(debug, [str].concat(args));
  return this;
};

/**
 * Error
 *
 * @param {String} str
 * @return {Error}
 * @api private
 */

Package.prototype.error = function(msg) {
  msg = msg.message || msg;
  var msg = this.slug() + ': ' + msg;
  var args = [].slice.call(arguments, 1);
  return new Error(fmt.apply(null, [msg].concat(args)));
};

/**
 * Get a cached `repo`, `ref`.
 *
 * @param {String} repo
 * @param {String} ref
 * @return {String}
 * @api private
 */

function cached(repo, ref){
  var revs = refs[repo] || [];

  for (var i = 0; i < revs.length; ++i) {
    try {
      if (semver.satisfies(revs[i], ref)) return revs[i];
    } catch (e) {
      if (revs[i] == ref) return revs[i];
    }
  }
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
