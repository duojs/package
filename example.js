/**
 * Module Dependencies
 */

var co = require('co');
var thunkify = require('thunkify');
var Package = require('./');
var pkg = new Package('matthewmueller/cheerio', 'gh-pages')
  .auth(process.env.user, process.env.token)
  .directory('node_modules');

co(function *() {
  console.log(yield pkg.resolve());
})(function(err) {
  console.log(err);
});
