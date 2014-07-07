
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

  it('should error when package is not found', function*(){
    var pkg = Package('component/404', '1.0.0');
    pkg.directory(__dirname + '/tmp');
    var msg;

    try {
      yield pkg.fetch();
    } catch (e) {
      msg = e.message;
    }

    assert.equal('component-404@1.0.0: incorrect header check', msg);
  })

  it('should throw an error when auth isnt set', function*(){
    var pkg = Package('component/type', '1.0.0');
    var a, b;

    pkg.user = null;
    pkg.token = null;

    try {
      yield pkg.fetch();
    } catch (e) {
      a = e.message
    }

    try {
      yield pkg.resolve();
    } catch (e) {
      b = e.message;
    }

    assert.equal(a, b);
    assert.equal(a, [
      'Github authentication error:',
      'make sure you have ~/.netrc or',
      'specify $GH_USER=<user> $GH_TOKEN=<token>.'
    ].join(' '));
  })
})
