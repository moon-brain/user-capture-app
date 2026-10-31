/**
 * Project Information Modal
 *
 * Read-only summary of the open project: where its folders are and what it
 * holds. The figures come from the main process in one call, so the modal
 * never counts anything itself.
 *
 * @module components/modals/ProjectInfoModal
 */

(function(global) {
  'use strict';

  // Dependencies: BaseModal (loaded from core in browser, or via require in Node.js)
  let BaseModal;
  if (typeof window !== 'undefined' && window.BaseModal) {
    BaseModal = window.BaseModal;
  } else if (typeof require !== 'undefined') {
    ({ BaseModal } = require('../../core/BaseModal'));
  }

  // Labels for the user types the XML import produces
  const TYPE_LABELS = {
    student: 'Alumnado',
    teacher: 'Docentes',
    non_teaching_staff: 'No docentes'
  };

  const NOT_SET = 'No configurado';

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

  class ProjectInfoModal extends BaseModal {
    constructor(config = {}) {
      super('project-info-modal', {
        defaultButtonSelector: '#project-info-modal-close-btn'
      });

      this.getProjectDetails = config.getProjectDetails
        || (() => window.electronAPI.getProjectDetails());

      // Elements
      this.nameEl = null;
      this.pathsEl = null;
      this.countsEl = null;
      this.errorEl = null;
      this.closeBtn = null;
    }

    /**
     * Initialize the modal
     */
    init() {
      super.init();

      if (!this.modal) return;

      this.nameEl = this.modal.querySelector('#project-info-modal-name');
      this.pathsEl = this.modal.querySelector('#project-info-modal-paths');
      this.countsEl = this.modal.querySelector('#project-info-modal-counts');
      this.errorEl = this.modal.querySelector('#project-info-modal-error');
      this.closeBtn = this.modal.querySelector('#project-info-modal-close-btn');

      this.addEventListener(this.closeBtn, 'click', () => this.close());

      this._log('ProjectInfoModal initialized');
    }

    /**
     * Fetch the details and show them
     * @returns {Promise<boolean>} Whether the details could be read
     */
    async show() {
      if (!this.modal) return false;

      this.render(null);
      this.open();

      return this.refresh();
    }

    /**
     * Read the details again and repaint them, leaving the modal as it is
     * @returns {Promise<boolean>} Whether the details could be read
     */
    async refresh() {
      if (!this.modal) return false;

      let result;
      try {
        result = await this.getProjectDetails();
      } catch (error) {
        this._log(`Error reading project details: ${error.message}`, 'error');
        result = { success: false, error: error.message };
      }

      if (!result || !result.success) {
        this.renderError((result && result.error) || 'No se pudo leer la información del proyecto');
        return false;
      }

      this.render(result.info);
      return true;
    }

    /**
     * Paint the details, or the loading state when given nothing
     * @param {Object|null} info
     */
    render(info) {
      if (!this.modal) return;

      if (this.errorEl) {
        this.errorEl.textContent = '';
        this.errorEl.style.display = 'none';
      }

      if (!info) {
        if (this.nameEl) this.nameEl.textContent = 'Cargando...';
        if (this.pathsEl) this.pathsEl.replaceChildren();
        if (this.countsEl) this.countsEl.replaceChildren();
        return;
      }

      if (this.nameEl) {
        this.nameEl.textContent = info.name || '';
      }

      this.renderRows(this.pathsEl, [
        ['Carpeta del proyecto', info.projectPath],
        ['Archivo XML', info.xmlFilePath],
        this.sharedXmlRow(info),
        this.ingestRow(info),
        ['Imágenes capturadas (imports)', info.importsPath],
        ['Base de datos', info.databasePath],
        ['Depósito de imágenes', info.repositoryPath],
        ['Copia local del depósito', info.mirrorPath]
      ]);

      // Presented in the order of TYPE_LABELS rather than the one the query
      // happened to return, with any unknown type kept at the end
      const byType = info.usersByType || {};
      const knownTypes = Object.keys(TYPE_LABELS).filter((type) => type in byType);
      const otherTypes = Object.keys(byType).filter((type) => !(type in TYPE_LABELS));
      const typeRows = [...knownTypes, ...otherTypes]
        .map((type) => [TYPE_LABELS[type] || type, byType[type]]);

      this.renderRows(this.countsEl, [
        ['Usuarios', info.totalUsers],
        ...typeRows,
        ['Grupos', info.totalGroups],
        ['Fotos enlazadas', info.usersWithImage],
        ['Usuarios sin foto', info.usersWithoutImage],
        ['Imágenes en la carpeta imports', info.capturedImages],
        ['Imágenes con etiquetas', info.taggedImages]
      ]);
    }

    /**
     * Row of the XML shared with the other teams through the repository
     *
     * Projects from before 1.25 never recorded what they applied, so theirs
     * shows as not configured until the next XML update.
     *
     * @param {Object} info
     * @returns {Array}
     * @private
     */
    sharedXmlRow(info) {
      const label = 'XML compartido en el depósito';
      const shared = info.sharedXml;
      const newer = info.newerSharedXml;
      const newerNote = newer ? {
        text: `Hay uno más reciente, publicado${newer.publishedAt ? ` el ${formatDateTime(newer.publishedAt)}` : ''} por ${newer.team}`,
        title: newer.fileName,
        className: 'project-info-note-warning'
      } : null;
      if (!shared) {
        return [label, null, newerNote];
      }
      if (newerNote) {
        return [label, shared.fileName || 'Sin publicar', newerNote];
      }
      if (!shared.fileName) {
        return [label, 'Sin publicar', {
          text: 'Se publica al actualizar el XML o al configurar el depósito'
        }];
      }

      const when = shared.publishedAt ? formatDateTime(shared.publishedAt) : '';
      const by = shared.publishedBy ? ` por ${shared.publishedBy}` : '';
      return [label, shared.fileName, { text: `Publicado${when ? ` el ${when}` : ''}${by}` }];
    }

    /**
     * Row of the ingest folder
     *
     * Shows the configured folder even when it is unavailable, since that is
     * the one the user chose and will look for; the note says what is being
     * watched meanwhile. It is changed from Proyecto > Configurar carpeta de
     * entrada, like the repository.
     *
     * @param {Object} info
     * @returns {Array}
     * @private
     */
    ingestRow(info) {
      let note = null;
      if (info.ingestUnavailable) {
        note = {
          text: 'No disponible: mientras tanto se usa la carpeta por defecto',
          title: info.ingestPath,
          className: 'project-info-note-warning'
        };
      } else if (info.ingestIsCustom) {
        note = { text: 'Personalizada' };
      }

      return ['Carpeta de entrada (ingest)', info.configuredIngestPath || info.ingestPath, note];
    }

    /**
     * Replace a section with one row per label/value pair
     *
     * A row may carry a third element with a note shown under the value.
     *
     * @param {HTMLElement} container
     * @param {Array<Array>} rows
     * @private
     */
    renderRows(container, rows) {
      if (!container) return;

      const fragment = document.createDocumentFragment();

      rows.forEach(([label, value, note]) => {
        const row = document.createElement('div');
        row.className = 'about-info-row';

        const labelEl = document.createElement('span');
        labelEl.className = 'about-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'about-value project-info-value';
        const hasValue = value !== null && value !== undefined && value !== '';
        valueEl.textContent = hasValue ? String(value) : NOT_SET;
        if (!hasValue) {
          valueEl.classList.add('project-info-value-empty');
        } else {
          // Paths are routinely wider than the modal
          valueEl.title = String(value);
        }

        row.appendChild(labelEl);
        row.appendChild(note ? this.withNote(valueEl, note) : valueEl);
        fragment.appendChild(row);
      });

      container.replaceChildren(fragment);
    }

    /**
     * Put a note under a value
     * @param {HTMLElement} valueEl
     * @param {{text: string, title?: string, className?: string}} note
     * @returns {HTMLElement}
     * @private
     */
    withNote(valueEl, note) {
      const group = document.createElement('div');
      group.className = 'project-info-value-group';
      group.appendChild(valueEl);

      const noteEl = document.createElement('span');
      noteEl.className = 'project-info-note';
      if (note.className) noteEl.classList.add(note.className);
      noteEl.textContent = note.text;
      if (note.title) noteEl.title = note.title;
      group.appendChild(noteEl);

      return group;
    }

    /**
     * @param {string} message
     * @private
     */
    renderError(message) {
      if (this.nameEl) this.nameEl.textContent = '';
      if (this.pathsEl) this.pathsEl.replaceChildren();
      if (this.countsEl) this.countsEl.replaceChildren();

      if (this.errorEl) {
        this.errorEl.textContent = message;
        this.errorEl.style.display = 'block';
      }
    }

    /**
     * @param {string} message
     * @param {string} level
     * @private
     */
    _log(message, level = 'log') {
      const prefix = '[ProjectInfoModal]';
      if (level === 'error') {
        console.error(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }

  // Export (for tests and browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProjectInfoModal };
  } else if (typeof window !== 'undefined') {
    global.ProjectInfoModal = ProjectInfoModal;
  }
})(typeof window !== 'undefined' ? window : global);
