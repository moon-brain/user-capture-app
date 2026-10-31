/**
 * Tests for ProjectInfoModal
 *
 * The modal only renders what the main process hands it, so what matters is
 * that every field reaches the screen, that a missing one reads as unset
 * instead of "undefined", and that a failed read says so rather than showing
 * a half-filled panel.
 */

const { ProjectInfoModal } = require('../../../../src/renderer/components/modals/ProjectInfoModal');

describe('ProjectInfoModal', () => {
  let modal;
  let getProjectDetails;

  const INFO = {
    name: 'Captura Carnets 2526',
    projectPath: 'D:\\Proyectos\\Captura Carnets 2526',
    xmlFilePath: 'D:\\Proyectos\\usuarios.xml',
    sharedXml: {
      appliedAt: new Date(2026, 9, 31, 18, 5).toISOString(),
      fileName: 'centro_20261031180500_DIRECCION.xml',
      publishedAt: new Date(2026, 9, 31, 18, 5).toISOString(),
      publishedBy: 'DIRECCION'
    },
    ingestPath: 'D:\\Proyectos\\Captura Carnets 2526\\ingest',
    configuredIngestPath: null,
    ingestIsCustom: false,
    ingestUnavailable: false,
    importsPath: 'D:\\Proyectos\\Captura Carnets 2526\\imports',
    databasePath: 'D:\\Proyectos\\Captura Carnets 2526\\data\\users.db',
    repositoryPath: 'G:\\Mi unidad\\Fotos Usuarios',
    mirrorPath: 'C:\\Users\\alguien\\AppData\\Roaming\\repository-mirror',
    capturedImages: 812,
    totalUsers: 1200,
    usersWithImage: 805,
    usersWithoutImage: 395,
    totalGroups: 47,
    taggedImages: 12,
    usersByType: { student: 1100, teacher: 80, non_teaching_staff: 20 }
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="project-info-modal" class="modal">
        <div class="modal-content">
          <div id="project-info-modal-name"></div>
          <p id="project-info-modal-error" style="display: none;"></p>
          <div id="project-info-modal-paths"></div>
          <div id="project-info-modal-counts"></div>
          <button id="project-info-modal-close-btn">Cerrar</button>
        </div>
      </div>
    `;

    getProjectDetails = jest.fn().mockResolvedValue({ success: true, info: INFO });

    modal = new ProjectInfoModal({ getProjectDetails });
    modal.init();
  });

  const rows = (sectionId) =>
    Array.from(document.querySelectorAll(`#${sectionId} .about-info-row`)).map((row) => [
      row.querySelector('.about-label').textContent,
      row.querySelector('.about-value').textContent
    ]);

  const paths = () => rows('project-info-modal-paths');
  const counts = () => rows('project-info-modal-counts');
  const valueFor = (section, label) => {
    const found = section().find(([rowLabel]) => rowLabel === label);
    return found ? found[1] : undefined;
  };

  describe('show()', () => {
    test('should open the modal', async () => {
      await modal.show();

      expect(modal.isModalOpen()).toBe(true);
      expect(modal.modal.classList.contains('show')).toBe(true);
    });

    test('should ask the main process once', async () => {
      await modal.show();

      expect(getProjectDetails).toHaveBeenCalledTimes(1);
    });

    test('should report success', async () => {
      await expect(modal.show()).resolves.toBe(true);
    });

    test('should show the project name', async () => {
      await modal.show();

      expect(document.getElementById('project-info-modal-name').textContent)
        .toBe('Captura Carnets 2526');
    });
  });

  describe('locations', () => {
    beforeEach(async () => {
      await modal.show();
    });

    test('should list every folder of the project', async () => {
      expect(valueFor(paths, 'Carpeta del proyecto')).toBe(INFO.projectPath);
      expect(valueFor(paths, 'Carpeta de entrada (ingest)')).toBe(INFO.ingestPath);
      expect(valueFor(paths, 'Imágenes capturadas (imports)')).toBe(INFO.importsPath);
      expect(valueFor(paths, 'Base de datos')).toBe(INFO.databasePath);
    });

    test('should list the repository and its local copy', () => {
      expect(valueFor(paths, 'Depósito de imágenes')).toBe(INFO.repositoryPath);
      expect(valueFor(paths, 'Copia local del depósito')).toBe(INFO.mirrorPath);
    });

    test('should list the XML the users came from', () => {
      expect(valueFor(paths, 'Archivo XML')).toBe(INFO.xmlFilePath);
    });

    test('should put the full path in the tooltip, since it may be cut off', () => {
      const value = Array.from(document.querySelectorAll('#project-info-modal-paths .about-value'))
        .find((el) => el.textContent === INFO.projectPath);

      expect(value.title).toBe(INFO.projectPath);
    });
  });

  describe('ingest folder', () => {
    const CUSTOM = 'E:\\Tethering\\Salida';
    const ingestRow = () => Array.from(document.querySelectorAll('#project-info-modal-paths .about-info-row'))
      .find((row) => row.querySelector('.about-label').textContent === 'Carpeta de entrada (ingest)');
    const note = () => ingestRow().querySelector('.project-info-note');

    test('should not add a note to the default folder', async () => {
      await modal.show();

      expect(note()).toBeNull();
    });

    test('should mark a custom folder', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, ingestPath: CUSTOM, configuredIngestPath: CUSTOM, ingestIsCustom: true }
      });

      await modal.show();

      expect(valueFor(paths, 'Carpeta de entrada (ingest)')).toBe(CUSTOM);
      expect(note().textContent).toBe('Personalizada');
    });

    test('should show the chosen folder and what stands in for it when it is missing', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, configuredIngestPath: CUSTOM, ingestIsCustom: true, ingestUnavailable: true }
      });

      await modal.show();

      expect(valueFor(paths, 'Carpeta de entrada (ingest)')).toBe(CUSTOM);
      expect(note().textContent).toContain('No disponible');
      expect(note().title).toBe(INFO.ingestPath);
      expect(note().classList.contains('project-info-note-warning')).toBe(true);
    });

    test('should be read-only, changed from the Proyecto menu instead', async () => {
      await modal.show();

      expect(ingestRow().querySelector('button')).toBeNull();
    });

    test('should repaint a folder changed from the menu while open', async () => {
      await modal.show();
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, ingestPath: CUSTOM, configuredIngestPath: CUSTOM, ingestIsCustom: true }
      });

      await modal.refresh();

      expect(valueFor(paths, 'Carpeta de entrada (ingest)')).toBe(CUSTOM);
      expect(modal.isModalOpen()).toBe(true);
    });
  });

  describe('shared XML', () => {
    const LABEL = 'XML compartido en el depósito';
    const sharedRow = () => Array.from(document.querySelectorAll('#project-info-modal-paths .about-info-row'))
      .find((row) => row.querySelector('.about-label').textContent === LABEL);
    const note = () => sharedRow().querySelector('.project-info-note');

    test('should show the published file, when and by which team', async () => {
      await modal.show();

      expect(valueFor(paths, LABEL)).toBe('centro_20261031180500_DIRECCION.xml');
      expect(note().textContent).toBe('Publicado el 31/10/2026 18:05 por DIRECCION');
    });

    test('should say an applied XML is not published yet, and when it will be', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, sharedXml: { ...INFO.sharedXml, fileName: null, publishedAt: null, publishedBy: null } }
      });

      await modal.show();

      expect(valueFor(paths, LABEL)).toBe('Sin publicar');
      expect(note().textContent).toBe('Se publica al actualizar el XML o al configurar el depósito');
    });

    test('should say there is a more recent one, published by another team', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: {
          ...INFO,
          newerSharedXml: {
            fileName: 'centro_20261103090000_PC-FOTOS.xml',
            publishedAt: new Date(2026, 10, 3, 9, 0).toISOString(),
            team: 'PC-FOTOS'
          }
        }
      });

      await modal.show();

      expect(valueFor(paths, LABEL)).toBe('centro_20261031180500_DIRECCION.xml');
      expect(note().textContent).toBe('Hay uno más reciente, publicado el 03/11/2026 09:00 por PC-FOTOS');
      expect(note().classList.contains('project-info-note-warning')).toBe(true);
    });

    test('should read as not configured on a project from before it was recorded', async () => {
      getProjectDetails.mockResolvedValue({ success: true, info: { ...INFO, sharedXml: null } });

      await modal.show();

      expect(valueFor(paths, LABEL)).toBe('No configurado');
      expect(note()).toBeNull();
    });
  });

  describe('contents', () => {
    beforeEach(async () => {
      await modal.show();
    });

    test('should report the linked photos', () => {
      expect(valueFor(counts, 'Fotos enlazadas')).toBe('805');
    });

    test('should report users, groups and the rest of the totals', () => {
      expect(valueFor(counts, 'Usuarios')).toBe('1200');
      expect(valueFor(counts, 'Grupos')).toBe('47');
      expect(valueFor(counts, 'Usuarios sin foto')).toBe('395');
      expect(valueFor(counts, 'Imágenes en la carpeta imports')).toBe('812');
      expect(valueFor(counts, 'Imágenes con etiquetas')).toBe('12');
    });

    test('should break the users down by type, in Spanish', () => {
      expect(valueFor(counts, 'Alumnado')).toBe('1100');
      expect(valueFor(counts, 'Docentes')).toBe('80');
      expect(valueFor(counts, 'No docentes')).toBe('20');
    });

    test('should order the types regardless of what the query returned', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, usersByType: { non_teaching_staff: 6, teacher: 184, student: 1772 } }
      });

      await modal.show();

      const labels = counts().map(([label]) => label);
      expect(labels.indexOf('Alumnado')).toBeLessThan(labels.indexOf('Docentes'));
      expect(labels.indexOf('Docentes')).toBeLessThan(labels.indexOf('No docentes'));
    });

    test('should keep an unknown type after the ones we know', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, usersByType: { alien: 3, student: 10 } }
      });

      await modal.show();

      const labels = counts().map(([label]) => label);
      expect(labels.indexOf('Alumnado')).toBeLessThan(labels.indexOf('alien'));
    });

    test('should fall back to the raw type when it is not one we know', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, usersByType: { alien: 3 } }
      });

      await modal.show();

      expect(valueFor(counts, 'alien')).toBe('3');
    });

    test('should show a zero rather than treating it as missing', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, usersWithImage: 0 }
      });

      await modal.show();

      expect(valueFor(counts, 'Fotos enlazadas')).toBe('0');
    });
  });

  describe('missing values', () => {
    test('should mark a repository that was never configured', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, repositoryPath: null }
      });

      await modal.show();

      expect(valueFor(paths, 'Depósito de imágenes')).toBe('No configurado');
    });

    test('should mark an XML that predates it being recorded', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, xmlFilePath: null }
      });

      await modal.show();

      expect(valueFor(paths, 'Archivo XML')).toBe('No configurado');
    });

    test('should style a missing value apart', async () => {
      getProjectDetails.mockResolvedValue({
        success: true,
        info: { ...INFO, mirrorPath: null }
      });

      await modal.show();

      const empty = document.querySelectorAll('#project-info-modal-paths .project-info-value-empty');
      expect(empty).toHaveLength(1);
    });
  });

  describe('failures', () => {
    test('should show the reason the details could not be read', async () => {
      getProjectDetails.mockResolvedValue({
        success: false,
        error: 'No hay ningún proyecto abierto'
      });

      const shown = await modal.show();

      expect(shown).toBe(false);
      const error = document.getElementById('project-info-modal-error');
      expect(error.textContent).toBe('No hay ningún proyecto abierto');
      expect(error.style.display).toBe('block');
    });

    test('should not leave stale figures on screen after a failure', async () => {
      await modal.show();
      getProjectDetails.mockResolvedValue({ success: false, error: 'Error' });

      await modal.show();

      expect(paths()).toHaveLength(0);
      expect(counts()).toHaveLength(0);
    });

    test('should survive the call itself throwing', async () => {
      getProjectDetails.mockRejectedValue(new Error('IPC caído'));

      await expect(modal.show()).resolves.toBe(false);
      expect(document.getElementById('project-info-modal-error').textContent).toBe('IPC caído');
    });

    test('should clear a previous error on a later success', async () => {
      getProjectDetails.mockResolvedValue({ success: false, error: 'Error' });
      await modal.show();

      getProjectDetails.mockResolvedValue({ success: true, info: INFO });
      await modal.show();

      const error = document.getElementById('project-info-modal-error');
      expect(error.textContent).toBe('');
      expect(error.style.display).toBe('none');
    });
  });

  describe('close', () => {
    test('should close on the button', async () => {
      await modal.show();

      document.getElementById('project-info-modal-close-btn').click();

      expect(modal.isModalOpen()).toBe(false);
    });
  });

  describe('re-opening', () => {
    test('should not accumulate rows', async () => {
      await modal.show();
      const first = paths().length;

      await modal.show();

      expect(paths()).toHaveLength(first);
    });

    test('should re-read the details every time', async () => {
      await modal.show();
      await modal.show();

      expect(getProjectDetails).toHaveBeenCalledTimes(2);
    });
  });
});
