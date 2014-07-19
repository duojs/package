BIN := ./node_modules/.bin
NODE ?= node
SRC = $(shell find lib/ -name "*.js")


all: build

node_modules: package.json
	@npm install

build: $(patsubst lib/%,build/%,$(SRC))

build/%.js: lib/%.js
	@mkdir -p $(dir $@)
	@$(BIN)/regenerator $< > $@

test: build
	@$(NODE) $(BIN)/_mocha

clean:
	@rm -rf build

distclean:
	@rm -rf node_modules


.PHONY: all test clean distclean
