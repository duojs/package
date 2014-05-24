
/**
 * Module dependencies
 */

var Emitter = require('events').EventEmitter;
var decompress = require('decompress');
var debug = require('debug')('duo-package');
var thunkify = require('thunkify');
var resolve = thunkify(require('gh-resolve'));
var request = require('co-req');
var write = require('co-write');
var semver = require('semver');
var path = require('path');
var fs = require('co-fs');
var gh = require('gh2');
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
 * API url
 */

var api = 'https://api.github.com';

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
  this.repo = repo;
  this.ref = ref || 'master';
  this.dir = process.cwd();
  this.gh = new gh();
  this.gh.user = Package.user || null;
  this.gh.token = Package.token || null;
  this.gh.lookup = thunkify(this.gh.lookup);
  this.resolved = null;
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
 * Authenticate with github
 *
 * @param {String} user
 * @param {String} token
 * @return {Package} self
 * @api public
 */

Package.prototype.auth = function(user, token) {
  this.gh.user = user || Package.user;
  this.gh.token = token || Package.token;
  return this;
};

/**
 * Resolve the reference on github
 *
 * @return {String}
 * @api public
 */

Package.prototype.resolve = function *() {
  // check if ref is in the cache
  var key = this.repo + '@' + this.ref;
  this.resolved = cached(this.repo, this.ref);

  // resolved
  if (this.resolved) {
    this.debug('got %s from cache', this.resolved);
    return this.resolved;
  }

  // resolve
  try {
    this.emit('resolving');
    var ref = yield resolve(key, this.gh.user, this.gh.token);
  } catch (e) {
    throw new Error(this.slug() + ': reference "' + this.ref + '" not found.')
  }

  // couldn't resolve
  if (!ref) throw new Error(this.slug() + ': reference "' + this.ref + '" not found');

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
 * @param {String} path
 * @param {String} content
 * @api public
 */

Package.prototype.read = function *(path) {
  var ref = this.resolved || (yield this.resolve());

  this.debug('reading %s', path);

  // try local read first
  try {
    var str = yield this.readLocal(join(this.dir, this.slug(), path));
    this.debug('read local copy of %s', path);
    return str;
  } catch(e) {}

  // fetch from github
  var url = api + '/repos/' + this.repo + '/contents/' + path + '?ref=' + ref;
  var opts = this.gh.options(url, { json: true });
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
  var ref = this.resolved || (yield this.resolve());
  var dir = join(this.dir, this.slug());

  // fetching
  this.emit('fetching');

  // don't fetch if it already exists
  if (yield fs.exists(dir)) {
    this.debug('already exists at %s', dir);
    return this;
  }

  this.debug('fetching')

  var url = api + '/repos/' + this.repo + '/tarball/' + ref;
  var opts = this.gh.options(url);
  var req = request(url, opts);
  var res = yield req;

  this.debug('got a response: %s', res.statusCode);

  if (200 != res.statusCode) {
    throw this.error(res.statusCode);
  }

  this.debug('streaming the body and extracting')

  var len = res.headers['content-length'];
  var extract = decompress({ ext: '.tar.gz', path: dir, strip: 1 });
  var buf;

  // write body to decompressor
  while (buf = yield req) {
    len -= buf.length;
    yield write(extract, buf);
  }

  // ensure downloaded matches the content-length
  if (len) throw this.error('incomplete download');

  extract.end();

  // fetched
  this.emit('fetch');
  this.debug('fetched package');

  return this;
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
  var slug = this.slug();
  str = slug + ': ' + str;
  return new Error(str);
}

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
