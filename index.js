
/**
 * Module dependencies
 */

var debug = require('debug')('duo-package');
var Emitter = require('events').EventEmitter;
var thunkify = require('thunkify');
var resolve = thunkify(require('gh-resolve'));
var error = require('better-error');
var download = require('download');
var netrc = require('netrc').parse;
var request = require('co-req');
var semver = require('semver');
var path = require('path');
var fs = require('co-fs');
var url = require('url');
var join = path.join;

/**
 * Export `Package`
 */

module.exports = Package;

/**
 * Ref cache.
 */

var refs = {};

/**
 * Home directory
 */

var home = process.env.HOME || process.env.HOMEPATH;

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
  this.resolved = cached(this.repo, this.ref);

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
  this.debug('add %s to cache', ref.name);
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
  var req = request(url, opts);
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
  var dir = join(this.dir, this.slug());

  // fetching
  this.emit('fetching');
  this.debug('fetching');

  // don't fetch if it already exists
  if (yield fs.exists(dir)) {
    this.debug('already exists at %s', dir);
    this.emit('fetch');
    return this;
  }

  // url and options for "request" and "decompress"
  var url = api + '/repos/' + this.repo + '/tarball/' + ref;
  var opts = this.options(url, { extract: true, strip: 1 });

  // download and extract the package
  yield this.download(url, dir, opts);

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
 * Check if the given version `a` is equal to `b`.
 * 
 * @param {String} a
 * @param {String} b
 * @return {Boolean}
 * @api private
 */

function equals(a, b){
  try {
    return semver.satisfies(a, b) || a == b;
  } catch (e) {
    return a == b;
  }
}

/**
 * Check if the given `repo` with `version` is cached.
 * 
 * @param {String} repo
 * @param {String} version
 * @return {String}
 * @api privae
 */

function cached(repo, version){
  var arr = refs[repo] || [];

  for (var i = 0; i < arr.length; ++i) {
    if (equals(arr[i], version)) return arr[i];
  }
}
