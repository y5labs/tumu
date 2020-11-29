# Tumu

1. Create a DigitalOcean droplet or a ubuntu vm with a public IP address
2. Install Caddy2, node.js, npm, git (nodejs > 10)
3. Generate a new ssh key for the server
4. Copy the public ssh key to your dev environment (for encrypting configuration)
5. Copy the public ssh key to GitHub for access
6. Install a firewall and only open 22, 80, 443
7. Deploy an encrypted specification to GitHub gist
8. Copy the gist's raw url and add it to an .env file on the server
9. Install tumu (npm i -g tumu)
10. Install tumu as a service (systemctl)
11. Run tumu
12. Install GitHub webhooks

# Notes

- The instructions contained in the encrypted specification explain which apps to start
- Only someone with the server's public ssh key can encrypt the specification.
- Only someone who can edit that gist can change the specification.

# Todo

- Seacreature logs
- Update strategies: rolling, recreate
- Upgrade whole app
- Run using npx?
https://caddyserver.com/docs/install
https://getpino.io/#/ vs https://github.com/rvagg/bole
ndjson logs / events
pull vs push
https://github.com/lrlna/pino-colada