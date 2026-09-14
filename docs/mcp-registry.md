# Publishing Hunch to the official MCP registry

The manifest lives at the repo root: `server.json` (name
`io.github.davesheffer/hunch`). `package.json` carries the matching `mcpName`
field, which is how the registry proves npm-package ownership — it reads the
field from the **published** npm tarball, so a registry publish only validates
against a version that is already live on npm. `test/mcp-registry.test.ts`
pins `server.json` to `package.json` so a release bump cannot leave the
listing pointing at an old version.

## One-time + per-release steps (maintainer)

```bash
# one-time: install the publisher CLI
brew install mcp-publisher        # or: go install github.com/modelcontextprotocol/registry/cmd/mcp-publisher@latest

# per release, AFTER the npm release is live (the registry validates against npm):
mcp-publisher login github        # opens a device-code flow; io.github.davesheffer/* needs your GitHub auth
mcp-publisher publish             # reads ./server.json, validates, publishes
```

Verify the listing:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.davesheffer/hunch" | head
```

## Release-flow note

`server.json` carries the release version in two places (top-level and the npm
package entry). The version-bump step of a release must update both — the test
suite fails if they drift from `package.json`. Publishing to the registry is
idempotent per version; re-running after a failed attempt is safe.
