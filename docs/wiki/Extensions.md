# Extensions

Extensions add browser-local commands, context-menu actions, and dockable
panels to Archi Online. Official extensions are distributed with this
documentation site as portable `.archi-ext` files, so end users do not need
access to GitHub Releases.

## Official downloads

| Extension | What it does | Download |
| --- | --- | --- |
| **ELK Layout** (`archi-online.elk-layout`) | Applies layered automatic layout to the active view or selected diagram objects, with direction, routing, and spacing controls. | [Download ELK Layout](https://thomasrohde.github.io/archi-online/extensions/elk-layout.archi-ext) |
| **Capability Map** (`archi-online.capability-map`) | Generates, repacks, synchronizes, and heat-maps packed capability views from Composition and Aggregation hierarchies. | [Download Capability Map](https://thomasrohde.github.io/archi-online/extensions/capability-map.archi-ext) |

The stable links always point to the package versions deployed with the current
documentation. For controlled deployment or mirroring, use the
[extension catalog](https://thomasrohde.github.io/archi-online/extensions/catalog.json)
and verify files with the published
[SHA-256 checksums](https://thomasrohde.github.io/archi-online/extensions/checksums.txt).

## Install

1. Download the `.archi-ext` file.
2. Open Archi Online and choose **Views ▾ > Extensions**.
3. Select **Import**, choose the downloaded file, review the trusted-code
   warning, and confirm **Install**.
4. Keep the package enabled. Its commands appear under **Extensions ▾** and in
   the relevant context menus; its dockable panel is available under
   **Views ▾**.

Packages and their settings remain in the current browser profile's IndexedDB.
Importing a newer package with the same official ID replaces the installed
version after confirmation.

::: warning Trusted code
An extension runs inside the Archi Online page with access to the current
model. Install packages only from a source you trust. The catalog and checksums
help corporate administrators verify a mirrored download.
:::

## Moving from the old example packages

The official IDs replace the earlier `examples.elk-layout` and
`examples.capability-map` IDs. Before installing an official package:

1. Open **Views ▾ > Extensions**.
2. Select the matching `examples.*` package and choose **Uninstall**.
3. Import the official package from this page.

The new ID deliberately creates a clean official storage namespace, so layout
preferences from the old example package are not migrated.

## Corporate distribution

The documentation deployment is entirely static. An internal software portal
or web server can mirror these four files without running Archi Online or a
package service:

- `elk-layout.archi-ext`
- `capability-map.archi-ext`
- `catalog.json`
- `checksums.txt`

Keep the filenames unchanged if internal instructions should use stable links.
The package manifest contains the actual extension version.

## Developer examples

The repository also contains four `examples.*` packages for API learning:
Model Audit Dashboard, Selection Workbench, Package Showcase, and Event Log
Console. Build them from source as described in
[[Extension Packages|Extension-Packages]]; they are not presented as official
end-user downloads.

Related pages:

- [[Extension Packages|Extension-Packages]] — package format and source build.
- [[Extension API|Extension-API]] — extension development reference.
