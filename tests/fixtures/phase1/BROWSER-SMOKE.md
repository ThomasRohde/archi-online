# Phase 1 browser smoke record

Date: July 12, 2026
Browser: Playwright Chromium against the Vite development server

Verified with the image-bearing Online fixture:

- document-byte ZIP open and model-tree load with no console warnings or errors;
- specialization palette entry and assigned specialization in Properties;
- Golden View rendering for archive images, expressions, gradients, outlines,
  widths, fonts, icons, groups, notes, references, and standalone images;
- edit, undo, redo, and restoration of the original value;
- version 2 autosave restoration after a full page reload;
- inline compressed byte-share creation and read-only viewer load;
- PNG export dialog and download interaction;
- production version label `v1.3.0`.

Gist transport and cross-model asset-copy behavior are covered by the automated
share and model-transfer suites. The smoke run did not create a real external
Gist merely for certification. The full suite remains the authoritative gate
for those deterministic branches.
