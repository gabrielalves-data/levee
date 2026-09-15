'use strict';

// Preloaded (-r) into the capture run's Electron main process by capture.js.
// USERPROFILE redirects os.homedir() (DB, config), but app.getPath('home') —
// used for overlay-bounds.json — comes from the OS profile API and ignores it,
// so point it at the same throwaway home before electron/main.js loads.
const home = process.env.LEVEE_CAPTURE_HOME;
if (!home) throw new Error('capture-home.js: LEVEE_CAPTURE_HOME is not set');
require('electron').app.setPath('home', home);
