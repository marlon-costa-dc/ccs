# Native development surface for the CCS TypeScript workspace.
# Bun and the package scripts own build, lint, format, and test; this file only
# composes them under the canonical verbs every workspace exposes.

SHELL := /bin/sh
.DEFAULT_GOAL := help
APPLY ?= N

.PHONY: help setup gen fmt fix check test

help: ## show the complete development surface
	@awk 'BEGIN{FS=":.*## "} /^[a-z][a-z-]*:.*## /{printf "  %-8s %s\n",$$1,$$2}' $(MAKEFILE_LIST)

setup: ## install the locked dependency set
	@bun install --frozen-lockfile

gen: ## rebuild the distributed bundle and verify it
	@bun run build
	@bun run verify:bundle

fmt: ## report unformatted sources; APPLY=Y rewrites them
	@if [ "$(APPLY)" = "Y" ]; then bun run format; else bun run format:check; fi

fix: ## report lint findings; APPLY=Y applies the safe corrections
	@if [ "$(APPLY)" = "Y" ]; then bun run lint:fix; else bun run lint; fi

check: ## typecheck, lint, and formatting proof
	@bun run typecheck
	@bun run lint
	@bun run format:check

test: ## execute the complete test suite
	@bun run test:all
