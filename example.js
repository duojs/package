/**
 * Module Dependencies
 */

var co = require('co');
var thunkify = require('thunkify');
var Package = require('./');
var pkg = new Package('matthewmueller/uid', '0.0.x')
  .auth('matthewmueller', process.env.token)
  .to('node_modules');

pkg.read('component.json', function(err, contents) {
  if (err) throw err;
  console.log(contents);
})

// pkg.fetch(function(err) {
//   if (err) throw err;
//   console.log('all done!');
// })
