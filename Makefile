BIN := ./node_modules/.bin
NODE ?= node

all: $(patsubst lib/%.js,build/%.js,$(wildcard lib/*.js))

build:
	mkdir $@

build/%.js: lib/%.js | node_modules build
	$(BIN)/regenerator $^ > $@

test: all
	@$(NODE) $(BIN)/_mocha

node_modules: package.json
	@npm i

clean:
	rm -rf build

distclean:
	rm -rf node_modules

.PHONY: test clean
