# Publish and install

For 0.6.0, follow the [package/repository migration checklist](migration-0.6.0.md) first: rename the repository before releasing and configure the new package's trusted publisher. Do not publish the same name/version twice during bootstrap.

This branch prepares an installable package and a release-triggered npm workflow;
it does not assert that npm already hosts the package.

1. Review and merge the PR after the syntax and unit-test CI passes.
2. Confirm ownership/availability of npm package `@matuto-ai/antigravity-psst-connector`.
   For first publication, the maintainer may need npm's initial package creation
   flow. Do not send npm tokens through chat or commit them to GitHub.
3. Configure npm Trusted Publishing for GitHub owner `matuto-ai`, repository
   `antigravity-psst-connector`, workflow `npm-publish.yml`. This is an account
   security configuration performed by the maintainer, not by this code change.
4. Set package version and create a GitHub release whose tag is exactly
   `v<package.json version>` on the reviewed commit (`v0.6.0` for this release).
5. The workflow records the exact commit/tree, builds one tarball and verifies
   its installed bytes. The unit suite runs against the source checkout. The
   workflow then publishes that same verified tarball with provenance; it never
   repacks source before publication.
6. The final read-only registry check must confirm name, version, tarball integrity
   and `latest` match the verified artifact before the workflow reports success.
   A missing or divergent publication fails visibly, without republishing or
   changing tags automatically.

The workflow follows the user's existing release/OIDC pattern, with test and
version gates added. It does not need a long-lived NPM_TOKEN in source or workflow.
An unconfigured trusted publisher fails publishing; it does not silently fall
back to another identity. Git/packed-tarball installation remains available even
before npm setup. Release publication, credential creation, and broker enrollment
are distinct from preparing or merging connector code.

## Minor release 0.6.0

The intended GitHub release tag is `v0.6.0`, matching `package.json`.
Use the existing release-triggered Trusted Publishing workflow and normal npm
`latest` tag; no prerelease workflow or account configuration is changed here.
Review the [changelog](../CHANGELOG.md) before publishing. The native pilot is
opt-in/default-off, and real idle wakeup, native hook overwrite propagation, and
conversation-only close cleanup remain acceptance gates—not production claims.

Create the new tag only on the reviewed, tested merge commit. Existing versions
and tags remain untouched. Verify publication, provenance and the scoped npm
version before recommending installation. A successful merge alone does not
mean npm publication succeeded.
