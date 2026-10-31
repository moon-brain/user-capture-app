/**
 * Tests for SharedXmlNotice
 *
 * The badge that says another team published a more recent school XML. What
 * must hold: it shows only for an open project with something newer, a failed
 * check does not make it disappear or appear, and clicking it opens the usual
 * analysis with the published file, never applying anything by itself.
 */

const { SharedXmlNotice, describePublication } = require('../../../src/renderer/components/SharedXmlNotice');

describe('SharedXmlNotice', () => {
  const NEWER = {
    fileName: 'centro_20261103090000_PC-FOTOS.xml',
    filePath: 'G:\\Mi unidad\\Fotos\\Centro\\centro_20261103090000_PC-FOTOS.xml',
    publishedAt: new Date(2026, 10, 3, 9, 0).toISOString(),
    team: 'PC-FOTOS',
    academicYear: 2026
  };

  let badge;
  let projectOpen;
  let checkSharedXml;
  let onUpdate;
  let notice;

  const shown = () => badge.style.display === 'flex';

  beforeEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '<div id="shared-xml-alert" class="alert-badge" style="display: none;"></div>';
    badge = document.getElementById('shared-xml-alert');
    projectOpen = true;
    checkSharedXml = jest.fn().mockResolvedValue({ success: true, newer: NEWER });
    onUpdate = jest.fn().mockResolvedValue();
    notice = new SharedXmlNotice({ badge, getProjectOpen: () => projectOpen, checkSharedXml, onUpdate });
    notice.init();
  });

  describe('check()', () => {
    test('should show the badge when there is a more recent XML', async () => {
      await notice.check();

      expect(shown()).toBe(true);
    });

    test('should say who published it and when in the tooltip', async () => {
      await notice.check();

      expect(badge.title).toContain('publicado en el depósito por PC-FOTOS el 03/11/2026 09:00');
    });

    test('should hide it when there is nothing newer', async () => {
      await notice.check();
      checkSharedXml.mockResolvedValue({ success: true, newer: null });

      await notice.check();

      expect(shown()).toBe(false);
    });

    test('should leave it as it was when the check fails', async () => {
      await notice.check();
      checkSharedXml.mockResolvedValue({ success: false, error: 'EIO' });
      await notice.check();
      expect(shown()).toBe(true);

      checkSharedXml.mockRejectedValue(new Error('IPC gone'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      await notice.check();
      expect(shown()).toBe(true);
    });

    test('should not ask without an open project', async () => {
      projectOpen = false;

      await notice.check();

      expect(checkSharedXml).not.toHaveBeenCalled();
      expect(shown()).toBe(false);
    });

    test('should not show it for a project closed while Centro was being read', async () => {
      let answer;
      checkSharedXml.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

      const pending = notice.check();
      projectOpen = false;
      answer({ success: true, newer: NEWER });
      await pending;

      expect(shown()).toBe(false);
    });

    test('should join a check already under way', async () => {
      await Promise.all([notice.check(), notice.check()]);

      expect(checkSharedXml).toHaveBeenCalledTimes(1);
    });
  });

  describe('clicking it', () => {
    test('should open the analysis with the published file and where it comes from', async () => {
      await notice.check();

      badge.click();

      expect(onUpdate).toHaveBeenCalledWith({
        filePath: NEWER.filePath,
        source: describePublication(NEWER)
      });
    });

    test('should do nothing while hidden', () => {
      badge.click();

      expect(onUpdate).not.toHaveBeenCalled();
    });

    test('should not open a second analysis while one is open', async () => {
      await notice.check();
      onUpdate.mockReturnValue(new Promise(() => {}));

      badge.click();
      badge.click();

      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
  });

  test('hide() should clear it, as on closing the project', async () => {
    await notice.check();

    notice.hide();

    expect(shown()).toBe(false);
    expect(badge.title).toBe('');
  });
});
