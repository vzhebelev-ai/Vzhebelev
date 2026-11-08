#!/usr/bin/env bash
# Собирает приложение в один HTML-файл (CSS и JS внутри) для публикации одной страницей.
# Использование: ./build-single.sh [выходной_файл]   (по умолчанию dist/trenirovki.html)
set -euo pipefail
cd "$(dirname "$0")"
out="${1:-dist/trenirovki.html}"
mkdir -p "$(dirname "$out")"
{
  echo '<title>Дневник тренировок</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=Unbounded:wght@500;700&display=swap">'
  echo '<style>'; cat styles.css; echo '</style>'
  sed -n '/<header class="top">/,/<\/nav>/p' index.html
  echo '<script>'; cat plan.js; echo '</script>'
  echo '<script>'; cat nutrition.js; echo '</script>'
  # На странице claude.ai скачивание файлов запрещено, поэтому убираем кнопку «Скачать копию» — остаётся «Скопировать копию».
  echo '<script>'; grep -v 'data-act="export"' app.js; echo '</script>'
} > "$out"
echo "$out"
