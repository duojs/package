/**
 * Module Dependencies
 */

var co = require('co');
var Package = require('./');
var pkg = new Package('cheeriojs/cheerio', '*')
  .auth(process.env.user, process.env.token)
  .directory('node_modules');

co(function *() {
  pkg.on('fetching', log(pkg, 'fetching'));
  pkg.on('fetched', log(pkg, 'fetched'));
  yield pkg.fetch();
})(function(err, pkg) {
  if (err) throw err;
  console.log(pkg);
});

function log(pkg, str){
  return function(){
    console.log(str + ' : %s', pkg.slug());  
  };
}
