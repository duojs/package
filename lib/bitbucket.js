
/**
 * Module dependencies.
 */

var debug = require('debug')('duo-package:bitbucket');
var netrc = require('node-netrc');
var fmt = require('util').format;
var thunk = require('thunkify');
var resolve = thunk(require('bb-resolve'));

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
 * Resolve `repo@version`.
 *
 * @param {String} repo
 * @param {String} version
 * @api public
 */

exports.resolve = function *(repo, version) {
  var slug = [repo, version].join('@');
  debug('resolve %s', slug);
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
