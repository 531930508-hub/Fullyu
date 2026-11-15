#!/usr/bin/env bash
# 本地构建工具链安装（无需 sudo，全部装在 ~/.local/toolchain）
#
# 为什么需要：本项目 pom 的 target 是 1.8，本机没有 Java 也没有 Maven，
# 所以任何"编译/打包/部署"都做不了。跑一次这个脚本即可。
#
#   ./scripts/setup-toolchain.sh
#   source scripts/../.local/toolchain/env.sh   # 或 source ~/.local/toolchain/env.sh
#
# 默认走清华镜像（api.adoptium.net 会重定向到 GitHub，国内经常 0 字节卡死）。
#
set -euo pipefail

ROOT="$HOME/.local/toolchain"
JDK_VER="${JDK_VER:-17}"
MVN_VER="${MVN_VER:-3.9.16}"
TUNA="https://mirrors.tuna.tsinghua.edu.cn"
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  arm64|aarch64) JDK_ARCH="aarch64" ;;
  x86_64)        JDK_ARCH="x64" ;;
  *) echo "不支持的架构: $ARCH_RAW"; exit 1 ;;
esac
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
# Adoptium 镜像的操作系统目录：mac / linux（不是 darwin）
case "$OS" in
  darwin) JDK_OS="mac" ;;
  linux)  JDK_OS="linux" ;;
  *) echo "不支持的系统: $OS"; exit 1 ;;
esac

mkdir -p "$ROOT"

# ---------- JDK ----------
if [ -x "$ROOT/jdk/Contents/Home/bin/java" ] || [ -x "$ROOT/jdk/bin/java" ]; then
  echo "[jdk] 已存在，跳过"
else
  echo "[jdk] 从清华镜像查找 Temurin $JDK_VER ($JDK_OS-$JDK_ARCH)…"
  DIR="$TUNA/Adoptium/${JDK_VER}/jdk/${JDK_ARCH}/${JDK_OS}/"
  FILE="$(curl -fsS --max-time 20 "$DIR" | grep -oE "OpenJDK${JDK_VER}U-jdk_${JDK_ARCH}_${JDK_OS}_hotspot_[0-9._]+\\.tar\\.gz" | sort -uV | tail -1)"
  if [ -z "$FILE" ]; then
    echo "[jdk] 镜像目录里没找到包，改用官方 API（可能很慢）"
    TMP="$(mktemp -d)"
    curl -fL --retry 2 -o "$TMP/jdk.tar.gz" \
      "https://api.adoptium.net/v3/binary/latest/${JDK_VER}/ga/${JDK_OS}/${JDK_ARCH}/jdk/hotspot/normal/eclipse"
    SRC="$TMP/jdk.tar.gz"
  else
    echo "[jdk] 下载 $FILE"
    TMP="$(mktemp -d)"
    curl -fL --retry 2 --progress-bar -o "$TMP/jdk.tar.gz" "${DIR}${FILE}"
    SRC="$TMP/jdk.tar.gz"
  fi
  mkdir -p "$ROOT/jdk"
  tar -xzf "$SRC" -C "$ROOT/jdk" --strip-components=1
  rm -rf "$TMP"
  echo "[jdk] 完成"
fi
JAVA_HOME_DIR="$ROOT/jdk"
[ -d "$JAVA_HOME_DIR/Contents/Home" ] && JAVA_HOME_DIR="$JAVA_HOME_DIR/Contents/Home"

# ---------- Maven ----------
if [ -x "$ROOT/maven/bin/mvn" ]; then
  echo "[maven] 已存在，跳过"
else
  echo "[maven] 下载 Maven ${MVN_VER}…"
  TMP="$(mktemp -d)"
  curl -fL --retry 3 --progress-bar -o "$TMP/mvn.tar.gz" \
    "$TUNA/apache/maven/maven-3/${MVN_VER}/binaries/apache-maven-${MVN_VER}-bin.tar.gz"
  mkdir -p "$ROOT/maven"
  tar -xzf "$TMP/mvn.tar.gz" -C "$ROOT/maven" --strip-components=1
  rm -rf "$TMP"
  echo "[maven] 完成"
fi

# ---------- Maven 国内镜像（不配的话首次拉依赖会等到天荒地老） ----------
if [ ! -f "$ROOT/settings.xml" ]; then
  cat > "$ROOT/settings.xml" <<'XML'
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
  <mirrors>
    <mirror>
      <id>aliyun</id>
      <name>Aliyun Public</name>
      <url>https://maven.aliyun.com/repository/public</url>
      <mirrorOf>central</mirrorOf>
    </mirror>
  </mirrors>
</settings>
XML
  echo "[maven] 已写入阿里云镜像 settings.xml"
fi

cat > "$ROOT/env.sh" <<EOF
export JAVA_HOME="$JAVA_HOME_DIR"
export PATH="$JAVA_HOME_DIR/bin:$ROOT/maven/bin:\$PATH"
export MAVEN_ARGS="-s $ROOT/settings.xml"
EOF

# shellcheck disable=SC1090
. "$ROOT/env.sh"
echo
echo "java: $("$JAVA_HOME_DIR/bin/java" -version 2>&1 | head -1)"
echo "mvn : $("$ROOT/maven/bin/mvn" -v 2>/dev/null | head -1)"
echo
echo "后续每次开新终端执行： source ~/.local/toolchain/env.sh"