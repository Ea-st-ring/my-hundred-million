#!/usr/bin/env bash
# Oracle Cloud(Ubuntu 22.04) 인스턴스에서 1회 실행하는 설치 스크립트.
#
# 사용법 (이 폴더 전체를 서버에 올린 뒤, 이 폴더 안에서 실행):
#   scp -i <key> -r server/toss-invest-proxy ubuntu@<PUBLIC_IP>:~/toss-invest-proxy
#   ssh -i <key> ubuntu@<PUBLIC_IP>
#   cd ~/toss-invest-proxy
#   sudo bash install.sh <PUBLIC_IP>
#
# 실행 후 /etc/toss-invest-proxy.env 를 열어 SUPABASE_URL / SUPABASE_ANON_KEY 를
# 채워넣고 `sudo systemctl restart toss-invest-proxy` 하면 됩니다.

set -euo pipefail

PUBLIC_IP="${1:-}"
if [ -z "$PUBLIC_IP" ]; then
	echo "사용법: sudo bash install.sh <이 서버의 Public IP>"
	exit 1
fi

RUN_USER="${SUDO_USER:-ubuntu}"
RUN_HOME=$(eval echo "~$RUN_USER")
HOSTNAME="${PUBLIC_IP}.nip.io"
APP_DIR="/opt/toss-invest-proxy"

echo "== 패키지 설치 =="
apt-get update -y
apt-get install -y curl unzip ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

echo "== Deno 설치 (실행 계정: $RUN_USER) =="
if [ ! -x "$RUN_HOME/.deno/bin/deno" ]; then
	sudo -u "$RUN_USER" bash -c 'curl -fsSL https://deno.land/install.sh | sh'
fi
DENO_BIN="$RUN_HOME/.deno/bin/deno"

echo "== Caddy 설치 =="
if ! command -v caddy >/dev/null 2>&1; then
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -y
	apt-get install -y caddy
fi

echo "== 앱 파일 배치 ($APP_DIR) =="
mkdir -p "$APP_DIR"
cp "$(dirname "$0")/main.ts" "$APP_DIR/main.ts"

echo "== 환경변수 파일 =="
if [ ! -f /etc/toss-invest-proxy.env ]; then
	cat > /etc/toss-invest-proxy.env <<EOF
SUPABASE_URL=여기에_https://xxxx.supabase.co_입력
SUPABASE_ANON_KEY=여기에_anon_key_입력
PORT=8000
EOF
	echo "!! /etc/toss-invest-proxy.env 를 반드시 채워넣으세요 !!"
fi

echo "== systemd 서비스 등록 =="
cat > /etc/systemd/system/toss-invest-proxy.service <<EOF
[Unit]
Description=Toss Invest fixed-IP proxy
After=network.target

[Service]
Type=simple
User=$RUN_USER
EnvironmentFile=/etc/toss-invest-proxy.env
ExecStart=$DENO_BIN run --allow-net --allow-env $APP_DIR/main.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable toss-invest-proxy
systemctl restart toss-invest-proxy

echo "== Caddy 설정 (HTTPS, 호스트: $HOSTNAME) =="
cat > /etc/caddy/Caddyfile <<EOF
${HOSTNAME} {
	reverse_proxy 127.0.0.1:8000
}
EOF
systemctl restart caddy

echo "== 방화벽 (ufw) 80/443 개방 =="
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo ""
echo "완료. 다음 순서로 마무리하세요:"
echo "1) sudo nano /etc/toss-invest-proxy.env  # SUPABASE_URL / SUPABASE_ANON_KEY 입력"
echo "2) sudo systemctl restart toss-invest-proxy"
echo "3) 프록시 주소: https://${HOSTNAME}"
echo "4) OCI 콘솔 VCN Security List에서도 80,443 Ingress를 열어주세요 (ufw와 별개)."
