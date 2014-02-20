/**
 * Module dependencies
 */

var gunzip = require('zlib').createGunzip();
var tar = require('tar');
var request = require('request');
var concat = require('concat-stream');
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
  this.slug = repo.replace('/', '-') + '@' + ref;
  this.dir = join(process.cwd(), this.slug);
  this.gh = new gh();
}

/**
 * auth
 */

Package.prototype.auth = function(user, token) {
  this.gh.user = user;
  this.gh.token = token;
  return this;
};


/**
 * to
 */

Package.prototype.to = function(dir) {
  this.dir = join(dir, this.slug);
  return this;
};


/**
 * read
 */

Package.prototype.read = function(path, fn) {
  var url = 'https://raw.github.com/' + this.repo + '/' + this.ref + '/' + path;
  var opts = this.gh.options(url);
  request(opts, function(err, res, body) { return fn(err, body) });
  return this;
};

/**
 * fetch
 */

Package.prototype.fetch = function(fn) {
  var url = 'https://api.github.com/repos/' + this.repo + '/tarball/' + this.ref;
  var opts = this.gh.options(url);
  var req = request(opts);
  var extract = tar.Extract({ path: this.dir, strip: 1 });

  req
    .pipe(gunzip)
    .pipe(extract)
    .on('error', fn)
    .on('end', fn);

  return this;
};
