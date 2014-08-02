# Duo Package

A github package installer. Meant to be used with [duo](http://github.com/duojs/duo), but can be used outside of duo. Uses generators.

## Features

- github-style urls
- semver support
- flexible api
- checks local before fetching remote
- private repo support
- automattic `~/.netrc` detection

## Installation

```
npm install duo-package
```

## Example

```js
var pkg = new Package('matthewmueller/cheerio', '0.13.x')
  .token(process.env.token)
  .directory('components');

pkg.fetch(function(err) {
  if (err) throw err;
  console.log('fetched: %s', pkg.slug());
})
```

## API

### Package(name, ref)

initialize a new `Package` with `name` and `ref`, where `name` is a github-style url and `ref` is either a tag or a branch. `ref` supports semver versioning.

Examples:

```js
Package('matthewmueller/uid', '*');
Package('matthewmueller/uid', 'master');
Package('matthewmueller/uid', 'some/feature');
Package('matthewmueller/uid', '~0.1.0');
```

### Package#token(token)

authenticate with github. you can create a new token here: https://github.com/settings/tokens/new.

if the `token` is not present, duo-package will try reading the authentication details from your `~/.netrc`. Here's an example:

```
machine api.github.com
  login user
  password token
```

### Package#directory(dir)

set a directory to install the package in.

### Package.path([path])

Get the path of the fetched package. optionally add a relative `path`.

### Package.useragent([ua])

Get or set the user agent header duo-package uses to make requests. defaults to `duo-package`.

### Package.resolve([fn])

Resolve a package's version

### Package.fetch([fn])

fetch the package. returns a generator that can be yielded in a generator function or wrapped in [co](http://github.com/visionmedia/co).

```js
yield pkg.fetch()
```

### Package.slug()

Return the full package name (ie. `component/emitter@1.0.0`)
