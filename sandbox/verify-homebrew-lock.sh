#!/usr/bin/env bash
set -euo pipefail

lock="${1:?toolchain lock required}"
core_checkout="${2:?pinned homebrew-core checkout required}"

[[ "$(jq -r '.platform' "$lock")" == linux/arm64 ]]
[[ "$(jq -r '.homebrew.bottleTag' "$lock")" == arm64_linux ]]

formula_names="$(mktemp)"
bottle_names="$(mktemp)"
cleanup() { rm -f "$formula_names" "$bottle_names"; }
trap cleanup EXIT

jq -r '.formulae | keys[]' "$lock" | sort > "$formula_names"
jq -r '.homebrew.bottleSha256 | keys[]' "$lock" | sort > "$bottle_names"
diff -u "$formula_names" "$bottle_names"

while IFS=$'\t' read -r formula expected_sha; do
  formula_file="$(find "$core_checkout/Formula" -type f -name "$formula.rb" -print -quit)"
  [[ -n "$formula_file" ]] || { echo "missing pinned formula: $formula" >&2; exit 1; }
  actual_sha="$(sed -n '/bottle do/,/^[[:space:]]*end/p' "$formula_file" \
    | grep 'arm64_linux:' \
    | grep -oE '"[0-9a-f]{64}"' \
    | tr -d '"')"
  [[ "$actual_sha" == "$expected_sha" ]] || {
    echo "ARM64 bottle mismatch for $formula" >&2
    exit 1
  }
done < <(jq -r '.homebrew.bottleSha256 | to_entries[] | [.key, .value] | @tsv' "$lock")

echo "verified $(wc -l < "$formula_names" | tr -d ' ') pinned arm64_linux bottles"
