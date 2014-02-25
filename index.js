/**
 * Module dependencies
 */

var decompress = require('decompress').extract;
var thunkify = require('thunkify');
var request = require('request');
var read = require('co-read');
var request = require('co-req');
var gh = require('gh2');
var path = require('path');
var join = path.join;

/**
 * Export `Package`
 */

module.exports = Package;

/**
 * Initialize `Package`
 */

function Package(repo, ref) {
  if (!(this instanceof Package)) return new Package(repo, ref);
  this.repo = repo;
  this.ref = ref || 'master';
  this.slug = repo.replace('/', '-');
  this.dir = process.cwd();
  this.gh = new gh();
  this.gh.user = Package.user;
  this.gh.token = Package.token;
  this.gh.lookup = thunkify(this.gh.lookup);
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

Package.prototype.lookup = function *() {
  var ref = yield this.gh.lookup(this.repo, this.ref);
  return ref ? ref.name : this.ref;
};

/**
 * read
 */

Package.prototype.read = function *(path) {
  var ref = yield this.lookup();
  var url = 'https://raw.github.com/' + this.repo + '/' + ref + '/' + path;
  var opts = this.gh.options(url);
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

  return body;
};

/**
 * fetch
 */

Package.prototype.fetch = function *() {
  var ref = yield this.lookup();
  var url = 'https://api.github.com/repos/' + this.repo + '/tarball/' + ref;
  var dir = join(this.dir, this.slug + '@' + ref);
  var opts = this.gh.options(url);
  var req = request(opts);
  var res = yield req;

  if (200 != res.statusCode) {
    throw new Error(res.statusCode);
  }

  var extract = decompress({ ext: '.tar.gz', path: dir, strip: 1 });
  var buf;

  // write body to decompressor
  while (buf = yield req) extract.write(buf);
  extract.end();

  return this;
};

