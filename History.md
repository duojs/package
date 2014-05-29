
0.1.1 / 2014-05-29 
==================

 * only check .netrc once
 * fetch using 'download' instead of 'co-req'. fixes inconsistent dropped requests and half downloaded packages

0.1.0 / 2014-05-29 
==================

 * bring in gh.options fn.
 * add better errors.
 * automatically pull in netrc details
 * add #path([path])
 * add "resolving" & "resolve" events, for logging
 * .resolve() better error messages
 * improve caching a bit
 * dont replace slashes
 * replace slashes with dashes on branch names
 * add events
 * update readme

0.0.10 / 2014-04-08
==================

 * bump co-req.
 * fix error throwing.
 * more debug statements
 * update error with status code

0.0.9 / 2014-04-05
==================

 * update decompress api
 * check response length of fetched content

0.0.8 / 2014-04-05
==================

 * bump decompress to 0.2.2

0.0.7 / 2014-04-05
==================

 * added debug().
 * ensure consistent content-length.
 * don't fetch if we already have

0.0.6 / 2014-03-30
==================

 * update docs. change name from gh-package => duo-package

0.0.5 / 2014-03-03
==================

 * return content body, not json response

0.0.4 / 2014-03-03
==================

 * fix package#read(path) for private repos

0.0.3 / 2014-03-01
==================

 * add pkg.slug()/toString(). fix dir.

0.0.2 / 2014-03-01
==================

 * update to resolve branch refs
 * lookup => resolve

0.0.1 / 2014-03-01
==================

 * Initial release
