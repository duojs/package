
BIN := ./node_modules/.bin
SRC = $(wildcard index.js lib/*.js)
TESTS = $(wildcard test/*.js)

test: node_modules
	@$(BIN)/gnode $(BIN)/_mocha

node_modules: package.json
	@npm install
	@touch node_modules

coverage: $(SRC) $(TESTS)
	@$(BIN)/gnode $(BIN)/istanbul cover $(BIN)/_mocha

clean:
	@rm -rf coverage

.PHONY: test
