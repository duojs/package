/**
 * Module Dependencies
 */

var co = require('co');
var thunkify = require('thunkify');
var Package = require('./');
var pkg = new Package('matthewmueller/uid', '0.0.2');
pkg.read = thunkify(pkg.read);
pkg.auth('matthewmueller', '38c9849316796e0550e8e4aeabdd3e98b8f40a2f');

// pkg.read('component.json', function(err, contents) {
//   console.log(err, contents);
// })

// pkg.fetch(function(err) {
//   if (err) throw err;
//   console.log('all done!');
// })
