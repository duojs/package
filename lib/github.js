
/**
 * Module dependencies.
 */

var debug = require('debug')('duo-package:github');
var netrc = require('node-netrc');
var fmt = require('util').format;
var thunk = require('thunkify');
var resolve = thunk(require('gh-resolve'));

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
 * Resolve `repo@version`.
 *
 * @param {String} repo
 * @param {String} version
 * @api public
 */

exports.resolve = function *(repo, version) {
  var slug = [repo, version].join('@');
  debug('resolve %s', slug);
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
