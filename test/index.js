
var exists = require('co-fs').exists;
var mkdirp = require('mkdirp').sync;
var rimraf = require('rimraf').sync;
var assert = require('assert');
var Package = require('..');

describe('duo-package', function(){
  var pkgs = ['component/type@master', 'component/type@1.0.0', 'component/emitter@master'];

  beforeEach(function(){
    mkdirp(__dirname + '/tmp');
  })

  before(function(){
    rimraf(__dirname + '/tmp');
  })

  afterEach(function(){
    rimraf(__dirname + '/tmp');
  })

  it('should install correctly', function*(){
    yield pkgs.map(function(pkg){
      var parts = pkg.split('@');
      pkg = Package(parts[0], parts[1]);
      pkg.directory(__dirname + '/tmp');
      return pkg.fetch();
    });

    assert(exists(__dirname + '/tmp/component-type@1.0.0/component.json'));
    assert(exists(__dirname + '/tmp/component-type@master/component.json'));
    assert(exists(__dirname + '/tmp/component-emitter@master/component.json'));
  })
})
