/**
 * Module Dependencies
 */

var co = require('co');
var Package = require('./');
var pkg = new Package('component/component', '0.19.6')
  .directory('node_modules');

var pkg2 = new Package('component/component', '0.18.x')
  .directory('node_modules');


co(function *() {
  console.log(yield pkg.read('package.json'));

  pkg.on('resolving', log(pkg, 'resolving'));
  pkg.on('resolve', log(pkg, 'resolved'));
  pkg.on('fetching', log(pkg, 'fetching'));
  pkg.on('fetch', log(pkg, 'fetched'));
  yield pkg.fetch();

  pkg2.on('resolving', log(pkg, 'resolving'));
  pkg2.on('resolve', log(pkg, 'resolved'));
  pkg2.on('fetching', log(pkg, 'fetching'));
  pkg2.on('fetch', log(pkg, 'fetched'));
  yield pkg2.fetch();
})(function(err, pkg) {
  if (err) throw err;
});

function log(pkg, str){
  return function(){
    console.log(str + ' : %s', pkg.slug());  
  };
}
