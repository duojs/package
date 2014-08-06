
/**
 * Module dependencies.
 */

var debug = require('debug')('duo-package:github');
var resolve = require('gh-resolve');
var netrc = require('node-netrc');
var fmt = require('util').format;

/**
 * GitHub auth.
 */

var auth = exports.auth = netrc('api.github.com') || {
  password: process.env.GH_TOKEN,
};

/**
 * Logging
 */

auth.password
  ? debug('read auth details from ~/.netrc')
  : debug('could not read auth details from ~/.netrc');

/**
 * Resolve `repo@ref` invokes `fn(err, ref)`.
 *
 * @param {String} repo
 * @param {String} ref
 * @param {Function} fn
 * @api public
 */

exports.resolve = function (repo, ref, fn) {
  var slug = [repo, ref].join('@');
  debug('resolve %s', slug);
  resolve(slug, auth, function (err, ref) {
    if (err || !ref) {
      err = err || new Error(fmt('%s: reference %s not found', repo, ref));
      debug(err);
      return fn(err);
    }
    debug('resolved %s to %s', slug, ref.name);
    fn(null, ref);
  });
};

/**
 * Get a tarball URL for `repo@ref`.
 *
 * @param {String} repo
 * @param {String} ref
 * @return {String}
 * @api public
 */

exports.tarball = function (repo, ref) {
  var token = auth.password
    ? auth.password + '@'
    : '';
  return fmt(
      'https://%sgithub.com/%s/archive/%s.tar.gz'
    , token
    , repo
    , ref
  );
};
