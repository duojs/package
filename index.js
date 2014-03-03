/**
 * Module dependencies
 */

var decompress = require('decompress').extract;
var thunkify = require('thunkify');
var request = require('co-req');
var write = require('co-write');
var gh = require('gh2');
var path = require('path');
var join = path.join;

/**
 * Export `Package`
 */

module.exports = Package;

/**
 * api url
 */

var api = 'https://api.github.com';

/**
 * Cache for resolved package versions
 */

var refs = {};

/**
 * Initialize `Package`
 */

function Package(repo, ref) {
  if (!(this instanceof Package)) return new Package(repo, ref);
  this.repo = repo;
  this.ref = ref || 'master';
  this.dir = process.cwd();
  this.gh = new gh();
  this.gh.user = Package.user;
  this.gh.token = Package.token;
  this.gh.lookup = thunkify(this.gh.lookup);
  this.resolved = null;
};

/**
 * directory
 */

Package.prototype.directory = function(dir) {
  if (!dir) return this.dir;
  this.dir = dir;
  return this;
};

/**
 * auth
 */

Package.prototype.auth = function(user, token) {
  this.gh.user = user;
  this.gh.token = token;
  return this;
};

Package.prototype.resolve = function *() {
  // check if ref is in the cache
  var key = this.repo + '@' + this.ref;
  if (refs[key]) {
    this.resolved = refs[key];
    return refs[key];
  }

  var ref = yield this.gh.lookup(this.repo, this.ref);
  if (!ref) throw new Error(this.slug() + ': reference "' + this.ref + '" not found.');

  this.resolved = refs[key] = ref.name;
  return ref.name;
};

/**
 * read
 */

Package.prototype.read = function *(path) {
  var ref = this.resolved || (yield this.resolve());
  var url = api + '/repos/' + this.repo + '/contents/' + path + '?ref=' + ref;
  var opts = this.gh.options(url, { json: true });
  var req = request(opts);
  var res = yield req;

  if (res.statusCode != 200 ) {
    throw new Error(res.statusCode);
  }

  var body = '';
  var buf;

  while (buf = yield req) {
    body += buf.toString();
  }

  body = JSON.parse(body);
  var content = new Buffer(body.content, 'base64').toString();
  return content;
};

/**
 * fetch
 */

Package.prototype.fetch = function *() {
  var ref = this.resolved || (yield this.resolve());
  var url = api + '/repos/' + this.repo + '/tarball/' + ref;
  var dir = join(this.dir, this.slug());
  var opts = this.gh.options(url);
  var req = request(opts);
  var res = yield req;

  if (200 != res.statusCode) {
    throw new Error(res.statusCode);
  }

  var extract = decompress({ ext: '.tar.gz', path: dir, strip: 1 });
  var buf;

  // write body to decompressor
  while (buf = yield req) {
    yield write(extract, buf);
  }

  extract.end();

  return this;
};

/**
 * Get the slug
 */

Package.prototype.toString =
Package.prototype.slug = function() {
  var repo = this.repo.replace('/', '-');
  var ref = this.resolved || this.ref;
  return repo + '@' + ref;
};
