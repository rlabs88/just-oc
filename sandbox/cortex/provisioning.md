# Cortex repository provisioning v1

The Cortex image accepts one caller-resolved repository descriptor. The image
validates and admits that descriptor; it does not resolve profiles, catalogues,
presets, credentials, recovery policy, branches, or pull requests.

```json
{
  "schemaVersion": 1,
  "primaryRepositoryId": "application",
  "repositories": [
    {
      "id": "operations",
      "origin": "https://example.invalid/operations.git",
      "ref": "main"
    },
    {
      "id": "application",
      "origin": "https://example.invalid/application.git",
      "ref": "0123456789abcdef0123456789abcdef01234567"
    }
  ],
  "layout": "repos",
  "profileId": "caller-owned-profile"
}
```

The schema is closed: unknown fields and schema versions fail. Repository IDs
must be unique, path-safe names; `primaryRepositoryId` must name exactly one
listed repository; and the only supported layout is `repos`. Origins must not
contain URL userinfo, query credentials, fragments, control characters, or
option-like prefixes. Refs accept branch, tag, full-ref, and commit-like names
that satisfy Git's ref safety restrictions.

Invoke the image-local primitive as the runtime sandbox user:

```sh
bun /opt/just-oc/sandbox/cortex/provisioning.ts \
  --provisioning-file /run/cortex/provisioning.v1.json \
  --workspace /workspace
```

On success it writes one JSON line to stdout and exits zero:

```json
{
  "primaryDirectory": "/workspace/repos/application",
  "repositoryDirectories": {
    "operations": "/workspace/repos/operations",
    "application": "/workspace/repos/application"
  },
  "profileId": "caller-owned-profile"
}
```

`repositoryDirectories` preserves descriptor order. `profileId`, when present,
is returned unchanged and has no image-local behavior. The entrypoint uses
`primaryDirectory` as the OpenCode working directory.

The caller injects ephemeral Git authentication through the process
environment, such as `GIT_ASKPASS` and its token environment variable. Tokens
must not be placed in the descriptor, origin, command arguments, or durable
files. The provisioner disables interactive prompts and persistent Git
credential helpers, captures Git output, and does not echo origins or Git
diagnostics.

Every repository is prepared under an image-local staging directory. Existing
repositories must be Git worktrees with the exact origin, a clean worktree, and
history that can fast-forward to the requested ref. Missing repositories are
cloned. Only after every staged repository resolves and checks out its exact
requested commit does the provisioner replace the admitted `repos` set. A
pre-publication failure removes staging and leaves the previously admitted set
unchanged. Publication uses same-filesystem directory renames with rollback;
this is the strongest portable image-local transaction available without an
external durable coordinator.

Repeated descriptors are safe. If every requested ref still resolves to the
admitted commit, the existing set is retained; advancing remote refs cause a
new staged set to be admitted. Dirty worktrees, origin mismatches, divergent
history, symlinked repository paths, and unrequested entries in the admitted
set fail closed.
