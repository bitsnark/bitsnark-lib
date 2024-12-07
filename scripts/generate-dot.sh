#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

make_dot() {
    dot_path="$1.dot"
    ts-node ./src/agent/setup/generate-dot.ts "$2" > "$dot_path"
    [ $? -ne 0 ] && echo "Failed to generate $dot_path" && return 1
    echo "Generated $dot_path"
}

make_svg() {
    dot_path="$1.dot"
    svg_path="$1.svg"
    dot -Tsvg -o "$svg_path" "$dot_path"
    [ $? -ne 0 ] && echo "Failed to generate $svg_path from $dot_path" && return 1
    echo "Generated $svg_path from $dot_path"
}

base_file_path=./analysis/transactions
base_collapsed_file_path="$base_file_path.collapsed"

make_dot "$base_file_path"
make_dot "$base_collapsed_file_path" --collapsed

if ! type dot >/dev/null; then
    echo "Can not find dot executable - will not generate svg files"
    exit 0
fi
make_svg "$base_file_path"
make_svg "$base_collapsed_file_path"
exit 0
