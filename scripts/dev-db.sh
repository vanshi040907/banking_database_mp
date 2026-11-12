#!/usr/bin/env bash
# Project-local MySQL for development.
# The data, socket, logs and temp files all live in ./.local (git-ignored), so nothing is
# written to the system MySQL and nothing runs as a system service.
#
#   scripts/dev-db.sh init     first time: create the data folder, start, load all SQL + test passwords
#   scripts/dev-db.sh start    start the server        (port 3307)
#   scripts/dev-db.sh stop     stop it
#   scripts/dev-db.sh reset    wipe bank_db and reload schema, procedures, views, seed and card permissions
#   scripts/dev-db.sh sql      open a MySQL prompt on bank_db
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
L="$ROOT/.local"
CNF="$L/mysql.cnf"
export PATH="/opt/homebrew/opt/mysql/bin:/usr/local/mysql/bin:$PATH"
export TMPDIR="$L/tmp"

write_cnf() {
  mkdir -p "$L/mysql-data" "$L/tmp"
  cat > "$CNF" <<CFG
[mysqld]
datadir=$L/mysql-data
socket=$L/mysql.sock
mysqlx=OFF
port=3307
bind-address=127.0.0.1
pid-file=$L/mysql.pid
log-error=$L/mysql.err
tmpdir=$L/tmp
skip-log-bin
[client]
socket=$L/mysql.sock
port=3307
CFG
}

running() { mysqladmin --defaults-file="$CNF" -uroot ping >/dev/null 2>&1; }

start() {
  [ -f "$CNF" ] || write_cnf
  if running; then echo "MySQL already running on port 3307"; return; fi
  nohup mysqld --defaults-file="$CNF" > "$L/mysqld.out" 2>&1 &
  for _ in $(seq 1 40); do running && { echo "MySQL started on port 3307"; return; }; sleep 0.5; done
  echo "MySQL did not start. See $L/mysql.err" >&2; exit 1
}

load_sql() {
  for f in schema procedure views seed card_permissions; do
    echo "  running database/$f.sql"
    mysql --defaults-file="$CNF" -uroot < "$ROOT/database/$f.sql"
  done
  (cd "$ROOT/backend" && node scripts/set-test-passwords.js)
}

case "${1:-}" in
  init)
    write_cnf
    if [ -z "$(ls -A "$L/mysql-data" 2>/dev/null)" ]; then mysqld --defaults-file="$CNF" --initialize-insecure; fi
    start; load_sql ;;
  start) start ;;
  stop)  running && mysqladmin --defaults-file="$CNF" -uroot shutdown && echo "MySQL stopped" || echo "MySQL is not running" ;;
  reset) start; load_sql ;;
  sql)   exec mysql --defaults-file="$CNF" -uroot bank_db ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
