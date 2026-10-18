// Generates an Ed25519 signing key for product single sign-on.
//   node scripts/generate-sso-key.mjs
// Store the PRIVATE value as a secret:  wrangler secret put SSO_PRIVATE_JWK
// Never commit it. The public key is served at /.well-known/jwks.json.
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const pair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const privateJwk = await subtle.exportKey("jwk", pair.privateKey);

console.log("# SSO_PRIVATE_JWK (secret, paste into `wrangler secret put SSO_PRIVATE_JWK`):");
console.log(JSON.stringify(privateJwk));
console.log("\n# Public key (safe to share, also served by the API):");
console.log(JSON.stringify({ kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x }));
