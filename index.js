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
  this.gh = new gh({
    user: Package.user,
    token: Package.token
  });
}

/**
 * auth
 */

Package.prototype.auth = function(user, token) {
  this.gh.user = user || Package.user;
  this.gh.token = token || Package.token;
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

    var url = 'https://raw.github.com/' + self.repo + '/' + ref + '/' + path;
    var opts = self.gh.options(url);
    request(opts, function(err, res, body) {
      if (err) return fn(err);
      else if (res.statusCode != 200) return fn(new Error(res.statusCode));
      return fn(null, body);
    });
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
 * Static: auth
 */

Package.auth = function(user, token) {
  this.user = user;
  this.token = token;
  return this;
}

/**
 * unsatisfied
 */

// Package.prototype.unsatisfied = function() {
//   return new Error(this.repo + ' does not have the reference: ' + this.ref);
// };
