
var assert = require('assert');
var exists = require('co-fs').exists;
var mkdirp = require('mkdirp-then');
var netrc = require('node-netrc');
var Package = require('..');
var path = require('path');
var rimraf = require('rimraf-then');

var auth = netrc('api.github.com') || { token: process.env.GH_TOKEN };
var tmp = path.join(__dirname, 'tmp');

describe('duo-package', function(){
  var pkgs = ['component/type@master', 'component/type@1.0.0', 'component/emitter@master'];
  var token = null;

  before(function(){
    token = auth.token || auth.password;
  });

  beforeEach(function*(){
    yield mkdirp(tmp);
  });

  before(function*(){
    yield rimraf(tmp);
  });

  afterEach(function*(){
    yield rimraf(tmp);
  });

  it('should install correctly', function*(){
    yield pkgs.map(function(pkg){
      var parts = pkg.split('@');
      pkg = Package(parts[0], parts[1]);
      pkg.token(token);
      pkg.directory(tmp);
      return pkg.fetch();
    });

    assert(yield exists(path.join(tmp, 'component-type@1.0.0/component.json')));
    assert(yield exists(path.join(tmp, 'component-type@master/component.json')));
    assert(yield exists(path.join(tmp, 'component-emitter@master/component.json')));
  });

  it('should error when package is not found (status code: 404)', function*(){
    var pkg = Package('component/404', '1.0.0');
    pkg.directory(tmp);
    pkg.token(token);
    var msg;

    try {
      yield pkg.fetch();
    } catch (e) {
      msg = e.message;
    }

    assert.equal(msg, 'unable to resolve component/404@1.0.0');
  });

  it('should work with bootstrap', function *() {
    this.timeout(60000);
    var pkg = Package('twbs/bootstrap', 'v3.2.0');
    pkg.directory(tmp);
    pkg.token(token);
    yield pkg.fetch();
    assert(yield exists(path.join(tmp, 'twbs-bootstrap@v3.2.0/package.json')));
  });

  it('should handle inflight requests', function *() {
    var a = Package('component/tip', '1.x');
    var b = Package('component/tip', '1.x');
    var c = Package('component/tip', '1.x');
    var d = Package('component/tip', '1.x');
    a.directory(tmp);
    a.token(token);
    b.directory(tmp);
    b.token(token);
    c.directory(tmp);
    c.token(token);
    d.directory(tmp);
    d.token(token);
    yield [a.fetch(), b.fetch(), c.fetch(), d.fetch()];
    assert(yield exists(path.join(tmp, 'component-tip@1.0.3/component.json')));
  });

  it('should work with renamed repos', function *() {
    var pkg = Package('component/get-document', '0.1.0');
    pkg.directory(tmp);
    pkg.token(token);
    yield pkg.fetch();
    assert(yield exists(path.join(tmp, 'component-get-document@0.1.0/component.json')));
  });

  it('should work with callbacks', function(done) {
    var pkg = Package('component/emitter', '0.0.x');
    pkg.token(token);
    pkg.resolve(function(err, ref) {
      if (err) done(err);
      assert.equal(ref, '0.0.6');
      done();
    });
  });

  it('should work on weird forked semvers', function(done){
    var pkg = Package('segmentio/marked', '*');
    pkg.token(token);
    pkg.resolve(function (err, ref) {
      if (err) return done(err);
      assert(/v[.\d]+/.test(ref));
      done();
    });
  });

  describe('cache', function () {
    it('should clean the tmp dir cache', function *() {
      assert(yield exists(Package.cachepath));
      yield Package.cleanCache();
      assert(!(yield exists(Package.cachepath)));
    });
  });
});
