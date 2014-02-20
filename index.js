/**
 * Module dependencies
 */

var gunzip = require('zlib').createGunzip();
var tar = require('tar');
var request = require('request');
var concat = require('concat-stream');
var gh = require('gh2');

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
  this.dir = [repo, ref].join('@');
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
 * dir
 */

Package.prototype.to = function(directory) {
  this.dir = dir;
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

  req
    .on('error', fn)
    .on('end', fn);
    .pipe(gunzip)
    .pipe(tar.Extract({
      path: this.dir,
      strip: 1
    }))
};
