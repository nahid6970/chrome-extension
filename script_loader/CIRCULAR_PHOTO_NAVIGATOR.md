# Circular Photo Navigator — Project Notes

## Purpose

This note explains the Bangladesh Police job circular page and the extension UI added to navigate its circular photos. It is intended to help a future developer or coding agent make changes without needing to rediscover the page structure.

## Project and page

This repository is a Manifest V3 Chrome extension. The popup automatically discovers JavaScript files in `user_scripts/` and presents each as a separately toggleable script. `background.js` injects enabled scripts into completed tabs. A new script in `user_scripts/` normally needs no popup, manifest, or background changes.

The page used while developing this feature was:

`https://bdgovtjob.net/bangladesh-police-job-circular/`

It is a WordPress article containing the job circular details and a long article body. Before this extension UI was added, the page had its own “সার্কুলারের ছবি” jump link to the first circular image. The page already included multiple circulars, and a circular could have several image pages.

## Original page structure observed

- Circular photos use IDs such as `job-circular-image-1`, `job-circular-image-2`, and so on. They also commonly have the `bdg-zoomable` class.
- Circular titles appear as `h2`, `h3`, or `h4` headings in the article body. Titles may be in Bengali or English.
- A circular’s photos can share one heading even when the images are in separate paragraphs or wrappers. Some images are inside `figure.jc-media-figure-styled`; others are regular images within paragraphs.
- The DOM wrappers are not a reliable way to identify a circular group. Use the nearest preceding circular heading to group photos. The script falls back to a normalized image filename when no matching heading is found.
- On the page as inspected, there were 13 photos across six circular headings: DMP (3), Lalmonirhat (2), Sherpur (2), Dinajpur (2), CID (3), and Police Constable (1). Page content can change, so treat these numbers as an example, not configuration.

## Extension UI added

Implementation is in [`user_scripts/circular_photo_navigator.js`](user_scripts/circular_photo_navigator.js).

The script:

1. Runs only on `bdgovtjob.net` and its subdomains.
2. Finds circular images using `img[id^="job-circular-image-"]` and `img.bdg-zoomable`.
3. Groups each photo under the nearest preceding matching circular heading. Matching supports Bengali recruitment-notice terms and English job/circular terms. A filename-based key is used as a fallback.
4. Adds a fixed, always-visible list at the right center of the page. Each row uses the circular heading as its name. Clicking a row scrolls smoothly to that circular’s first image.
5. Highlights the circular whose photo is nearest the viewport center as the reader scrolls.
6. Watches for page changes so dynamically inserted or removed photos can update the list.
7. Lets the user right-click a circular name to open a compact, horizontal, icon-only menu: a green check means **Can apply** and a red cross means **Cannot apply**. Tooltips and accessible labels explain both choices. The cannot-apply row is muted red and strikes through the circular name. Until the user chooses, the row keeps its original neutral appearance. Selected statuses are stored in `chrome.storage.local` under `circularApplyStatuses` and follow a circular identity derived from its normalized title and first image filename.

Status changes are local immediately. They are included in the existing full-storage Convex backup when the user clicks **Backup**; they do not sync automatically. Locally, statuses are keyed by circular identity. For Convex, `popup.js` serializes the map as an array of `[identity, status]` pairs because Convex object field names must be ASCII and identities may include Bengali characters. **Restore** converts the pairs back to the local map, and the open page reflects the restored values.

## Convex Capacity Note

The existing manual backup stores the entire extension snapshot, including circular statuses, as one record in the shared Convex `backups` database table. It does not use Convex File Storage. Convex values and documents must be smaller than 1 MiB, so the current design cannot store millions of statuses in one backup record. At a rough 150–250 bytes per status identity/value pair, one million entries would be around 150–250 MB before other extension settings and storage overhead. See [Convex data type limits](https://docs.convex.dev/database/types).

Convex File Storage has no per-file size limit, but its deployment storage quota applies and upload requests have a two-minute timeout. See [Convex limits](https://docs.convex.dev/production/state/limits) and [file upload limits](https://docs.convex.dev/file-storage/upload-files). If status collections ever grow to that scale, redesign backup storage as chunked records or a deliberately managed File Storage snapshot; the current one-document save/restore flow will not scale to it.

The UI is attached inside a Shadow DOM so styles from the webpage do not interfere. The navigation panel and context menu use black surfaces; only status-marked rows use green or muted red. The host has the stable ID `__circular-photo-navigator__`; the navigation panel uses `#circular-photo-controls`; generated circular links use IDs like `#circular-jump-1` and `data-testid="circular-jump"`. The status menu uses `#circular-status-menu`, `#status-can-apply`, and `#status-cannot-apply`.

The extension adds an overlay to the page; it does not change the website’s source or stored content.

## Working on this feature

- Edit `user_scripts/circular_photo_navigator.js` for grouping, labels, behavior, or styling.
- Keep grouping based on circular headings rather than assuming each image is one circular or that all related images share a single wrapper.
- Preserve the domain guard so this page-specific UI does not appear on unrelated sites.
- Keep the active list item synchronized with the photo nearest the center of the viewport.
- After changing the script, reload the unpacked extension and refresh the page. The content script uses an in-page guard, so refreshing the tab is needed to replace an already injected copy.
- No automated tests were run for the current implementation.
