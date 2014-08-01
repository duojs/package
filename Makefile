BIN := ./node_modules/.bin

node_modules: package.json
	@npm install

test:
	@$(BIN)/gnode $(BIN)/_mocha


.PHONY: test
