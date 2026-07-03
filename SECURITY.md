# Security Policy

## Supported Versions

Archi Online is pre-1.0. Security fixes are made on the main development line.

## Reporting A Vulnerability

If the repository is public, please use GitHub private vulnerability reporting
when available. If private reporting is not enabled, open a minimal issue that
states there is a security concern without publishing exploit details.

Include:

- affected browser and operating system
- whether the issue needs a crafted `.archimate` file, script, or extension
- reproduction steps
- expected and observed behavior

## Extension Trust Boundary

Extensions are trusted browser/profile-local code. Do not install `.archi-ext`
packages or source extensions from untrusted sources. The current extension
system is not an untrusted sandbox.

## Browser-Local Data

Autosave, settings, scripts, extensions, extension packages, and extension
storage are local to the current browser/profile. They are not encrypted by
Archi Online.
