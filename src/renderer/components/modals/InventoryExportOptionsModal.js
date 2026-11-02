/**
 * InventoryExportOptionsModal - Modal for inventory export configuration
 *
 * Allows user to select export scope:
 * - All users (entire project)
 * - Selected group only
 *
 * Returns Promise with selected options
 */

(function(global) {
  'use strict';

  class InventoryExportOptionsModal extends BaseModal {
    /**
     * @param {Object} [config]
     * @param {function(): Promise<Object>} [config.getDefaults] - The copy or
     *   resize choice and its values ({ mode, boxSize, maxSize }) from
     *   Preferencias, read each time it opens
     */
    constructor({ getDefaults } = {}) {
      super('inventory-export-options-modal', {
        defaultButtonSelector: '#inventory-export-confirm'
      });

      this.getDefaults = getDefaults || null;
      // Inventario Legacy imports the photos only from a ZIP
      this.requireZip = false;

      this.title = document.getElementById('inventory-export-title');
      this.defaultTitle = this.title ? this.title.textContent : '';

      // Get DOM elements - User scope
      this.allUsersRadio = document.getElementById('inventory-export-all-users');
      this.selectedGroupRadio = document.getElementById('inventory-export-selected-group');
      this.selectedGroupLabel = document.getElementById('inventory-selected-group-label');

      // Get DOM elements - Image export
      this.exportImagesCheckbox = document.getElementById('inventory-export-images-enabled');
      this.imageOptionsContainer = document.getElementById('inventory-image-options');
      this.copyOriginalRadio = document.getElementById('inventory-image-copy-original');
      this.resizeRadio = document.getElementById('inventory-image-resize');
      this.resizeOptionsContainer = document.getElementById('inventory-resize-options');
      this.boxSizeInput = document.getElementById('inventory-box-size');
      this.maxSizeInput = document.getElementById('inventory-max-size');

      // Get DOM elements - ZIP compression
      this.zipEnabledCheckbox = document.getElementById('inventory-zip-enabled');
      this.zipOptionsContainer = document.getElementById('inventory-zip-options');
      this.zipMaxSizeInput = document.getElementById('inventory-zip-max-size');

      // Buttons
      this.confirmButton = document.getElementById('inventory-export-confirm');
      this.cancelButton = document.getElementById('inventory-export-cancel');

      // Bind methods
      this.handleConfirm = this.handleConfirm.bind(this);
      this.handleCancel = this.handleCancel.bind(this);
      this.handleExportImagesChange = this.handleExportImagesChange.bind(this);
      this.handleImageModeChange = this.handleImageModeChange.bind(this);
      this.handleZipEnabledChange = this.handleZipEnabledChange.bind(this);

      // Setup event listeners
      this.confirmButton.addEventListener('click', this.handleConfirm);
      this.cancelButton.addEventListener('click', this.handleCancel);
      this.exportImagesCheckbox.addEventListener('change', this.handleExportImagesChange);
      this.copyOriginalRadio.addEventListener('change', this.handleImageModeChange);
      this.resizeRadio.addEventListener('change', this.handleImageModeChange);
      this.zipEnabledCheckbox.addEventListener('change', this.handleZipEnabledChange);

      // Initial state
      this.handleExportImagesChange();
      this.handleImageModeChange();
      this.handleZipEnabledChange();
    }

    /**
     * Show modal and return selected options
     * @param {Object} config - Configuration object
     * @param {string} config.selectedGroupCode - Currently selected group code
     * @param {string} config.selectedGroupName - Currently selected group name
     * @param {string} [config.title] - Instead of the Edu Inventory Manager one
     * @param {boolean} [config.requireZip] - Photos, if exported, always go in
     *   ZIP files: the box is ticked and cannot be unticked
     * @returns {Promise<Object|null>} Selected options or null if cancelled
     */
    async show(config = {}) {
      // Update UI based on selected group
      if (config.selectedGroupCode && config.selectedGroupName) {
        this.selectedGroupLabel.textContent = `${config.selectedGroupCode} - ${config.selectedGroupName}`;
        this.selectedGroupRadio.disabled = false;
      } else {
        this.selectedGroupLabel.textContent = 'Ningún grupo seleccionado';
        this.selectedGroupRadio.disabled = true;
        // Force selection to "all users" if no group selected
        this.allUsersRadio.checked = true;
      }

      // Default to "all users"
      this.allUsersRadio.checked = true;

      if (this.title) {
        this.title.textContent = config.title || this.defaultTitle;
      }
      this.requireZip = Boolean(config.requireZip);
      if (this.requireZip) {
        this.exportImagesCheckbox.checked = true;
        this.zipEnabledCheckbox.checked = true;
      }

      await this.applyImageDefaults();
      this.handleExportImagesChange();

      // Show modal using base class method
      await super.open();

      // Return promise that resolves when user confirms or cancels
      return new Promise((resolve) => {
        this.resolvePromise = resolve;
      });
    }

    /**
     * Start the copy or resize choice from Preferencias > Exportación de
     * imágenes. If they cannot be read, the form stays as it is.
     */
    async applyImageDefaults() {
      if (!this.getDefaults) return;

      let defaults;
      try {
        defaults = await this.getDefaults();
      } catch (error) {
        console.error('[InventoryExportOptionsModal] Could not read the export defaults', error);
        return;
      }
      if (!defaults) return;

      const isResize = defaults.mode === 'resize';
      this.resizeRadio.checked = isResize;
      this.copyOriginalRadio.checked = !isResize;
      if (Number.isFinite(defaults.boxSize) && defaults.boxSize > 0) {
        this.boxSizeInput.value = String(defaults.boxSize);
      }
      if (Number.isFinite(defaults.maxSize) && defaults.maxSize > 0) {
        this.maxSizeInput.value = String(defaults.maxSize);
      }

      this.handleImageModeChange();
    }

    /**
     * Handle export images checkbox change
     */
    handleExportImagesChange() {
      const isEnabled = this.exportImagesCheckbox.checked;

      // Enable/disable image options
      if (isEnabled) {
        this.imageOptionsContainer.classList.add('active');
      } else {
        this.imageOptionsContainer.classList.remove('active');
      }
      this.copyOriginalRadio.disabled = !isEnabled;
      this.resizeRadio.disabled = !isEnabled;

      this.handleImageModeChange();
      this.handleZipEnabledChange();
    }

    /**
     * Handle image mode change (copy vs resize)
     */
    handleImageModeChange() {
      const isExportEnabled = this.exportImagesCheckbox.checked;
      const isResizeMode = this.resizeRadio.checked;

      // Enable/disable resize inputs
      const shouldEnableResize = isExportEnabled && isResizeMode;
      if (shouldEnableResize) {
        this.resizeOptionsContainer.classList.add('active');
      } else {
        this.resizeOptionsContainer.classList.remove('active');
      }
      this.boxSizeInput.disabled = !shouldEnableResize;
      this.maxSizeInput.disabled = !shouldEnableResize;
    }

    /**
     * Handle ZIP enabled checkbox change
     */
    handleZipEnabledChange() {
      const isExportEnabled = this.exportImagesCheckbox.checked;
      const isZipEnabled = this.zipEnabledCheckbox.checked;

      // ZIP only available when image export is enabled
      const shouldEnableZip = isExportEnabled && isZipEnabled;
      if (shouldEnableZip) {
        this.zipOptionsContainer.classList.add('active');
      } else {
        this.zipOptionsContainer.classList.remove('active');
      }
      this.zipMaxSizeInput.disabled = !shouldEnableZip;

      // Disable ZIP checkbox if images not exported, or if it cannot be unticked
      this.zipEnabledCheckbox.disabled = !isExportEnabled || this.requireZip;
    }

    /**
     * Handle confirm button click
     */
    handleConfirm() {
      const options = {
        scope: this.allUsersRadio.checked ? 'all' : 'group',
        exportImages: this.exportImagesCheckbox.checked
      };

      // Add image export options if enabled
      if (options.exportImages) {
        options.imageOptions = {
          copyOriginal: this.copyOriginalRadio.checked,
          resizeEnabled: this.resizeRadio.checked,
          boxSize: parseInt(this.boxSizeInput.value) || 800,
          maxSizeKB: parseInt(this.maxSizeInput.value) || 500
        };

        // Add ZIP options if enabled
        options.zipEnabled = this.zipEnabledCheckbox.checked;
        if (options.zipEnabled) {
          options.zipMaxSizeMB = parseInt(this.zipMaxSizeInput.value) || 25;
        }
      }

      // Resolve promise BEFORE closing to avoid close() overwriting it
      if (this.resolvePromise) {
        this.resolvePromise(options);
        this.resolvePromise = null;
      }

      this.close();
    }

    /**
     * Handle cancel button click
     */
    handleCancel() {
      // Resolve promise BEFORE closing to avoid close() overwriting it
      if (this.resolvePromise) {
        this.resolvePromise(null);
        this.resolvePromise = null;
      }

      this.close();
    }

    /**
     * Override close to handle promise rejection if not already resolved
     */
    close() {
      // If promise not resolved yet, resolve with null (cancelled)
      if (this.resolvePromise) {
        this.resolvePromise(null);
        this.resolvePromise = null;
      }

      super.close();
    }
  }

  // Export for use in other modules
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InventoryExportOptionsModal };
  } else if (typeof window !== 'undefined') {
    global.InventoryExportOptionsModal = InventoryExportOptionsModal;
  }
})(typeof window !== 'undefined' ? window : global);
