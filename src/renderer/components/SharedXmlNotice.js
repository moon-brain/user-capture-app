/**
 * Notice of a more recent school XML in the repository
 *
 * Another team may have updated the school XML and published it in the
 * repository's Centro folder (src/main/sharedXml.js). This badge, next to the
 * other alerts above the user list, says so; clicking it opens the usual
 * analysis of changes with that file, and nothing is applied without the
 * confirmation that analysis asks for. A badge rather than a dialog: the
 * person may be in the middle of a photo session.
 *
 * The main process decides what counts as more recent and limits how often
 * Centro is read; this only asks on opening and when the window gets the
 * focus back, and paints the answer.
 *
 * @module components/SharedXmlNotice
 */

(function(global) {
  'use strict';

  /**
   * @param {string} iso
   * @returns {string} e.g. "31/10/2026 18:05", or '' if it is not a date
   */
  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * How a published XML is described, in the badge's tooltip and above the
   * analysis of changes
   * @param {Object} newer - { team, publishedAt }
   * @returns {string}
   */
  function describePublication(newer) {
    const when = formatDateTime(newer.publishedAt);
    return `XML del centro publicado en el depósito por ${newer.team}${when ? ` el ${when}` : ''}.`;
  }

  class SharedXmlNotice {
    /**
     * @param {Object} config
     * @param {HTMLElement|null} config.badge
     * @param {() => boolean} config.getProjectOpen
     * @param {() => Promise<Object>} [config.checkSharedXml]
     * @param {(published: {filePath: string, source: string}) => Promise<void>} config.onUpdate
     */
    constructor(config = {}) {
      this.badge = config.badge || null;
      this.getProjectOpen = config.getProjectOpen || (() => false);
      this.checkSharedXml = config.checkSharedXml
        || (() => window.electronAPI.checkSharedXml());
      this.onUpdate = config.onUpdate || (async () => {});

      this.newer = null;
      this.checking = null;
      this.updating = false;
    }

    init() {
      if (!this.badge) return;
      this.badge.addEventListener('click', () => this.update());
      this.hide();
    }

    /**
     * Ask the main process and show or hide the badge
     *
     * A check already under way is joined rather than repeated: focus and
     * a project load often arrive together.
     *
     * @returns {Promise<Object|null>} the more recent XML, if there is one
     */
    check() {
      if (!this.getProjectOpen()) {
        this.hide();
        return Promise.resolve(null);
      }
      if (this.checking) {
        return this.checking;
      }

      this.checking = (async () => {
        try {
          const result = await this.checkSharedXml();
          // The project may have closed while Centro was being read
          if (!this.getProjectOpen()) {
            this.hide();
            return null;
          }
          if (result && result.success && result.newer) {
            this.show(result.newer);
            return result.newer;
          }
          // A failed check says nothing about Centro: leave the badge as it was
          if (result && result.success) {
            this.hide();
          }
          return this.newer;
        } catch (error) {
          console.error('[SharedXmlNotice] Error checking the shared XML:', error);
          return this.newer;
        } finally {
          this.checking = null;
        }
      })();

      return this.checking;
    }

    /**
     * @param {Object} newer - what check-shared-xml returned
     */
    show(newer) {
      this.newer = newer;
      if (!this.badge) return;
      this.badge.title = `${describePublication(newer)}\nPulsa para ver los cambios que aplicaría.`;
      this.badge.style.display = 'flex';
    }

    hide() {
      this.newer = null;
      if (!this.badge) return;
      this.badge.style.display = 'none';
      this.badge.title = '';
    }

    /**
     * Open the analysis of changes with the published XML
     * @returns {Promise<void>}
     */
    async update() {
      if (!this.newer || this.updating) return;

      const newer = this.newer;
      this.updating = true;
      try {
        await this.onUpdate({ filePath: newer.filePath, source: describePublication(newer) });
      } finally {
        this.updating = false;
      }
    }
  }

  // Export UMD
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SharedXmlNotice, describePublication };
  } else if (typeof window !== 'undefined') {
    global.SharedXmlNotice = SharedXmlNotice;
  }
})(typeof window !== 'undefined' ? window : global);
