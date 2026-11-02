/**
 * Tests for InventoryExportOptionsModal
 *
 * Only what comes from Preferencias > Exportación de imágenes: the copy or
 * resize choice for the images of the inventory and its two values.
 *
 * @jest-environment jsdom
 */

const { BaseModal } = require('../../../../src/renderer/core/BaseModal');

// The modal extends the BaseModal the page loads before it
global.BaseModal = BaseModal;
const { InventoryExportOptionsModal } = require('../../../../src/renderer/components/modals/InventoryExportOptionsModal');

describe('InventoryExportOptionsModal', () => {
  let modal;

  // show() reads the defaults and opens asynchronously, and resolves only
  // when the dialog is answered: wait for it to open, not for the answer
  const settle = async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  };

  const create = (config) => {
    modal = new InventoryExportOptionsModal(config);
    modal.init();
    return modal;
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="inventory-export-options-modal" class="modal">
        <h2 id="inventory-export-title">Opciones de Exportación de Inventario</h2>
        <input type="radio" name="scope" id="inventory-export-all-users" checked>
        <input type="radio" name="scope" id="inventory-export-selected-group">
        <span id="inventory-selected-group-label"></span>
        <input type="checkbox" id="inventory-export-images-enabled" checked>
        <div id="inventory-image-options">
          <input type="radio" name="image-mode" id="inventory-image-copy-original" checked>
          <input type="radio" name="image-mode" id="inventory-image-resize">
          <div id="inventory-resize-options">
            <input type="number" id="inventory-box-size" value="800">
            <input type="number" id="inventory-max-size" value="500">
          </div>
        </div>
        <input type="checkbox" id="inventory-zip-enabled">
        <div id="inventory-zip-options">
          <input type="number" id="inventory-zip-max-size" value="25">
        </div>
        <button id="inventory-export-confirm">Exportar</button>
        <button id="inventory-export-cancel" data-modal-cancel>Cancelar</button>
      </div>
    `;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (modal) {
      modal.destroy();
      modal = null;
    }
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('should start with the saved resize values', async () => {
    create({ getDefaults: async () => ({ mode: 'resize', boxSize: 1200, maxSize: 300 }) });

    const promise = modal.show();
    await settle();
    modal.handleConfirm();

    expect((await promise).imageOptions).toEqual({
      copyOriginal: false,
      resizeEnabled: true,
      boxSize: 1200,
      maxSizeKB: 300
    });
  });

  test('should enable the resize fields when the saved mode is resize', async () => {
    create({ getDefaults: async () => ({ mode: 'resize', boxSize: 1200, maxSize: 300 }) });

    modal.show();
    await settle();

    expect(modal.boxSizeInput.disabled).toBe(false);
    expect(modal.maxSizeInput.disabled).toBe(false);
    modal.handleCancel();
  });

  test('should go back to the saved values on every opening', async () => {
    create({ getDefaults: async () => ({ mode: 'copy', boxSize: 640, maxSize: 200 }) });

    modal.show();
    await settle();
    modal.boxSizeInput.value = '2000';
    modal.handleCancel();

    modal.show();
    await settle();

    expect(modal.copyOriginalRadio.checked).toBe(true);
    expect(modal.boxSizeInput.value).toBe('640');
    expect(modal.maxSizeInput.value).toBe('200');
    modal.handleCancel();
  });

  test('should still open with the form as it is when they cannot be read', async () => {
    create({ getDefaults: async () => { throw new Error('IPC down'); } });

    modal.show();
    await settle();

    expect(modal.isOpen).toBe(true);
    expect(modal.boxSizeInput.value).toBe('800');
    expect(modal.maxSizeInput.value).toBe('500');
    modal.handleCancel();
  });

  test('should work without them, as before', async () => {
    create();

    const promise = modal.show();
    await settle();
    modal.handleConfirm();

    expect((await promise).imageOptions).toEqual({
      copyOriginal: true,
      resizeEnabled: false,
      boxSize: 800,
      maxSizeKB: 500
    });
  });

  // Inventario Legacy imports the photos only from a ZIP
  describe('with requireZip, as Inventario Legacy opens it', () => {
    test('should take its own title and give back the usual one afterwards', async () => {
      create();
      const title = () => document.getElementById('inventory-export-title').textContent;

      modal.show({ title: 'Archivos para Inventario Legacy', requireZip: true });
      await settle();
      expect(title()).toBe('Archivos para Inventario Legacy');
      modal.handleCancel();

      modal.show();
      await settle();
      expect(title()).toBe('Opciones de Exportación de Inventario');
      modal.handleCancel();
    });

    test('should put the photos in ZIP files, without a way to untick it', async () => {
      create();

      const promise = modal.show({ requireZip: true });
      await settle();

      expect(modal.zipEnabledCheckbox.checked).toBe(true);
      expect(modal.zipEnabledCheckbox.disabled).toBe(true);
      expect(modal.zipMaxSizeInput.disabled).toBe(false);
      modal.zipMaxSizeInput.value = '40';
      modal.handleConfirm();

      expect(await promise).toEqual(expect.objectContaining({ exportImages: true, zipEnabled: true, zipMaxSizeMB: 40 }));
    });

    test('should still let the photos be left out', async () => {
      create();

      const promise = modal.show({ requireZip: true });
      await settle();
      modal.exportImagesCheckbox.checked = false;
      modal.handleExportImagesChange();
      modal.handleConfirm();

      expect((await promise).exportImages).toBe(false);
    });

    test('should leave the ZIP box free again for Edu Inventory Manager', async () => {
      create();

      modal.show({ requireZip: true });
      await settle();
      modal.handleCancel();
      modal.show();
      await settle();

      expect(modal.zipEnabledCheckbox.disabled).toBe(false);
      modal.handleCancel();
    });
  });
});
