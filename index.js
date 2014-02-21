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
  this.slug = repo.replace('/', '-');
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
  var self = this;

  this.lookup(function(err, ref) {
    if (err) return fn(err);
    ref = ref ? ref.name : self.ref;

    var url = 'https://raw.github.com/' + self.repo + '/' + ref.name + '/' + path;
    var opts = self.gh.options(url);
    request(opts, function(err, res, body) { return fn(err, body) });
  });

  return this;
};

/**
 * fetch
 */

Package.prototype.fetch = function(fn) {
  var self = this;

  this.lookup(function(err, ref) {
    if (err) return fn(err);
    ref = ref ? ref.name : self.ref;

    var url = 'https://api.github.com/repos/' + self.repo + '/tarball/' + ref;
    var opts = self.gh.options(url);
    var req = request(opts);
    var dir = self.dir + '@' + ref;
    var extract = tar.Extract({ path: dir, strip: 1 });

    // TODO: multipipe
    req
      .pipe(gunzip)
      .pipe(extract)
      .on('end', fn);

    // Error handling
    req.on('error', fn);
    gunzip.on('error', fn);
    extract.on('error', fn);
  });

  return this;
};

/**
 * lookup
 */

Package.prototype.lookup = function(fn) {
  this.gh.lookup(this.repo, this.ref, fn);
};

/**
 * unsatisfied
 */

// Package.prototype.unsatisfied = function() {
//   return new Error(this.repo + ' does not have the reference: ' + this.ref);
// };
