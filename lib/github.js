
/**
 * Module dependencies.
 */

var debug = require('debug')('duo-package:github');
var netrc = require('node-netrc');
var fmt = require('util').format;
var thunk = require('thunkify');
var resolve = thunk(require('gh-resolve'));

/**
 * Get credentials for `api.github.com`.  Checks
 * ~/.netrc, then falls back to the environment
 * variable $GH_TOKEN.
 *
 * @return {String}
 * @api public
 */

exports.auth = function () {
  var auth = netrc('api.github.com') || {
    password: process.env.GH_TOKEN,
  };

  auth.password
    ? debug('read auth details from ~/.netrc')
    : debug('could not read auth details from ~/.netrc');

  return auth;
};

/**
 * Resolve `repo@version`.
 *
 * @param {String} repo
 * @param {String} version
 * @api public
 */

exports.resolve = function *(repo, version) {
  var slug = [repo, version].join('@');
  debug('resolve %s', slug);
  var auth = exports.auth();
  var ref = yield resolve(slug, auth);
  if (!ref) {
    throw new Error(fmt('%s: reference %s is not found', repo, version));
  }
  debug('resolved %s to %s', slug, ref.name);
  return ref;
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
  var auth = exports.auth();
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
