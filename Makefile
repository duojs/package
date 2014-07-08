
test:
	@node_modules/.bin/mocha \
		--reporter spec \
		--require co-mocha \
		--timeout 5s \
		--harmony-generators

node_modules: package.json
	@npm i

clean-cache:
	rm -r $(TMPDIR)/duo

.PHONY: test
