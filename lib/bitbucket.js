
/**
 * Module dependencies.
 */

var debug = require('debug')('duo-package:bitbucket');
var resolve = require('bb-resolve');
var netrc = require('node-netrc');
var fmt = require('util').format;

/**
 * BitBucket auth.
 */

var auth = exports.auth = netrc('api.bitbucket.org') || {
  password: process.env.BITBUCKET_PASSWORD,
  login: process.env.BITBUCKET_USER,
};

/**
 * Logging.
 */

auth.password && auth.login
  ? debug('read auth from ~/.netrc')
  : debug('could not read auth from ~/.netrc');

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
  resolve(slug, auth.login, auth.password, function (err, ref) {
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
 * Get a tarball url for `repo@ref`.
 *
 * @param {String} repo
 * @param {String} ref
 * @return {String}
 * @api public
 */

exports.tarball = function (repo, ref) {
  var basic = auth.login && auth.password
    ? auth.login + ':' + auth.password + '@'
    : '';
  return fmt(
      'https://%sbitbucket.org/%s/get/%s.tar.gz'
    , basic
    , repo
    , ref
  );
};
