#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

prettier_flag="$([ "$1" = "--fix" ] && echo "--write" || echo "--check")"
dirs="src tests analysis"
(for dir in $dirs; do
    find "$dir" -type f -name '*.ts'
done) | xargs npx prettier $prettier_flag
