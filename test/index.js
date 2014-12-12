
var exists = require('fs').existsSync;
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

  it('should error when package is not found (status code: 406)', function*(){
    var pkg = Package('component/406', '1.0.0');
    pkg.directory(__dirname + '/tmp');
    var msg;

    try {
      yield pkg.fetch();
    } catch (e) {
      msg = e.message;
    }


    assert(~msg.indexOf('component-406@1.0.0: returned with status code: 406'));
  })

  it('should work with bootstrap', function *() {
    this.timeout(60000);
    var pkg = Package('twbs/bootstrap', 'v3.2.0');
    pkg.directory(__dirname + '/tmp');
    yield pkg.fetch();
    assert(exists(__dirname + '/tmp/twbs-bootstrap@v3.2.0/package.json'));
  })

  it('should handle inflight requests', function *() {
    var a = Package('component/tip', '1.x');
    var b = Package('component/tip', '1.x');
    var c = Package('component/tip', '1.x');
    var d = Package('component/tip', '1.x');
    a.directory(__dirname + '/tmp');
    b.directory(__dirname + '/tmp');
    c.directory(__dirname + '/tmp');
    d.directory(__dirname + '/tmp');
    yield [a.fetch(), b.fetch(), c.fetch(), d.fetch()];
    assert(exists(__dirname + '/tmp/component-tip@1.0.3/component.json'));
  })

  it('should work with renamed repos', function *() {
    var pkg = Package('component/get-document', '0.1.0');
    pkg.directory(__dirname + '/tmp')
    yield pkg.fetch();
    assert(exists(__dirname + '/tmp/component-get-document@0.1.0/component.json'));
  })

  it('should work with callbacks', function(done) {
    var pkg = Package('component/emitter', '0.0.x');
    pkg.resolve(function(err, ref) {
      if (err) done(err);
      assert('0.0.6' == ref);
      done();
    })
  })

  it('should work on weird forked semvers', function(done){
    var pkg = Package('segmentio/marked', '*');
    pkg.resolve(function (err, ref) {
      if (err) return done(err);
      assert(/v[.\d]+/.test(ref));
      done();
    });
  })

  describe('private modules', function() {
    it('should throw a meaningful error when not authenticated', function (done) {
      var pkg = Package('matthewmueller/wordsmith', 'master');
      pkg.directory(__dirname + '/tmp')
      pkg.token(null);
      pkg.fetch(function(err) {
        assert(err);
        assert.equal(err.message, 'matthewmueller-wordsmith@master: returned with status code: 406. You have not authenticated and this repo may be private. Make sure you have a ~/.netrc entry or specify $GH_TOKEN=<token>.');
        done();
      });
    });

    // TODO: figure out a way to test private modules
  })
})
