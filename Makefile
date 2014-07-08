
test: node_modules
	@node_modules/.bin/mocha \
		--reporter spec \
		--require co-mocha \
		--timeout 5s \
		--harmony-generators

node_modules: package.json
	@npm i

.PHONY: test
