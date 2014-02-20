/**
 * Module Dependencies
 */

var co = require('co');
var thunkify = require('thunkify');
var Package = require('./');
var pkg = new Package('matthewmueller/cheerio', 'master')
  .auth('matthewmueller', '38c9849316796e0550e8e4aeabdd3e98b8f40a2f')
  .to('node_modules');

// pkg.read('component.json', function(err, contents) {
//   console.log(err, contents);
// })

pkg.fetch(function(err) {
  if (err) throw err;
  console.log('all done!');
})
