#!/bin/zsh
# 捕获选中文字 / 剪贴板（文字或图片）→ 新 Terminal 窗口 → opencode --agent capture --prompt
# 用法：
#   capture-tutor.sh "选中文字"
#   printf '...' | capture-tutor.sh
#   capture-tutor.sh --clipboard          # 文字优先；剪贴板没文字就取图片
#   capture-tutor.sh --clipboard-image    # 强制取剪贴板图片
# 环境变量：
#   CAPTURE_MAX=500       截断长度（字符）
#   CAPTURE_DRY_RUN=1     只打印将要发送的提示，不开窗口

set -u

# 服务（Automator）环境没有登录 shell 的 PATH，显式补上 Homebrew
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"
# 服务环境没有 LANG，pbpaste 会按旧编码输出导致中文乱码
export LANG="${LANG:-en_US.UTF-8}"
export LC_CTYPE="en_US.UTF-8"

MAX="${CAPTURE_MAX:-500}"
DRY_RUN="${CAPTURE_DRY_RUN:-0}"
IMG_DIR="$HOME/.cache/opencode/captures"

fail() {
  echo "捕获失败：$1" >&2
  exit 2
}

mode="text"
case "${1:-}" in
  --clipboard) mode="auto"; shift ;;
  --clipboard-image) mode="image"; shift ;;
esac

text=""
if [[ "$mode" != "image" ]]; then
  if [[ $# -gt 0 ]]; then
    text="$*"
  elif [[ ! -t 0 && "$mode" == "text" ]]; then
    text="$(cat)"
  fi
fi
if [[ "$mode" == "auto" && -z "${text//[[:space:]]/}" ]]; then
  text="$(pbpaste 2>/dev/null || true)"
fi

img=""
prompt=""
if [[ -n "${text//[[:space:]]/}" ]]; then
  trimmed="$(print -rn -- "$text" | node -e '
const fs = require("fs")
let s = fs.readFileSync(0, "utf8")
s = s.replace(/\s+/g, " ").trim()
const max = Number(process.argv[1]) || 500
const chars = Array.from(s)
if (chars.length > max) s = chars.slice(0, max).join("") + "…"
process.stdout.write(s)
' "$MAX")" || fail "文字处理出错"
  [[ -z "$trimmed" ]] && fail "没有可发送的文字"
  prompt="解释一下：$trimmed"
else
  [[ "$mode" == "text" ]] && fail "没有输入文字。用法：capture-tutor.sh \"文字\" | --clipboard | --clipboard-image"
  mkdir -p "$IMG_DIR" || fail "无法创建图片目录：$IMG_DIR"
  # 关窗口可能来不及清理，顺手删掉 10 分钟前的旧图
  find "$IMG_DIR" -type f -mmin +10 -delete 2>/dev/null || true
  img="$IMG_DIR/$(date +%Y%m%d-%H%M%S)-$$.png"
  saved="$(osascript - "$img" <<'APPLESCRIPT'
on run argv
  set target to item 1 of argv
  try
    set d to the clipboard as «class PNGf»
    set f to open for access POSIX file target with write permission
    set eof f to 0
    write d to f
    close access f
    return "PNG"
  on error
    try
      set d to the clipboard as «class TIFF»
      set src to target & ".tiff"
      set f to open for access POSIX file src with write permission
      set eof f to 0
      write d to f
      close access f
      return "TIFF:" & src
    on error
      return "NOIMAGE"
    end try
  end try
end run
APPLESCRIPT
)" || fail "读取剪贴板图片出错"
  case "$saved" in
    PNG) ;;
    TIFF:*)
      sips -s format png "${saved#TIFF:}" --out "$img" >/dev/null 2>&1 || fail "TIFF 转 PNG 失败"
      rm -f "${saved#TIFF:}"
      ;;
    *) fail "剪贴板里没有文字，也没有图片" ;;
  esac
  width="$(sips -g pixelWidth "$img" 2>/dev/null | tail -1 | tr -dc "0-9")"
  if [[ "${width:-0}" -gt 1600 ]]; then
    sips -Z 1600 "$img" >/dev/null 2>&1 || true
  fi
  [[ -s "$img" ]] || fail "图片保存失败"
  prompt="解释一下这张图：$img"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  print -r -- "$prompt"
  [[ -n "$img" && "${CAPTURE_KEEP_IMAGE:-0}" != "1" ]] && rm -f "$img"
  exit 0
fi

opencode_bin="$(command -v opencode)" || fail "找不到 opencode 命令"
[[ -x "$opencode_bin" ]] || fail "opencode 不可执行：$opencode_bin"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/capture.XXXXXX")" || fail "无法创建临时目录"
prompt_file="$tmpdir/prompt.txt"
launcher="$tmpdir/capture.command"

print -rn -- "$prompt" > "$prompt_file"

cat > "$launcher" <<EOF
#!/bin/zsh
cleanup() { rm -rf '$tmpdir'; [[ -n "$img" ]] && rm -f '$img'; }
trap cleanup EXIT HUP TERM INT
cd "\$HOME"
"$opencode_bin" --agent capture --prompt "\$(cat '$prompt_file')"
EOF

chmod 700 "$launcher"
open -a Terminal "$launcher" || fail "无法打开 Terminal"

echo "已在新终端打开 capture：${prompt:0:44}…"
