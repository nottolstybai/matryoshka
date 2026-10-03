PORT ?= 8000
URL  := http://localhost:$(PORT)
SRC  ?= puzzles/source.json

.DEFAULT_GOAL := help
.PHONY: help dev open test test-watch check seal assets deploy deploy-prod

help: ## Список команд
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-12s %s\n", $$1, $$2}'

dev: ## Поднять локальный сервер для web/ (PORT=8000)
	@echo "Открой $(URL)  (Ctrl+C — остановить)"
	python3 -m http.server $(PORT) --directory web

open: ## Открыть игру в браузере (сервер должен быть запущен)
	open $(URL)

test: ## Прогнать юнит-тесты движка
	node --test tests/*.test.js

test-watch: ## Тесты в режиме наблюдения — перезапуск при изменениях
	node --test --watch tests/*.test.js

check: ## Проверить синтаксис всех JS-файлов
	@for f in web/js/*.js tests/*.js tools/*.mjs; do node --check $$f || exit 1; done && echo "ok"

seal: ## Зашифровать головоломки из SRC (puzzles/source.json) в web/data/puzzles.json; REPLACE=1 — перепечатать даты
	node tools/seal.mjs $(SRC) $(if $(REPLACE),--replace)

CHROME ?= /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
SHOT   := "$(CHROME)" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=4000

assets: ## Перерисовать иконки и превью ссылки из tools/assets (нужен Chrome)
	$(SHOT) --window-size=1200,630 --screenshot=web/og.png "file://$(CURDIR)/tools/assets/og.html"
	$(SHOT) --window-size=512,512 --screenshot=tools/assets/icon-512.png "file://$(CURDIR)/tools/assets/icon.html"
	sips -z 180 180 tools/assets/icon-512.png --out web/apple-touch-icon.png >/dev/null
	sips -z 32 32 tools/assets/icon-512.png --out web/favicon-32.png >/dev/null

deploy: check test ## Превью-выкладка на Vercel (первый раз спросит логин и имя проекта)
	cd web && npx vercel

deploy-prod: check test ## Выкладка на основной адрес Vercel
	cd web && npx vercel --prod
