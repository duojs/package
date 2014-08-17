
/**
 * Module dependencies.
 */

var debug = require('debug')('duo-package:bitbucket');
var netrc = require('node-netrc');
var fmt = require('util').format;
var thunk = require('thunkify');
var resolve = thunk(require('bb-resolve'));

/**
 * Get credentials for `api.bitbucket.org`.  Checks
 * ~/.netrc, then falls back to the environment
 * variables $BITBUCKET_PASSWORD and $BITBUCKET_USER.
 *
 * @return {String}
 * @api public
 */

exports.auth = function () {
  var auth = netrc('api.bitbucket.org') || {
    password: process.env.BITBUCKET_PASSWORD,
    login: process.env.BITBUCKET_USER,
  };

  auth.password && auth.login
    ? debug('read auth from ~/.netrc')
    : debug('could not read auth from ~/.netrc');

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
  var ref = yield resolve(slug, auth.login, auth.password);
  if (!ref) {
    throw new Error(fmt('%s: reference %s not found', repo, version));
  }
  debug('resolved %s to %s', slug, ref.name);
  return ref;
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
  var auth = exports.auth();
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
