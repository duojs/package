
/**
 * Module dependencies
 */

var debug = require('debug')('duo-package');
var Emitter = require('events').EventEmitter;
var read = require('fs').createReadStream;
var thunkify = require('thunkify');
var resolve = thunkify(require('gh-resolve'));
var error = require('better-error');
var download = require('download');
var netrc = require('netrc').parse;
var Cache = require('duo-cache');
var request = require('request');
var semver = require('semver');
var coreq = require('co-req');
var path = require('path');
var zlib = require('zlib');
var fs = require('co-fs');
var url = require('url');
var tar = require('tar');
var join = path.join;

/**
 * Export `Package`
 */

module.exports = Package;

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
 * Cache
 */

var cache = Package.cache = Cache(join(home, '.duo'));

/**
 * API url
 */

var api = 'https://api.github.com';

/**
 * credentials from ~/.netrc
 */

var credentials = {};

/**
 * Initialize `Package`
 * 
 * @param {String} repo
 * @param {String} ref
 * @api public
 */

function Package(repo, ref) {
  if (!(this instanceof Package)) return new Package(repo, ref);
  Emitter.call(this);
  this.repo = repo.replace(':', '/');
  this.ref = ref || '*';
  this.ua = 'duo-package';
  this.dir = process.cwd();
  this.user = Package.user || credentials.user || null;
  this.token = Package.token || credentials.token || null;
  this.resolved = false;
  this.setMaxListeners(Infinity);
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
  path = path || '';
  return join(this.dir, this.slug(), path);
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
  this.user = user || this.user || Package.user || credentials.user;
  this.token = token || this.token || Package.token || credentials.token;
  return this;
};

/**
 * Resolve the reference on github
 *
 * @return {String}
 * @api public
 */

Package.prototype.resolve = function *() {
  // try to authenticate;
  yield this.authenticate();

  // check if ref is in the cache
  var slug = this.repo + '@' + this.ref;
  this.resolved = this.resolved || cached(this.repo, this.ref);

  // resolved
  if (this.resolved) {
    this.debug('got %s from cache', this.resolved);
    return this.resolved;
  }

  // resolve
  try {
    this.emit('resolving');
    this.auth();
    var ref = yield resolve(slug, this.user, this.token);
  } catch (e) {
    throw error('%s: reference %s not found', this.slug(), this.ref);
  }

  // couldn't resolve
  if (!ref) throw error('%s: reference %s not found', this.slug(), this.ref);

  // cache
  this.emit('resolve');
  this.resolved = ref.name;
  (refs[this.repo] = refs[this.repo] || []).push(ref.name);
  return ref.name;
};

/**
 * Read a file from github
 *
 * TODO: either remove entirely, or
 * replace co-req with something else, or
 * fix random request dropping in co-req
 * 
 * @param {String} path
 * @param {String} content
 * @api public
 */

Package.prototype.read = function *(path) {
  yield this.authenticate();

  var ref = this.resolved || (yield this.resolve());

  this.emit('reading');
  this.debug('reading %s', path);

  // try local read first
  try {
    var str = yield this.readLocal(join(this.dir, this.slug(), path));
    this.emit('read');
    this.debug('read local copy of %s', path);
    return str;
  } catch(e) {}

  // fetch from github
  var url = api + '/repos/' + this.repo + '/contents/' + path + '?ref=' + ref;
  var opts = this.options(url, { json: true });
  var req = coreq(url, opts);
  var res = yield req;

  if (res.statusCode != 200 ) {
    throw this.error(res.statusCode);
  }

  var len = res.headers['content-length'];
  var body = '';
  var buf;
  

  while (buf = yield req) {
    len -= buf.length;
    body += buf.toString();
  }

  // ensure downloaded matches the content-length
  if (len) throw this.error('incomplete download');

  body = JSON.parse(body);
  var content = new Buffer(body.content, 'base64').toString();

  this.emit('read')
  this.debug('read remote copy of %s from %s', path, url);

  return content;
};

/**
 * Read locally
 */

Package.prototype.readLocal = function *(path) {
  return yield fs.readFile(path, 'utf8');
}

/**
 * Fetch the tarball from github
 * extracting to `dir`
 *
 * @return {Package} self
 * @api public
 */

