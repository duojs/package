/**
 * Module Dependencies
 */

var co = require('co');
var thunkify = require('thunkify');
var Package = require('./');
var pkg = new Package('component/event', '0.1.2')
  .auth(process.env.user, process.env.token)
  .directory('node_modules');

co(function *() {
  yield pkg.fetch()
})(function(err) {
  console.log(err);
});
