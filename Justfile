set shell := ["bash", "-euo", "pipefail", "-c"]

oc *args:
    #!/usr/bin/env bash
    if [ "{{args}}" != "install" ]; then
      echo "usage: just oc install" >&2
      exit 2
    fi

    repo="{{ justfile_directory() }}"
    export JUST_OC_ROOT="$repo"

    bun install --frozen-lockfile
    bun -e '
      const root = process.env.JUST_OC_ROOT;
      const destination = `${process.env.HOME}/.config/opencode/plugins`;
      const bundles = ["adhd", "ae2e", "agent-archetype-system", "background-tasks", "command-run", "zellij"];
      const loader = (bundle) => [
        `import plugin from ${JSON.stringify(`${root}/plugins/${bundle}/index.ts`)}`,
        "",
        "export default async (context) => {",
        "  const projectLoader = Bun.file(`${context.directory}/.opencode/plugins/" + bundle + ".ts`);",
        "  if (await projectLoader.exists()) return {};",
        "  return plugin(context);",
        "};",
        "",
      ].join("\n");

      await Bun.$`mkdir -p ${destination}`;
      for (const bundle of bundles) {
        await Bun.write(`${destination}/${bundle}.ts`, loader(bundle));
        console.log(`Installed global OpenCode plugin: ${bundle}`);
      }
    '

    echo "Global OpenCode plugins are backed by: $repo"