Package.prototype.fetch = function *() {
  yield this.authenticate();

  var ref = this.resolved || (yield this.resolve());
  var slug = this.slug();
  var tarball = yield cache.lookup(slug);
  var dest = this.path();

  // try the global cache.
  if (tarball) {
    debug('got tarball from cache');
    yield extract(tarball, dest);
    this.emit('fetch');
    return this;
  }

  // inflight
  if (inflight[dest]) {
    this.debug('inflight, waiting..');
    var pkg = inflight[this.slug()];
    var self = this;
    yield thunkify(function(done){
      pkg.once('fetch', done);
    });
    return this;
  }

  // don't fetch if it already exists
  // TODO: remove, edge-case but .exists() can lie.
  if (yield fs.exists(dest)) {
    this.debug('already exists at %s', dest);
    return this;
  }

  // fetching
  this.emit('fetching');
  this.debug('fetching');

  // inflight
  inflight[dest] = this;

  // url and options for "request" and "decompress"
  var url = api + '/repos/' + this.repo + '/tarball/' + ref;
  var opts = this.options(url, { extract: true, strip: 1 });

  // tarball stream
  tarball = request(url, opts);

  // cache
  if (semver.valid(ref)) {
    yield cache.add(slug, tarball);
    this.debug('added to cache');
  }

  // done.
  delete inflight[slug];

  // extract to directory
  var src = (yield cache.lookup(slug)) || tarball;
  yield extract(src, dest);
  this.debug('extract to %s', dest);

  // fetched
  this.emit('fetch');
  this.debug('fetched package');

  return this;
};

/**
 * Authenticate, if token and user
 * are not already set, try to find
 * user and token in ~/.netrc
 *
 * @return {Package}
 * @api private
 */

Package.prototype.authenticate = function *() {
  if (this.user && this.token) return this;
  else if (credentials.user || credentials.token) return this;

  this.debug('reading from ~/.netrc');

  try {
    var content = yield fs.readFile(join(home, '.netrc'), 'utf8');
    var host = url.parse(api).host;
    var obj = netrc(content)[host];
    credentials.user = obj.login;
    credentials.token = obj.password;
    this.debug('read auth details from ~/.netrc');
  } catch(e) {
    this.debug('no ~/.netrc found');
  }
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
 * Debug
 *
 * @param {String} str
 * @param {Mixed, ...} args
 * @return {Package}
 */

Package.prototype.debug = function(str) {
  var args = [].slice.call(arguments, 1);
  var slug = this.slug();
  str = slug + ': ' + str;
  debug.apply(debug, [str].concat(args));
  return this;
};

/**
 * Error
 *
 * @param {String} str
 * @return {Error}
 * @api public
 */

Package.prototype.error = function(str) {
  return error('%s: %s', this.slug(), str);
}

/**
 * Download the tarfile
 *
 * @param {String} url
 * @param {String} dest
 * @param {Object} opts
 * @param {Function} fn
 * @return {Package}
 */

Package.prototype.download = thunkify(function(url, dest, opts, fn) {
  var dl = download(url, dest, opts);
  dl.on('error', fn);
  dl.on('close', fn);
});

/**
 * Return request options for `url`.
 *
 * @param {String} url
 * @param {Object} [opts]
 * @return {Object}
 * @api private
 */

Package.prototype.options = function(url, other){
  this.auth();
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
 * Get a cached `repo`, `ref`.
 * 
 * @param {String} repo
 * @param {String} ref
 * @return {String}
 * @api private
 */

function cached(repo, ref){
  var revs = refs[repo] || [];
  var ret;

  for (var i = 0; i < revs.length; ++i) {
    try {
      ret = semver.satisfies(revs[i], ref);
    } catch (e) {
      if (revs[i] == ref) ret = revs[i];
    }
  }

  return ret;
}

/**
 * Extract `src`, `dest`
 * 
 * @param {String} src
 * @param {String} dest
 * @return {Function}
 * @api private
 */

function extract(src, dest){
  return function(done){
    if ('string' == typeof src) src = read(src);

    src
    .on('error', done)
    .pipe(zlib.createGunzip())
    .pipe(tar.Extract({ path: dest, strip: 1 }))
    .on('error', done)
    .on('end', done);
  };
}
