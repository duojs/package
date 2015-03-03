/**
 * node v0.10 backwards compatibility
 */

require('gnode');
require('es6-promise').polyfill();

/**
 * single export
 */

module.exports = require('./lib');
