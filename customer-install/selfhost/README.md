# Safety Lab Aero — everything on your own server

This folder puts the whole backend on one machine you own: the database, the sign-in
service, the API that enforces the access rules, and the live-update channel. No Supabase
account, no cloud, nothing leaves your network. It uses the open-source Supabase stack
(Apache 2.0) running in Docker, with the Safety Lab database built into it by the files in
`../db`.

If you would rather use a Supabase project in your own cloud account, you do not need this
folder: follow the deployment guide's self-hosted section instead. Both paths give the app
the same two values (a server address and a publishable key).

## What you need

- A Linux server (or a Windows or Mac machine running Docker Desktop) with Docker and the
  Docker Compose plugin, git and openssl. About 10 GB of disk for the images, plus your data.
- Internet access from that machine for the first run only (to download the images). After
  that it can be air-gapped.
- A DNS name your users will reach the server on, for example `safetylab.yourcompany.local`.
- A certificate for that name from your own certificate authority (the one your company
  machines already trust). If you have none, `--self-signed` works for a lab: the script
  prints a root certificate that every user machine must then trust.

## Install

```
cd customer-install/selfhost
./install.sh safetylab.yourcompany.local --cert /path/server.crt --key /path/server.key
```

or, for a lab without a certificate:

```
./install.sh safetylab.yourcompany.local --self-signed
```

The script fetches the stack files (pinned to the release it was proven against), generates
all secrets into `stack/.env` (keep that file private, it is the keys to your database),
configures https, starts the services, builds the Safety Lab database, and prints the
three lines to put in the app's `install.env`. Then continue with `node configure.js` as the
deployment guide says.

## After install

Make yourself an administrator (once, with your own email address):

```
cd stack && docker compose exec -T db psql -U postgres -d postgres \
  -c "insert into private.platform_admins(email) values ('you@yourcompany.com')"
```

Day to day, from the `stack` folder: `sh run.sh status`, `sh run.sh stop`, `sh run.sh start`,
`sh run.sh logs`. The admin dashboard is at `https://<server>/project/` behind the username
and password in `stack/.env`.

Back up `stack/volumes/db/data` (the database) and `stack/.env` (the keys). Losing `.env`
with the data intact means nobody can sign in.

## What is switched off

Two services in the stock Supabase stack are disabled by `docker-compose.slab-tls.yml`
because the Safety Lab app never uses them: the connection pooler, which is the only thing
that would expose the database port outside the box, and the edge-function runtime, which
downloads packages from the internet at boot and would never come up on an air-gapped
machine. Everything else is stock, so Supabase's own `update.sh` in the `stack` folder works
for upgrades.

## Sign-ups

No mail server is configured, so a new user's sign-up confirms itself. The access rules and
the licence file still decide what anyone can see: a new account sees nothing until a
workspace owner adds it. To require email confirmation instead, fill in the `SMTP_*`
lines in `stack/.env`, set `ENABLE_EMAIL_AUTOCONFIRM=false`, and run `./install.sh` again
with the same arguments.

## Upgrading the Safety Lab database later

`install.sh` builds the database only when it is missing. When Safety Lab sends you new
numbered files for `../db`, apply just the new ones, in order:

```
cd stack && docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ../../db/NN_name.sql
```
