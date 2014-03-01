/**
 * Module Dependencies
 */

var co = require('co');
var thunkify = require('thunkify');
var Package = require('./');
var pkg = new Package('matthewmueller/cheerio', '*')
  .auth(process.env.user, process.env.token)
  .directory('node_modules');

co(function *() {
  console.log(yield pkg.fetch());
})(function(err) {
  console.log(err);
});
