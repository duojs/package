/**
 * Module Dependencies
 */

var co = require('co');
var Package = require('./');
var pkg = new Package('matthewmueller/cheerio', '*')
  .auth(process.env.user, process.env.token)
  .directory('node_modules');

co(function *() {

  return yield pkg.read('package.json');

})(function(err, pkg) {
  if (err) throw err;
  console.log(pkg);
});
