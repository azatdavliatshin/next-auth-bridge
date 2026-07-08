# [0.3.0](https://github.com/azatdavliatshin/next-auth-bridge/compare/v0.2.0...v0.3.0) (2026-07-08)


### Bug Fixes

* **08-01:** make cold-start honesty-gate test hermetic ([2de5545](https://github.com/azatdavliatshin/next-auth-bridge/commit/2de5545304b957b5578719a30a7d911427a3537f))
* **08:** build workspace core before next build on Vercel + document host Turso db ([e71143e](https://github.com/azatdavliatshin/next-auth-bridge/commit/e71143e8088d6ffb93a2304b691beb2c3d351688))
* **08:** enable PKCE on the BA Keycloak provider (code_challenge_method=S256) ([b122266](https://github.com/azatdavliatshin/next-auth-bridge/commit/b122266ad033daed5955cead886fa9bf65de69f3))
* **08:** fail fast when TURSO_DATABASE_URL is missing on deploy ([047ab60](https://github.com/azatdavliatshin/next-auth-bridge/commit/047ab606e45e43e9c07a2e59872f88c86449f778))
* **08:** give the BA credential seed a distinct email from the Keycloak realm user ([f88a462](https://github.com/azatdavliatshin/next-auth-bridge/commit/f88a462a43ae532e8ef6eb4079fd341381883a91))
* **08:** stop double-prefixing the BA session cookie (__Secure-__Secure-) ([eef0f80](https://github.com/azatdavliatshin/next-auth-bridge/commit/eef0f80b8539e08412af8b47c498b744677b177a))


### Features

* **07-02:** add env-derived getBetterAuthCookieName helper ([fe0a0c8](https://github.com/azatdavliatshin/next-auth-bridge/commit/fe0a0c8e488dc0fdba2c00675d0bc2ad1bee1b02))
* **08-01:** scaffold ba-tenant-app Better Auth config + DB env-flip + schema ([8815216](https://github.com/azatdavliatshin/next-auth-bridge/commit/881521629739d100567e3a9d193fca7fbb5eb630))
* **08-02:** build ba-host-shell BA app + Better Auth banners on host & tenant ([36e2cf3](https://github.com/azatdavliatshin/next-auth-bridge/commit/36e2cf382d34bade9b4e87897502f1389b0ae729))
* **08-02:** copy ba-tenant-app bridge core verbatim + finalize 4 BA delta files ([0250f86](https://github.com/azatdavliatshin/next-auth-bridge/commit/0250f86a0bc1c637cbb48c3770cbb0befdbc2a49))
* **08-03:** allowlist nab-ba-* origins + BA oauth2 callback in realm export ([1c811cf](https://github.com/azatdavliatshin/next-auth-bridge/commit/1c811cfc551d4f7913a1c344a982b4c985c27476))

# [0.2.0](https://github.com/azatdavliatshin/next-auth-bridge/compare/v0.1.0...v0.2.0) (2026-06-14)


### Features

* **examples:** public Keycloak popup-bridge demo + OIDC release publishing ([#5](https://github.com/azatdavliatshin/next-auth-bridge/issues/5)) ([5ad47b7](https://github.com/azatdavliatshin/next-auth-bridge/commit/5ad47b760edd9e4d657e544b1e47c9756a70bcaa))

# [0.1.0](https://github.com/azatdavliatshin/next-auth-bridge/compare/v0.0.0...v0.1.0) (2026-06-14)


### Bug Fixes

* **ci:** push release commit to protected main via owner PAT (RELEASE_TOKEN) ([#4](https://github.com/azatdavliatshin/next-auth-bridge/issues/4)) ([d765c67](https://github.com/azatdavliatshin/next-auth-bridge/commit/d765c6772af15bc2c33babf60f1e2bc9e0ad712e))
* **ci:** set NODE_AUTH_TOKEN so the release npm auth resolves (401 fix) ([#3](https://github.com/azatdavliatshin/next-auth-bridge/issues/3)) ([f781360](https://github.com/azatdavliatshin/next-auth-bridge/commit/f781360bf7f18ec3de47c8b9d9f854829d4eed6a))
* **core:** add unrun devDependency so tsdown builds on a clean install ([#2](https://github.com/azatdavliatshin/next-auth-bridge/issues/2)) ([fec5dcc](https://github.com/azatdavliatshin/next-auth-bridge/commit/fec5dcc44bfe5c78ce140b5268dad32926c3d3fc))


### Features

* cross-context auth bridge for Next.js / Auth.js (Mode A popup-bridge) ([#1](https://github.com/azatdavliatshin/next-auth-bridge/issues/1)) ([eff8103](https://github.com/azatdavliatshin/next-auth-bridge/commit/eff8103727c344447a1544b3597c95dfcae30ba5))
