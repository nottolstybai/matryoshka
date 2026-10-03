PORT ?= 8000
URL  := http://localhost:$(PORT)

.DEFAULT_GOAL := help
.PHONY: help dev open test test-watch check deploy deploy-prod

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
	@for f in web/js/*.js tests/*.js; do node --check $$f || exit 1; done && echo "ok"

deploy: check test ## Превью-выкладка на Vercel (первый раз спросит логин и имя проекта)
	cd web && npx vercel

deploy-prod: check test ## Выкладка на основной адрес Vercel
	cd web && npx vercel --prod
