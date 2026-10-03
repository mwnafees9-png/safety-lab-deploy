# Safety Lab Aero on your own computer: the install, step by step

This puts everything Safety Lab Aero needs on one computer you own: the database, the
sign-in service, and the AI service. No cloud account. Nothing leaves your network except
AI drafting requests to the AI provider, and those never carry your project files.

You need to install exactly one program on that computer: Docker Desktop. Everything else
is inside this folder.

## Part 1. Get the computer ready (your IT person, about 30 minutes)

1. Pick the computer. It must stay switched on. Windows 10 or 11 Pro, a Mac, or a Linux
   server. At least 4 processor cores, 8 GB of memory, 30 GB of free disk.

2. Install Docker Desktop. Go to https://www.docker.com/products/docker-desktop/ and click
   Download. Run the installer and accept the defaults. When it asks to use WSL 2 on
   Windows, say yes. Restart the computer if it asks.

3. Open Docker Desktop once. Wait until the bottom left corner says "Engine running".
   Leave it open. (It starts by itself after this.)

4. Windows only: open the Start menu, type `Ubuntu`, and press Enter. If nothing is found,
   open the Start menu, type `cmd`, press Enter, type `wsl --install` and press Enter,
   restart the computer, then try `Ubuntu` again. The first time, Ubuntu asks you to make
   a username and a password; pick any. This Ubuntu window is where you type the commands
   below. (Mac and Linux: open the Terminal app instead.)

5. Give the computer a name on your network, for example `safetylab.yourcompany.local`.
   Your IT person does this in your DNS. Test from another computer: open a command window
   and type `ping safetylab.yourcompany.local`. It should answer.

6. Ask your IT person for a certificate for that name from the company's certificate
   authority. You get two files, a certificate and a private key. Put them on the computer,
   for example in `C:\SafetyLab\certs\`. If your company cannot make one, skip this: the
   script makes its own, and Part 3 tells you the one extra step.

7. Make the AI key. Go to https://console.anthropic.com and sign in (make an account if you
   have none). Click Settings, then Workspaces, then Create Workspace, and name it
   `Safety Lab`. Open that workspace, click API Keys, Create Key, name it `safetylab-server`,
   and copy the key somewhere safe on this computer only. Also copy the Workspace ID (it
   starts with `wrkspc_`): it is shown on the workspace's page.

8. Make sure the computer can open https://api.anthropic.com in a browser (it shows a
   short message; that is fine). That is the only outside address it needs.

## Part 2. Install (about 20 minutes, most of it waiting)

1. Unzip the Safety Lab package you downloaded into `C:\SafetyLab` (Windows) or your home
   folder (Mac, Linux). You get a folder named `customer-install`.

2. Open the Ubuntu window (Windows) or Terminal (Mac, Linux).

3. Go into the folder. Windows: type
   `cd /mnt/c/SafetyLab/customer-install/selfhost` and press Enter.
   Mac or Linux: type `cd ~/customer-install/selfhost` and press Enter.

4. Type `bash install.sh` and press Enter.

5. It asks four questions. Type each answer and press Enter:
   the server name from Part 1 step 5;
   the certificate file and the key file from step 6 (Windows paths look like
   `/mnt/c/SafetyLab/certs/server.crt`), or just press Enter twice if you have none;
   the AI key from step 7 (nothing shows while you type; that is normal);
   the Workspace ID from step 7.

6. Wait. The first run downloads about 9 GB. You see a list of files being applied, then
   "Checking the front door", then two lines that should both say 200, then "Done." and a
   sheet of what every user types in the app.

7. Two files now sit next to `install.sh`: `<server name>.safetylab-setup`, which is what every
   user needs, and `WHAT-TO-TYPE-IN-THE-APP.txt`, which explains it and lists the values in case
   anyone wants to type them by hand.

8. When the license file from Safety Lab arrives (it ends in `.lic`), put it next to
   `install.sh` and run `bash install.sh` again. The setup file is rewritten with the license
   inside, and from then on it is the only file a user needs.

If something goes wrong the script stops and prints a sentence starting with STOP that
says what to do. Running `bash install.sh` again is always safe: it remembers your answers
and never deletes your data.

## Part 3. Every user's computer (two minutes each)

1. If the script made its own certificate (you skipped Part 1 step 6): copy the file
   `trust-this-on-every-user-computer.crt` to the user's computer. Windows: double-click
   it, click Install Certificate, choose Local Machine, choose "Place all certificates in
   the following store", Browse, pick "Trusted Root Certification Authorities", Next,
   Finish. Mac: double-click it, it opens Keychain Access, find it under System, double-click
   it, open Trust, set "When using this certificate" to Always Trust, close, enter the
   password. Skip this step entirely if IT gave you a company certificate.

2. Go to https://safetylabaero.com and download the desktop app (Mac or Windows). Install
   it like any app.

3. Open it. Click "Choose setup file..." and pick the `.safetylab-setup` file your
   administrator gave you (or drop the file on the window). It fills in the server, the AI
   and the license. Click Next, read and accept the agreement, click Finish.

4. Sign in. If your server has a mail server, click Create account, use your work email,
   and click the link in the email you receive. If it does not, your administrator creates
   your account and gives you a temporary password: sign in with it, then change it under
   Account, Change password.

## Part 4. The administrator account

The install script asks for the administrator's email, creates that account itself and makes
it the administrator, then prints its temporary password once at the end. Sign in with it and
change it under Account, Change password. To add a user on a server with no mail server, run
`./add-user.sh person@yourcompany.com` in the `selfhost` folder and give them the password it
prints. (Why: without a mail server nobody can check that a person owns the address they type,
and the app trusts that address for invitations, the administrator role and sign-off records.
So open sign-up is off on such a server.)

## Day to day

Is it running? In the `stack` folder: `docker compose ps`. Every line should say "healthy"
or "Up". Stop: `docker compose stop`. Start: `docker compose start`. After a reboot it starts
by itself as long as Docker Desktop starts.

Back up these three things somewhere safe, regularly: the folder `stack/volumes/db/data`
(your data), and the files `stack/.env` and `stack/ai-proxy.env` (the keys). Losing the keys
with the data intact means nobody can sign in.

## When Safety Lab sends an update

Database updates come as new numbered files for the `db` folder. Copy them in, then in the
`stack` folder run, for each new file in order:
`docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ../../db/NN_name.sql`

A new package version: unzip it over the old one, keep your `selfhost/stack` folder and
`selfhost/answers.env`, and run `bash install.sh` again.

## What is switched off, for the technically curious

The stock Supabase stack carries a connection pooler and an edge-function runtime. The
Safety Lab app uses neither, so they are off: the pooler is the only thing that would open
the database port outside the computer, and the edge runtime downloads packages from the
internet when it starts, which breaks on an air-gapped machine. The AI service runs as a
small Node program inside Docker and is reachable only through the https front door at
`/v1/ai`. The stack files are the Supabase release `self-hosted/v0.8.2`, copied into this
package so no download from GitHub is needed.
