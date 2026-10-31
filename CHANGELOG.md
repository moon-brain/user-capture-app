# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.25.0](https://github.com/moon-brain/user-capture-app/compare/v1.24.1...v1.25.0) (2026-10-31)

### Features

* notice a more recent school XML published by another team ([657fff6](https://github.com/moon-brain/user-capture-app/commit/657fff63c7ba3828882f4ac8ca14b26221fab896))
* share the applied school XML through the repository's Centro folder ([af8b460](https://github.com/moon-brain/user-capture-app/commit/af8b460e28cb53f6a10a03b98c08220a53ff8875))

### Bug Fixes

* always remove the temporary folder of the ZIP image export ([89d33c8](https://github.com/moon-brain/user-capture-app/commit/89d33c8c90b765209fc14ffba4e26f53694c288b))
* decode numeric character references in the school XML ([a491c4e](https://github.com/moon-brain/user-capture-app/commit/a491c4e3b3522af01fb0ce533747aaf66bd9cd16))
* **deps:** bump fast-xml-parser from 4.5.7 to 5.11.2 ([6576d88](https://github.com/moon-brain/user-capture-app/commit/6576d88ce3fa88249d8783ad56347a353e474476))
* **deps:** store projects with node:sqlite instead of the archived sqlite3 ([c9a6222](https://github.com/moon-brain/user-capture-app/commit/c9a622269ecf8c35a7ac85bd740a56c67c7ebe66))
* **deps:** update pdfkit to 0.20.2 ([10e32fd](https://github.com/moon-brain/user-capture-app/commit/10e32fde05493d8363933779b72a92a42912eef5))
* **deps:** update sharp to 0.35.5 for the libvips security fixes ([30d7406](https://github.com/moon-brain/user-capture-app/commit/30d7406b8ff415ca4f79cbe6e51321ffa6cc9c92))
* report PDF exports to a missing folder instead of hanging ([6f658fc](https://github.com/moon-brain/user-capture-app/commit/6f658fc065cbc95986769d09ad3cfc41c8e56731))

## [1.24.1](https://github.com/moon-brain/user-capture-app/compare/v1.24.0...v1.24.1) (2026-10-09)

### Bug Fixes

* point updates and release links at the moved repository ([c1a81fe](https://github.com/moon-brain/user-capture-app/commit/c1a81fe9e56d4da03a9d576fcd63a6494b6ff251))
## [1.24.0](https://github.com/moon-brain/user-capture-app/compare/v1.23.0...v1.24.0) (2026-10-09)

### Features

* request cards and publication when exporting photos to the repository ([c6501fa](https://github.com/moon-brain/user-capture-app/commit/c6501fa57d5940cfec14413237d4162730fa3c17))

### Bug Fixes

* keep the progress bar from shrinking while an operation advances ([5a99e4d](https://github.com/moon-brain/user-capture-app/commit/5a99e4d963321f072a2b4d0c7903328823ccf6a2))
* show repository photos when filtering by card or publication requests ([0d28bdf](https://github.com/moon-brain/user-capture-app/commit/0d28bdf84aff70348368c0415bba05483f96d2c3))
## [1.23.0](https://github.com/vicpiri/user-capture-app/compare/v1.22.1...v1.23.0) (2026-10-05)

### Features

* stamp exported PDF file names with the generation time ([07babdb](https://github.com/vicpiri/user-capture-app/commit/07babdb7c9b910a9de28eb0b64e708fa29c9d7cb))
## [1.22.1](https://github.com/vicpiri/user-capture-app/compare/v1.22.0...v1.22.1) (2026-10-02)

### Bug Fixes

* answer the export scope dialog with Enter and keep keys away from controls behind dialogs ([dc9fce8](https://github.com/vicpiri/user-capture-app/commit/dc9fce8cc46b42e8ea4f424c5403e02db4aabf9f))
## [1.22.0](https://github.com/vicpiri/user-capture-app/compare/v1.21.0...v1.22.0) (2026-10-01)

### Features

* crop captured photos from the viewer, keeping the original to restore it ([e08b5e3](https://github.com/vicpiri/user-capture-app/commit/e08b5e3735514f47e9487c6bbbc79e4567fe0be2))
* open the group filter on the chosen group and step through groups with the wheel or Alt+arrows ([354c3c0](https://github.com/vicpiri/user-capture-app/commit/354c3c0b82dd280c76d89c792533e5875aa88e85))
* set the default resize options of the photo exports in Preferences ([500bbc1](https://github.com/vicpiri/user-capture-app/commit/500bbc1b4f03d6c8536dbbb2ce7a1a05416a8a59))
## [1.21.0](https://github.com/vicpiri/user-capture-app/compare/v1.20.0...v1.21.0) (2026-09-30)

### Features

* request a card or publication for a single user from the row menu ([dc6bc9d](https://github.com/vicpiri/user-capture-app/commit/dc6bc9dd3acd7f9df4c97a0fb3b15dd6a010ab53))
## [1.20.0](https://github.com/vicpiri/user-capture-app/compare/v1.19.0...v1.20.0) (2026-09-30)

### Features

* lock the group filter while searching and rename the coverage PDF export ([07a0f85](https://github.com/vicpiri/user-capture-app/commit/07a0f8557f5db5efe9ed0a020de63ff747e56f2f))
* sort the user list by the date the photo was linked ([aee25c8](https://github.com/vicpiri/user-capture-app/commit/aee25c841202e67843933c09dc4b6ee97a92e315))
## [1.19.0](https://github.com/vicpiri/user-capture-app/compare/v1.18.0...v1.19.0) (2026-09-25)

### Features

* add an Orla menu and a preference to turn the graduation orla service off ([eaa640e](https://github.com/vicpiri/user-capture-app/commit/eaa640e65f1fac05fa76602346584d022e890b43))
* rename Archivo > Exportar > Orlas en PDF to "Listado en PDF con fotografías por grupo", with files named `Listado_fotos_{grupo}.pdf`, and group the Exportar menu; the paid users lists move to the Orla menu ([0db63b1](https://github.com/vicpiri/user-capture-app/commit/0db63b1))

### Bug Fixes

* keep A4 size on every page of the orla PDF ([636ca3a](https://github.com/vicpiri/user-capture-app/commit/636ca3a7baf223b6da51268014be3d1bca3d7b5e))
## [1.18.0](https://github.com/vicpiri/user-capture-app/compare/v1.17.0...v1.18.0) (2026-09-23)

### Features

* export PDF reports of users without a photo and photos by group ([f04dc32](https://github.com/vicpiri/user-capture-app/commit/f04dc32e36a347abffb919fadab2adb797845e34))
## [1.17.0](https://github.com/vicpiri/user-capture-app/compare/v1.16.0...v1.17.0) (2026-09-22)

### Features

* show repository photo coverage in the photos by group window ([66c2407](https://github.com/vicpiri/user-capture-app/commit/66c2407cf16945ac115e9b0b119a142928364de5))
## [1.16.0](https://github.com/vicpiri/user-capture-app/compare/v1.15.0...v1.16.0) (2026-09-22)

### Features

* mark linked and shared photos in the capture history strip ([35e6118](https://github.com/vicpiri/user-capture-app/commit/35e611845ac20d5066fa1315805973f8ca63e890))

### Bug Fixes

* sort people alphabetically ignoring accents, case and punctuation ([a189b93](https://github.com/vicpiri/user-capture-app/commit/a189b93e16279aa9129b9c4ead7324df3eca9d4f))
## [1.15.0](https://github.com/vicpiri/user-capture-app/compare/v1.14.0...v1.15.0) (2026-09-22)

### Features

* add photos by group window with a coverage heat map ([87a0cb9](https://github.com/vicpiri/user-capture-app/commit/87a0cb9271aa79dd9e2a5795d08ce1523a090767))
## [1.14.0](https://github.com/vicpiri/user-capture-app/compare/v1.13.0...v1.14.0) (2026-09-21)

### Features

* review and archive pending card and publication requests ([2fbdfe8](https://github.com/vicpiri/user-capture-app/commit/2fbdfe8505303d1d398807b5b68a4f61548c27b5))
* tell apart card and publication requests the project cannot act on ([ec88091](https://github.com/vicpiri/user-capture-app/commit/ec8809169271393205b1e9a5dfa271992270dec6))

### Bug Fixes

* keep the open project after reloading the window ([854447a](https://github.com/vicpiri/user-capture-app/commit/854447aae7dd7efbc4dd2ff3cf22d5686aeb30fc))
* reject an XML with no users even when its root has attributes ([9d4e841](https://github.com/vicpiri/user-capture-app/commit/9d4e841c1e73dbe84a18c33c7b10660be23271d7))
## [1.13.0](https://github.com/vicpiri/user-capture-app/compare/v1.12.0...v1.13.0) (2026-09-18)

### Features

* mirror the photo viewer in a separate window ([ced65db](https://github.com/vicpiri/user-capture-app/commit/ced65db30b8862701fd5c8becee1368461a9b178))
## [1.12.0](https://github.com/vicpiri/user-capture-app/compare/v1.11.0...v1.12.0) (2026-09-16)

### Features

* ask which users an export covers ([5b21ed9](https://github.com/vicpiri/user-capture-app/commit/5b21ed9bd95b0f5577cdb9e7bc81daec71631e4c))
* cut the project log when it reaches 5 MB ([44059cd](https://github.com/vicpiri/user-capture-app/commit/44059cd5f79a71dc86315090b6fe0fd1918ff7e9))
* keep the thumbnail cache from growing without end ([7b93ced](https://github.com/vicpiri/user-capture-app/commit/7b93ced30f616f9e3c4f0a6c2758142b4090bd49))
* purge the replaced photos kept in the repository ([ef8a4f6](https://github.com/vicpiri/user-capture-app/commit/ef8a4f632e7d02e2336e99ba17c7f02b80a403e1))
* turn photos that arrive without the orientation tag ([cd500af](https://github.com/vicpiri/user-capture-app/commit/cd500afa0269588752ed3918add4e6a5b607cc67))

### Bug Fixes

* export what the list is showing, not the whole group ([b80c611](https://github.com/vicpiri/user-capture-app/commit/b80c611fd37b6a6b9a6ce9c0d55d4e6f8dcd344d))
* print sharp receipts faster with the Windows text engine ([6118eeb](https://github.com/vicpiri/user-capture-app/commit/6118eebb7e9351dc73cea7194a2403e394d6d66c))
## [1.11.0](https://github.com/vicpiri/user-capture-app/compare/v1.10.1...v1.11.0) (2026-09-15)

### Features

* add a thumbnail view of the users to the main window ([6fd3761](https://github.com/vicpiri/user-capture-app/commit/6fd3761b70564e458bf8c68574be747de76c4488))
* add workspaces to the Ver menu ([71cb1ac](https://github.com/vicpiri/user-capture-app/commit/71cb1acec56b2656c1e51459670903eae762198b))
## [1.10.1](https://github.com/vicpiri/user-capture-app/compare/v1.10.0...v1.10.1) (2026-09-15)

### Bug Fixes

* show every notice and question in the app's own dialogs ([26a2dad](https://github.com/vicpiri/user-capture-app/commit/26a2dad53c48bcd7e142ca5c1f2f873fd9593bc7))
## [1.10.0](https://github.com/vicpiri/user-capture-app/compare/v1.9.0...v1.10.0) (2026-09-15)

### Features

* close dialogs with Escape and keep the arrow keys after messages ([be8af68](https://github.com/vicpiri/user-capture-app/commit/be8af680e4d82db34144028ded81e286e537eb0c))
* download and install updates from inside the app ([cea773f](https://github.com/vicpiri/user-capture-app/commit/cea773fffb007ad9a8eb1ab486808d8071a00f45))
* export repository images named by ID ([c9b3bcf](https://github.com/vicpiri/user-capture-app/commit/c9b3bcfa9e233094b73621d0972c0044156b2efd))
* open export dialogs at the last export folder ([4825918](https://github.com/vicpiri/user-capture-app/commit/4825918bb112a694232055e4f5e5f8d268593fd9))

### Bug Fixes

* allow a receipt price of 0 and report receipts that fail to print ([f60fe11](https://github.com/vicpiri/user-capture-app/commit/f60fe11da27c6ac606e56c3379522c8e9963cf93))
* answer an update check asked for mid-check, and let the automatic one be turned off ([ae4217c](https://github.com/vicpiri/user-capture-app/commit/ae4217c714e4ecdbfa2c903322d68518f98213f2))
* close the open project when creating a new one ([f9b6d5b](https://github.com/vicpiri/user-capture-app/commit/f9b6d5b01591282887c12fd72e7d55b3b2be1940))
* correct misleading texts and drop an unreachable report section ([6b384b4](https://github.com/vicpiri/user-capture-app/commit/6b384b4813bef38dda0f87c63bcf4b53129d689f))
* count repository replacements from the repository itself ([7acc953](https://github.com/vicpiri/user-capture-app/commit/7acc9536d9ee64124f728f4773fb5448b0f791fc))
* date printed cards when they are printed and label non-teaching staff ([67539a7](https://github.com/vicpiri/user-capture-app/commit/67539a7f551ddff3b8ab1dce96ad82181855f9c3))
* ignore arrow keys while any dialog is open ([45a51bd](https://github.com/vicpiri/user-capture-app/commit/45a51bd58335e50edb813b17e47d7afb225c147b))
* keep captured photo paths when their thumbnails are hidden ([b22148c](https://github.com/vicpiri/user-capture-app/commit/b22148ca0810310c538c3117ea3454e2b192c6d0))
* keep leading zeros in NIA and document numbers from the XML ([ae4ae37](https://github.com/vicpiri/user-capture-app/commit/ae4ae373f43b0fa6a8e8bbade0b10f99748a70df))
* keep the Ver options when saving preferences ([7e72c3c](https://github.com/vicpiri/user-capture-app/commit/7e72c3c33b867bbd2cc28d9616b27ac13052c28e))
* never export the whole project when there is nobody to export ([fa1712a](https://github.com/vicpiri/user-capture-app/commit/fa1712a8441ba006bc326a4e4744f99ba1a7ec63))
* record the new XML only once its update is applied ([093ea43](https://github.com/vicpiri/user-capture-app/commit/093ea435a1dd400fdf8f9d5db5248902dc2a0138))
* refuse to create a project over an existing one ([02e8ecd](https://github.com/vicpiri/user-capture-app/commit/02e8ecdb61c746596133530761770983aca75c00))
* remember the card and publication request filters ([7973c17](https://github.com/vicpiri/user-capture-app/commit/7973c175845b43a923a59768d9bbc90e7026f681))
* report photos that are not imported and keep the camera menu in sync ([ddbcdb6](https://github.com/vicpiri/user-capture-app/commit/ddbcdb613b5be83f3c5d2bdcea0384697846bc35))
* search users by document, ignoring case and accents, and hide the right column ([9099c6b](https://github.com/vicpiri/user-capture-app/commit/9099c6bad72c276159c104813f031bf5bb7cdbb6))
* show project creation errors inside the new project modal ([ca21176](https://github.com/vicpiri/user-capture-app/commit/ca21176bdad05a0c15d53e75b8226c4e3e446c70))
* start the repository copy when a refresh is asked for ([5ad0212](https://github.com/vicpiri/user-capture-app/commit/5ad021277e67711e7c609484c300d47550801878))
* summarise captured image exports and refresh the captured images grid ([18f1248](https://github.com/vicpiri/user-capture-app/commit/18f1248cae83b3788de7c4a0507f83ceae51b176))
* warn that linking a shared photo replaces the user's own ([0c759bb](https://github.com/vicpiri/user-capture-app/commit/0c759bb0aec5cf71d75d9cc32df2a463142c2ff7))
## [1.9.0](https://github.com/vicpiri/user-capture-app/compare/v1.8.0...v1.9.0) (2026-09-14)

### Features

* add an in-app user manual ([b3b00b9](https://github.com/vicpiri/user-capture-app/commit/b3b00b98822f3730f9e2b63c8b11f9d845575b36))

### Bug Fixes

* write the full group name in the ID card CSV ([1b6ba38](https://github.com/vicpiri/user-capture-app/commit/1b6ba38d9ad4c3a381447505504caa36b0c7fbe3))
## [1.8.0](https://github.com/vicpiri/user-capture-app/compare/v1.7.3...v1.8.0) (2026-09-13)

### Features

* allow redirecting a project's ingest folder ([660c826](https://github.com/vicpiri/user-capture-app/commit/660c8269fb8be9cee33bd2b173707f93fbad1cff))

### Performance Improvements

* update only the affected rows when linking or unlinking a photo ([a60f302](https://github.com/vicpiri/user-capture-app/commit/a60f302a494d5394cb1cb80b63b3706ff33b62c0))
## [1.7.3](https://github.com/vicpiri/user-capture-app/compare/v1.7.2...v1.7.3) (2026-09-13)

### Bug Fixes

* show the release notes as text instead of raw html ([a6d7019](https://github.com/vicpiri/user-capture-app/commit/a6d7019d6408065219fbcaabe66d26d88217ccdc))
## [1.7.2](https://github.com/vicpiri/user-capture-app/compare/v1.7.1...v1.7.2) (2026-09-13)

### Bug Fixes

* give up on an update check that never answers ([d68e687](https://github.com/vicpiri/user-capture-app/commit/d68e6879d16f2546e171f4a54d1e55a4fe6911ab))
## [1.7.1](https://github.com/vicpiri/user-capture-app/compare/v1.7.0...v1.7.1) (2026-09-13)

### Bug Fixes

* open the window even if the update checker cannot be set up ([24751c0](https://github.com/vicpiri/user-capture-app/commit/24751c022a79393979280380b25a047a2b2f5e81))
## [1.7.0](https://github.com/vicpiri/user-capture-app/compare/v1.6.0...v1.7.0) (2026-09-13)

### Features

* add a capture history strip beside the main viewer ([09f1d0d](https://github.com/vicpiri/user-capture-app/commit/09f1d0d3e11442e603d45a8ad9c8cf1dc973b3b2))
* add a project information modal ([c1766d3](https://github.com/vicpiri/user-capture-app/commit/c1766d38f618164dab1a850cdf0ddd95ec6bc17c))
* keep the photos a repository export replaces ([5165497](https://github.com/vicpiri/user-capture-app/commit/5165497fc9eff499f2e9d85709314fe8b664e8b9))
* show the capture date and time in the history strip ([baaa93e](https://github.com/vicpiri/user-capture-app/commit/baaa93ef1fc28065973a526ef0b6ac1c6d242f1e))
* show what is about to be exported in the export options dialog ([f56bccb](https://github.com/vicpiri/user-capture-app/commit/f56bccb0eac8a1c903c58ae280848cc21e54dd3c))
* summarise the scope in the remaining image export dialogs ([f60016b](https://github.com/vicpiri/user-capture-app/commit/f60016bac41d7b33cfa4eed80e0fa2afb85ce957))
* tell the export dialog how many photos it will replace ([4221bd2](https://github.com/vicpiri/user-capture-app/commit/4221bd288f57ba66b518dfc411187df3fcbe5ae8))
* tell the user when a newer version is published on GitHub ([e7db7d2](https://github.com/vicpiri/user-capture-app/commit/e7db7d240b6655fb4a4a2dc19bcb5601bf90c3c4))
* write exported images atomically and make the original copy a real copy ([9e2aff1](https://github.com/vicpiri/user-capture-app/commit/9e2aff1b591febf6f44a8685b13972d40b92b76b))

### Bug Fixes

* close secondary windows when the main window closes ([77e6858](https://github.com/vicpiri/user-capture-app/commit/77e68580f59e3a0ff1512681c70dcf73280d6987))
* keep repository photos when changing group in repository grid ([9d14e88](https://github.com/vicpiri/user-capture-app/commit/9d14e88521bdfc5837ee32308748f20d264deb4c))
* make the capture history strip scrollable ([c98cdaf](https://github.com/vicpiri/user-capture-app/commit/c98cdafd2b88f46367367fd0cad1c6daff494c98))
* release project resources before opening another project ([09ac239](https://github.com/vicpiri/user-capture-app/commit/09ac23901cc824fdc78264031011e54daba60a44))
* replace the renderer APIs removed by Electron 32 and 36 ([1c74717](https://github.com/vicpiri/user-capture-app/commit/1c74717f482e88443e106771b6db56742c14264c))
* repository photos never appearing, and arrow keys restarting every image ([b8a64fa](https://github.com/vicpiri/user-capture-app/commit/b8a64fa7aab416edd5e01a6c995cd25aa35a4e7c))
* restore repository watcher change detection ([7808e77](https://github.com/vicpiri/user-capture-app/commit/7808e77a484d2c350dca11ae209dacee688c33b7))
* unlink only the exported users after exporting to the repository ([5d260ad](https://github.com/vicpiri/user-capture-app/commit/5d260add95e6602280f475b41cd830ebb5e46aa8))

### Performance Improvements

* batch database writes and index the columns actually queried ([701ca44](https://github.com/vicpiri/user-capture-app/commit/701ca4425307fbb3a628e61aa85aea17d85c76d6))
* cut repository mirror polling cost ([22ef229](https://github.com/vicpiri/user-capture-app/commit/22ef229048faaa9dc1d843f8089f35444009028e))
* cut the cost of interacting with the user list ([d318d2a](https://github.com/vicpiri/user-capture-app/commit/d318d2aaa84e18d7b2dc24ba6198b1a5f0ce57b7))
* make virtual scrolling measure and render per frame ([5ee345a](https://github.com/vicpiri/user-capture-app/commit/5ee345a92c73795f64bc51b3ab54ef6a74da069c))
* only request photos for rows that stay on screen ([2c1db4d](https://github.com/vicpiri/user-capture-app/commit/2c1db4dac865d4e46bb2d6b80cdb4a0750554105))
* reduce redundant user reloads and image decoding in user list ([97694c2](https://github.com/vicpiri/user-capture-app/commit/97694c2661ddc6135d3d28e094d41a1bf40a07ec))
* serve user photos as cached thumbnails over a custom protocol ([49e6a02](https://github.com/vicpiri/user-capture-app/commit/49e6a029cc8037282cf1d95cfc3b59b66f7157b0))
* stop blocking the main process on logging and startup work ([2c5cf52](https://github.com/vicpiri/user-capture-app/commit/2c5cf52e72d913529ca04c966b8751e5c774b00d))
* stop exports blocking the main process ([e86f371](https://github.com/vicpiri/user-capture-app/commit/e86f3715ed91da77bc02b8fba2986a7c5049f2e1))
* stop the repository watcher from starving the thumbnail pipeline ([ddcf3b1](https://github.com/vicpiri/user-capture-app/commit/ddcf3b1c8c0a306687a852abd95e01d1be42a647))
## [1.6.0](https://github.com/vicpiri/user-capture-app/compare/v1.5.0...v1.6.0) (2025-11-05)


### Features

* add 'coming soon' notification for documentation menu ([0fb1040](https://github.com/vicpiri/user-capture-app/commit/0fb104079600b0ed8e3ae0c8d29781ad81b9459b))
* add backup and restore system for captured image links ([44aabd2](https://github.com/vicpiri/user-capture-app/commit/44aabd21cb5ef81dfd6d6b53c030c48a0c86a498))
* add configurable thermal receipt printing system ([2698600](https://github.com/vicpiri/user-capture-app/commit/2698600e650991cc2ca3bef7f287dbb21b21b8d8))
* add global preferences modal with institution settings ([627ac34](https://github.com/vicpiri/user-capture-app/commit/627ac34bf18a8cfc6dcfa29e2071bab4d2478a35))
* add institution logo to PDF exports ([4eb1064](https://github.com/vicpiri/user-capture-app/commit/4eb10642268032a0b05787947f7b3f62519fbb07))
* add linked photos counter to status bar ([1e7319a](https://github.com/vicpiri/user-capture-app/commit/1e7319a09c1b3275670956ccd24c2129817f97b2))
* add test receipt printing button to printer configuration ([534f25d](https://github.com/vicpiri/user-capture-app/commit/534f25d65bd6d29785678144feeb95212aebaf9d))
* add visual active state to filter badges ([cc2a972](https://github.com/vicpiri/user-capture-app/commit/cc2a972e999426b4f6c6b19737fd86d7104a9a65))
* card print and publication filters now ignore group filter ([d3d196e](https://github.com/vicpiri/user-capture-app/commit/d3d196e58316b0031c4466b67944688990fa35ab))
* improve About modal with modern design and accurate information ([6fde2f6](https://github.com/vicpiri/user-capture-app/commit/6fde2f62e5a29b40b7af5ef56275333abf97fa6b))
* improve inventory export modal UI/UX design ([4666f43](https://github.com/vicpiri/user-capture-app/commit/4666f43dd97d37d80ec3c49dda6ecafe5ff4ac09))
* improve orla export modal UI/UX design ([c93303d](https://github.com/vicpiri/user-capture-app/commit/c93303dca225124fdbd5a1a38454590df4205503))
* improve orla PDF layout with consistent 6x6 grid and group selection ([28c0a8f](https://github.com/vicpiri/user-capture-app/commit/28c0a8f6916e6c09db372b13387a96d52b847dc8))
* improve printer and receipt configuration modal UI styles ([cc08c92](https://github.com/vicpiri/user-capture-app/commit/cc08c921b2a3165614e34e64d5ee375051a6d3b6))
* link orla paid and receipt printed indicators to additional actions visibility ([6eeb84a](https://github.com/vicpiri/user-capture-app/commit/6eeb84a3329bbbca70fff56f16e99fa811928b79))
* rename NIA column to ID and show DNI for teachers/staff ([83938e3](https://github.com/vicpiri/user-capture-app/commit/83938e36d3a1a72b22246ecdf8b2d0eb410ab4cc))
* simplify and clarify export menu labels ([8c2cba3](https://github.com/vicpiri/user-capture-app/commit/8c2cba385ad49dd5a610c6eb2560579b42469c76))


### Bug Fixes

* add !important to no-project-placeholder display property ([560b667](https://github.com/vicpiri/user-capture-app/commit/560b667c324e776f25bd0e27986385e0700f77bf))
* adjust receipt layout to prevent right-side displacement ([90f5979](https://github.com/vicpiri/user-capture-app/commit/90f59798a66ee8cf6541a20e2e9a871e6fbe2e36))
* apply showAdditionalActions preference on initial load ([390bb26](https://github.com/vicpiri/user-capture-app/commit/390bb26ddf333611778e045b6981e0541fb9c389))
* correctly display group name in receipt printing ([c3503ae](https://github.com/vicpiri/user-capture-app/commit/c3503ae18f44975f518d782e1a986a300ba6ec9d))
* group filter not refreshing on first 'All groups' selection after opening project ([0121f31](https://github.com/vicpiri/user-capture-app/commit/0121f314f07b727589c3c36cc116df464435c5fb))
* normalize jpeg extension to jpg when exporting to repository ([4ce9490](https://github.com/vicpiri/user-capture-app/commit/4ce9490c09ad362d291f7e2cab8e76e20a029032))
* resolve ExportManager test timeout failures ([e193590](https://github.com/vicpiri/user-capture-app/commit/e1935900f84725f1945c0ab4f0290b3f6f71183c))
* resolve LazyImageManager and BaseModal test failures ([bf063ef](https://github.com/vicpiri/user-capture-app/commit/bf063efdc0ba7847a0dfdda6bc21b1c428263bce))
* resolve new project creation dialog issues ([3b5dc80](https://github.com/vicpiri/user-capture-app/commit/3b5dc801e7d7be896d9a3f78fd2f2a33defad5f6))
* resolve test failures after recent changes ([de268f0](https://github.com/vicpiri/user-capture-app/commit/de268f031ad8d97ffd46e1c502253856b95f0cd0))
* update printed-cards.html to use modular CSS ([da3db45](https://github.com/vicpiri/user-capture-app/commit/da3db45a2e9bfcfd35decdaef0d615f6b9a1622e))

## [1.5.0](https://github.com/vicpiri/user-capture-app/compare/v1.4.0...v1.5.0) (2025-10-30)


### Features

* add automatic printed card marking on CSV export ([9aefe86](https://github.com/vicpiri/user-capture-app/commit/9aefe860a4120f54c41445b0c218f63b7661dad8))
* add context menu options to remove orla paid and receipt printed states ([0cc02a9](https://github.com/vicpiri/user-capture-app/commit/0cc02a926c16e56cc7485cfb7d9ff71753c813c3))
* add orla payment and receipt printing tracking ([9ba9f9c](https://github.com/vicpiri/user-capture-app/commit/9ba9f9cc3dc13e711eb02e4cfa5a815fee1bfb84))
* add paid students list PDF and CSV exports ([365e856](https://github.com/vicpiri/user-capture-app/commit/365e85602c17086d9306a396e4cb82accacf4aa8))
* add paid students list PDF export ([a0e5f19](https://github.com/vicpiri/user-capture-app/commit/a0e5f1962f922f6946880df7d098af0addd89d49))
* add printed cards history window with clear functionality ([155ab99](https://github.com/vicpiri/user-capture-app/commit/155ab99e1340dea721d0c4a60e898d477f7fb0d0))
* add visual alert badges for pending card prints and publications ([7f0f25f](https://github.com/vicpiri/user-capture-app/commit/7f0f25f08f6a5ac1c02049863b79496202afaf03))
* convert duplicates filter to clickable badge with exclusive behavior ([1842699](https://github.com/vicpiri/user-capture-app/commit/184269980caf73d7798c997ca7abf6dc5903c98e))
* hide photos column when all display options are disabled ([d8d6ba3](https://github.com/vicpiri/user-capture-app/commit/d8d6ba3e8ff2df3088ee5f337afee3ca6a48597f))
* implement exclusive filter behavior for view menu options ([39cef81](https://github.com/vicpiri/user-capture-app/commit/39cef818fa65b046ec7809c81b3b56d0f4482cde))

## [1.4.0](https://github.com/vicpiri/user-capture-app/compare/v1.3.1...v1.4.0) (2025-10-29)


### Features

* add View menu filter for pending card print requests ([866945e](https://github.com/vicpiri/user-capture-app/commit/866945ecaf358d93f09302101fdc6442c5b91878))
* implement card print request system with repository validation ([5a73ddc](https://github.com/vicpiri/user-capture-app/commit/5a73ddcebc158a9cf8490d74b292065101f5a559))
* implement official publication request system ([ee47e1f](https://github.com/vicpiri/user-capture-app/commit/ee47e1f7225abcfc6745abe50fd9a0cccb67d7c1)), closes [#8b5cf6](https://github.com/vicpiri/user-capture-app/issues/8b5cf6)


### Bug Fixes

* ensure repository mirror starts after project opens ([c0bc3a9](https://github.com/vicpiri/user-capture-app/commit/c0bc3a9c6ec27c05bc4c42b311f89e964d42305a))
* resolve race condition in repository images loading on app startup ([98d65fc](https://github.com/vicpiri/user-capture-app/commit/98d65fc25845b84b98afdaacbd21474b16455b59))

### [1.3.1](https://github.com/vicpiri/user-capture-app/compare/v1.3.0...v1.3.1) (2025-10-29)

## [1.3.0](https://github.com/vicpiri/user-capture-app/compare/v1.2.1...v1.3.0) (2025-10-29)


### Features

* add close project functionality ([c1e88b9](https://github.com/vicpiri/user-capture-app/commit/c1e88b9407290fd7aac95be9616a54bac1b4c581))
* add loading spinners to lazy-loaded images with minimum visibility duration ([3119552](https://github.com/vicpiri/user-capture-app/commit/3119552661d55d493012732669f6bd95d0ece222)), closes [#4a7cc7](https://github.com/vicpiri/user-capture-app/issues/4a7cc7) [#10b981](https://github.com/vicpiri/user-capture-app/issues/10b981)
* add orla PDF export with configurable image quality ([633d424](https://github.com/vicpiri/user-capture-app/commit/633d424eac7b6fc82e4fa05d3b79373631c22995))
* add status bar with project and repository information ([b2ecb11](https://github.com/vicpiri/user-capture-app/commit/b2ecb116db93fd75da60d31faa1d2762a6ce963b))
* add user count to status bar ([2bf0ce7](https://github.com/vicpiri/user-capture-app/commit/2bf0ce7c0decd1be95b8bcd99709563af1811c72))
* improve lazy image loading with row recycling and loading spinners ([256fa33](https://github.com/vicpiri/user-capture-app/commit/256fa334a04963bd18a85263cb1e095a85c741b0))


### Bug Fixes

* center modals on screen by using CSS flex layout ([a3d2e80](https://github.com/vicpiri/user-capture-app/commit/a3d2e8003339df2674fbd9d5622f25d6b31532bd))
* enable checkboxes in selection mode for virtualized lists ([de6d977](https://github.com/vicpiri/user-capture-app/commit/de6d97790a6e3c4118ca7ec4c2fa1325715b4bab))
* hide no-project placeholder when loading users ([f374ead](https://github.com/vicpiri/user-capture-app/commit/f374ead904336d99492215e708522d2c8dfd398f))
* regenerate import report after XML update ([1f4f553](https://github.com/vicpiri/user-capture-app/commit/1f4f55375180e3c4d7de8744a4ffbd30e183e41a))
* reinitialize repository mirror when changing repository path ([f3aa405](https://github.com/vicpiri/user-capture-app/commit/f3aa405d52849756190e30d27657d60562494c9d))
* resolve empty list when returning to all groups filter ([49e7ef3](https://github.com/vicpiri/user-capture-app/commit/49e7ef392e1ef458d2edee7c563c06cf561e9d15))

### [1.2.1](https://github.com/vicpiri/user-capture-app/compare/v1.2.0...v1.2.1) (2025-10-27)

## [1.2.0](https://github.com/vicpiri/user-capture-app/compare/v1.1.4...v1.2.0) (2025-10-27)


### Features

* add automatic build to release scripts ([e94f9fa](https://github.com/vicpiri/user-capture-app/commit/e94f9fae8cdc85f35dff0eaa2689c5e484a7391b))
* add automatic repository folder watching with chokidar ([a7d3449](https://github.com/vicpiri/user-capture-app/commit/a7d3449e9fbc7509e1f1e9989709aa07cf63d99a))
* add empty state placeholder when no project is open ([dfe7a03](https://github.com/vicpiri/user-capture-app/commit/dfe7a03667827a3878d51002e383c4c1f120f6f4))
* add Enter key support for modal default buttons ([1dc840f](https://github.com/vicpiri/user-capture-app/commit/1dc840f8fe5463db15c361fc4cd9076e0ea1a40f))
* add inventory export with optional image compression in ZIP files ([cef7437](https://github.com/vicpiri/user-capture-app/commit/cef74378f67a78eb8d431473fd0e1a6f492dc1f5))
* add loading spinners for repository indicators ([4644a0e](https://github.com/vicpiri/user-capture-app/commit/4644a0eaca64d8b14806318cbfb6c96ea8435754))
* add local repository mirror to prevent UI blocking on network drives ([06c7c27](https://github.com/vicpiri/user-capture-app/commit/06c7c278b24d1770c72882d13e59ad629a0903fc))
* add repository change detection system with multiple strategies ([f9f60ac](https://github.com/vicpiri/user-capture-app/commit/f9f60ac249bb7f68a80e911d0a39f5232187981d))
* add repository image grid and synchronized group filters ([bb30e27](https://github.com/vicpiri/user-capture-app/commit/bb30e27781b9bae9e4c0b7f4a9908a389b481fd5))
* add spinner and loading styles for repository placeholders ([a1729f5](https://github.com/vicpiri/user-capture-app/commit/a1729f57e540a0e67cdf87bfd07ec26102937b4a))
* display application version in window title ([967e2e5](https://github.com/vicpiri/user-capture-app/commit/967e2e54acb53b126620463be51d64fde9e9485c))
* extract VirtualScrollManager component from renderer ([cf06ecd](https://github.com/vicpiri/user-capture-app/commit/cf06ecdca9e6ac993bee2e8c99661320c90d9178))
* implement phase 1 of renderer refactoring - architecture foundation ([7e7082c](https://github.com/vicpiri/user-capture-app/commit/7e7082cb64738fc5120123090e0719702fb43fea))
* implement phase 2 of renderer refactoring - modal components ([949d613](https://github.com/vicpiri/user-capture-app/commit/949d6136433e26daa96b1ed5b0e61b449f62b32c))
* implement phase 3 of renderer refactoring - modal integration ([e63a031](https://github.com/vicpiri/user-capture-app/commit/e63a0316ad37c87eb5db5e6c7e799bc633b7fb1c))
* persist display preferences across application restarts ([7cb9f69](https://github.com/vicpiri/user-capture-app/commit/7cb9f6920d1d0fab1c8620bebb7d2a7c3c37da1c))
* preserve scroll position when refreshing repository images ([f1665c6](https://github.com/vicpiri/user-capture-app/commit/f1665c605e2927396c0c48f68a6d1cf8da5e7c44))


### Bug Fixes

* add manual repository refresh due to unreliable automatic change detection ([15b3670](https://github.com/vicpiri/user-capture-app/commit/15b36709f17579482eb323b43f147e7ae9704292))
* apply saved group filter when loading project data ([ed35410](https://github.com/vicpiri/user-capture-app/commit/ed354107387b572b00c2a76d2387f23d6c1fb2be))
* change keyboard shortcut for refresh repository images to avoid conflict ([2ec69e5](https://github.com/vicpiri/user-capture-app/commit/2ec69e574a28ce5205730a11bc654d2be1f81df2))
* convert CommonJS modules to browser-compatible format ([706b66c](https://github.com/vicpiri/user-capture-app/commit/706b66cced6e78149457b602e133fce53991efbe))
* correct mock setup order in userService tests ([24a93ca](https://github.com/vicpiri/user-capture-app/commit/24a93cadfc8377f12f6582286600d79fda9e7bdc))
* defer camera detection to prevent UI blocking on startup ([365d064](https://github.com/vicpiri/user-capture-app/commit/365d064e9da0e927a42cc8706161ec12c176e47f))
* ensure progress bars reach 100% and remain visible ([6bac8ca](https://github.com/vicpiri/user-capture-app/commit/6bac8ca4102e8336613bb84593e3b8a0bd264596))
* ensure repository photo spinners are visible when toggling display ([ca51684](https://github.com/vicpiri/user-capture-app/commit/ca5168475dde9b25bf3d16d5616f916cfd2b599d))
* ensure repository photo spinners remain visible during sync ([53b9219](https://github.com/vicpiri/user-capture-app/commit/53b92193b38ef37d74743462f524a017d34b4369))
* initialize repository options when enabled on startup ([414061c](https://github.com/vicpiri/user-capture-app/commit/414061c5f6590e0325defd7738f2c404d305998d))
* load repository data correctly when options are enabled on startup ([c017a52](https://github.com/vicpiri/user-capture-app/commit/c017a5235b1613f2e543d0d90327529cecc20cea))
* prevent no-project-placeholder from blocking UI interactions ([002af7a](https://github.com/vicpiri/user-capture-app/commit/002af7aa6378ed221ceebc07e803f8cb83ee93a8)), closes [#1a1f2](https://github.com/vicpiri/user-capture-app/issues/1a1f2)
* reload user data when enabling thumbnail display ([baf5e34](https://github.com/vicpiri/user-capture-app/commit/baf5e343c4ebdf331b67e5c29200474c5fbda540))
* resolve mainWindow function call error in IPC handlers ([0797504](https://github.com/vicpiri/user-capture-app/commit/07975042bdbfb0b3bc1dabe24a4b0ac980737468))
* resolve process and modal reference errors in browser context ([bb4cfa3](https://github.com/vicpiri/user-capture-app/commit/bb4cfa320e17001291d5243d3e01e7e66ad2d599))
* resolve repository grid spinner issue when sync already completed ([5e9c553](https://github.com/vicpiri/user-capture-app/commit/5e9c5535b97d712da7106e98a2d3663edcdd706b))
* wrap modal files in IIFE to prevent global scope conflicts ([10c0a26](https://github.com/vicpiri/user-capture-app/commit/10c0a262d58597db30c3107db9fd267f05b60ba0))

### [1.1.4](https://github.com/vicpiri/user-capture-app/compare/v1.1.3...v1.1.4) (2025-10-22)


### Bug Fixes

* install Windows SDK via Visual Studio installer ([95c7a21](https://github.com/vicpiri/user-capture-app/commit/95c7a213b1382fb93a9fa0074e45c9555d83d4ac))

### [1.1.3](https://github.com/vicpiri/user-capture-app/compare/v1.1.2...v1.1.3) (2025-10-22)


### Bug Fixes

* install Windows SDK to fix node-gyp compilation ([11ea1bb](https://github.com/vicpiri/user-capture-app/commit/11ea1bb70e4e705fbc9e1d20e9a85856ca4629e0))

### [1.1.2](https://github.com/vicpiri/user-capture-app/compare/v1.1.1...v1.1.2) (2025-10-22)


### Bug Fixes

* configure native module rebuild with explicit Electron settings ([45882b8](https://github.com/vicpiri/user-capture-app/commit/45882b870e07a73d7270fcc804ef8fbdce41d2d3))

### [1.1.1](https://github.com/vicpiri/user-capture-app/compare/v1.1.0...v1.1.1) (2025-10-22)


### Bug Fixes

* improve GitHub Actions Windows build workflow ([c12237e](https://github.com/vicpiri/user-capture-app/commit/c12237e3986d96fa45a2c2139addb1fcac708cff))

## [1.1.0](https://github.com/vicpiri/user-capture-app/compare/v1.0.2...v1.1.0) (2025-10-21)


### Features

* add keyboard shortcut (Ctrl+E) for CSV export ([191078c](https://github.com/vicpiri/user-capture-app/commit/191078c22ebda6219f8f2b13fd4d7544ee978e7d))
* add loading spinner for user list operations ([7a043fa](https://github.com/vicpiri/user-capture-app/commit/7a043fae585bfb0f492aba3be778dea70240e84f))
* add multi-user selection with context menu and export integration ([1053346](https://github.com/vicpiri/user-capture-app/commit/1053346060811b3405145a5caa370727ecbd5698))
* add repository photo indicators menu option ([9000d27](https://github.com/vicpiri/user-capture-app/commit/9000d271938ede888f5b31dd8703673b80148c13))
* add toggle for Additional Actions section visibility ([2980429](https://github.com/vicpiri/user-capture-app/commit/298042919123ddc1bdef2cedd3d7a0e158f82415))
* implement lazy loading for image optimization ([a3935fb](https://github.com/vicpiri/user-capture-app/commit/a3935fbca80b5841de7ceb44b094fd37f592d542))
* implement repository file cache and automatic change detection ([3dfc697](https://github.com/vicpiri/user-capture-app/commit/3dfc69742a7ef81e17c413820e47b37356d73378))
* persist display preferences across application restarts ([67976c3](https://github.com/vicpiri/user-capture-app/commit/67976c32d06dafd88686ad10926f8b5a1b983a5e))


### Bug Fixes

* correct CSV export format to match specification ([df44d6f](https://github.com/vicpiri/user-capture-app/commit/df44d6f6cccd6d5b0a057758f755d2ff5bec5967))
* preserve spacers when clearing user table ([e3b014d](https://github.com/vicpiri/user-capture-app/commit/e3b014d05a17ef310f25888425144225d2fa55b2))
* resolve repository-changed event listener filter bug ([3f0cdd3](https://github.com/vicpiri/user-capture-app/commit/3f0cdd36f8353cbd88351caefbcae211f76d9c1a))
* resolve virtual scrolling not rendering after group filter change ([ea2ce61](https://github.com/vicpiri/user-capture-app/commit/ea2ce61292f9335a7ee8a59b787d36057fdb214f))

### [1.0.2](https://github.com/vicpiri/user-capture-app/compare/v1.0.1...v1.0.2) (2025-10-20)

### 1.0.1 (2025-10-20)
