# Neuravic

Neuravic is a technology company's website and client portal. Visitors read about the company and send enquiries. Clients sign up, log in and, once invited to an organisation, follow their projects, make requests, approve work, comment and share files. Neuravic staff manage enquiries, people, site content and security.

| Folder | What it is |
|---|---|
| `nfe/` | Frontend: the website and the client portal |
| `nbe/` | Backend: small services behind one gateway (sign-in, portal, enquiries, staff tools, background worker) |
| `server/` | File server: stores, scans and serves uploaded files |
| `database/` | MySQL: access setup and migrations |
| `security/` | Security tools: secret generator, secret and dependency scan |
| `deployment/` | Docker, Kubernetes and Helm |
| `images/` | Brand and documentation images |
| `test/` | Unit tests and integration tests |
| `docs/` | The documentation, start with [01 Architecture](docs/01-Architecture.md) |

## Run it

Needs Node.js 22.13+ and MySQL 8+.

```bash
npm install
npm run db:local        # private local MySQL, writes .env
npm run db:migrate
npm start               # backend on http://127.0.0.1:8787
```

```bash
cd NFE
npm install
cp .env.example .env.local
npm run dev             # website on http://localhost:5173
```

The website has no sign-in for now: `/portal` shows an "under construction" page. The accounts API still exists in the backend.

## Documentation

[01 Architecture](docs/01-Architecture.md) · [02 Getting started](docs/02-Getting-Started.md) · [03 API reference](docs/03-API.md) · [04 Security](docs/04-Security.md) · [05 Operations](docs/05-Operations.md) ? [06 Contact email](docs/06-Contact-Email.md)
