// @ts-check
/**
 * Project-related IPC handlers
 */
const { ipcMain } = require('electron');
const { showAppMessage } = require('../appDialogs');
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../database');
const XMLParser = require('../xmlParser');
const ImageManager = require('../imageManager');
const { startIngestWatcher } = require('../ingestFolder');
const { parseAcademicYear, academicYearOn } = require('../academicYear');
const { getImageRepositoryPath } = require('../utils/config');
const { hashXml, setAppliedXml, getAppliedXml, publishAppliedXml, findNewerXml } = require('../sharedXml');

// Centro is looked at on opening and when the window gets the focus back, so
// this keeps it to a readdir a minute at most over a synced drive
const SHARED_XML_CHECK_INTERVAL = 60 * 1000;

/**
 * Record the XML a project has just applied, so it can be published to the
 * repository's Centro folder and recognised there (sharedXml.js)
 *
 * @param {Object} dbManager
 * @param {Buffer} content - the file's bytes, read when it was parsed
 * @returns {Promise<void>}
 */
async function recordAppliedXml(dbManager, content) {
  await setAppliedXml(dbManager, {
    hash: hashXml(content),
    fileName: null,
    appliedAt: new Date().toISOString()
  });
}

/**
 * Identifier as the XML update compares it
 *
 * Until the parser kept attributes as text, an all-digit NIA or document lost
 * its leading zeros on import: "0123456" was stored as "123456". Comparing
 * all-digit identifiers without those zeros lets an update recognise those
 * users instead of treating them as removed and added again, which would lose
 * their photo link. Applying the update then stores the identifier as the XML
 * has it, zeros included.
 *
 * The same for character references: until 1.25 they were stored as written
 * ("&#49;23"), and the parser now decodes them ("123").
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function identifierKey(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = XMLParser.decodeCharacterReferences(String(value)).trim();
  return /^\d+$/.test(text) ? (text.replace(/^0+/, '') || '0') : text;
}

/**
 * Register project-related IPC handlers
 * @param {import('./context').IpcContext} context - Shared context, built in main.js
 */
function registerProjectHandlers(context) {
  const {
    mainWindow: getMainWindow,
    logger,
    state,
    addRecentProject,
    updateWindowTitle,
    closeCurrentProject,
    ensureRepositoryMirrorStarted,
    groupCoverageWindow
  } = context;

  // Ver > Fotografías por grupo counts users per group, and an XML update
  // adds, removes and moves users between groups. The window reloads its
  // counts on this message, the same one a new link sends it.
  const notifyGroupCoverage = () => {
    const win = groupCoverageWindow ? groupCoverageWindow() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send('captured-images-changed');
    }
  };

  const ingestContext = { state, logger, getMainWindow };

  // Create new project
  ipcMain.handle('create-project', async (event, data) => {
    try {
      const { folderPath, xmlPath } = data;

      // Initialize logger for this project
      logger.initialize(folderPath);
      logger.section('CREATING NEW PROJECT');
      logger.info('Project folder selected', { folderPath, xmlPath });

      // Validate paths
      logger.info('Validating paths...');
      if (!fs.existsSync(folderPath)) {
        throw new Error('La carpeta seleccionada no existe');
      }
      if (!fs.existsSync(xmlPath)) {
        throw new Error('El archivo XML no existe');
      }
      // Creating here would import the XML on top of the existing database
      // and duplicate every user in it
      if (fs.existsSync(path.join(folderPath, 'data', 'users.db'))) {
        throw new Error('La carpeta ya contiene un proyecto. Para trabajar con él, ábrelo con Archivo > Abrir Proyecto...');
      }
      logger.success('Paths validated successfully');

      // Progress: 10%
      getMainWindow()?.webContents.send('progress', {
        percentage: 10,
        message: 'Leyendo archivo XML...',
        details: xmlPath
      });

      // Read before anything is created or closed: a broken XML leaves the
      // open project untouched and no half-made project in the folder
      logger.section('PARSING XML FILE');
      logger.info(`Reading XML file: ${xmlPath}`);
      // Kept to record what was applied; read before parsing, so it is the
      // file the parser sees
      const xmlContent = fs.readFileSync(xmlPath);
      const xmlParser = new XMLParser(xmlPath);
      const users = await xmlParser.parse();

      const totalUsers = users.students.length + users.teachers.length + users.nonTeachingStaff.length;
      const totalGroups = users.groups.length;

      logger.success('XML parsed successfully', {
        groups: totalGroups,
        students: users.students.length,
        teachers: users.teachers.length,
        nonTeachingStaff: users.nonTeachingStaff.length,
        totalUsers: totalUsers
      });

      // Release the previous project before taking over its globals, as
      // opening one does: its folder watcher and database would stay alive
      await closeCurrentProject();

      // Progress: 25%
      getMainWindow()?.webContents.send('progress', {
        percentage: 25,
        message: 'Creando carpetas del proyecto...',
        details: ''
      });

      state.projectPath = folderPath;

      // Create necessary folders
      logger.section('CREATING PROJECT STRUCTURE');
      const ingestPath = path.join(folderPath, 'ingest');
      const importsPath = path.join(folderPath, 'imports');
      const dataPath = path.join(folderPath, 'data');

      [ingestPath, importsPath, dataPath].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          logger.info(`Created folder: ${dir}`);
        } else {
          logger.info(`Folder already exists: ${dir}`);
        }
      });
      logger.success('Project structure created successfully');

      // Progress: 40%
      getMainWindow()?.webContents.send('progress', {
        percentage: 40,
        message: 'Inicializando base de datos...',
        details: ''
      });

      // Initialize database
      logger.section('INITIALIZING DATABASE');
      const dbPath = path.join(dataPath, 'users.db');
      logger.info(`Database path: ${dbPath}`);
      state.dbManager = new DatabaseManager(dbPath);
      await state.dbManager.initialize();
      logger.success('Database initialized successfully');

      // Remembered so the project information can report where the users came
      // from; nothing else recorded it
      await state.dbManager.setProjectSetting('xmlFilePath', xmlPath);
      // Published once the project has a repository: a new one has none yet
      await recordAppliedXml(state.dbManager, xmlContent);

      // Card print and publication requests are dated against it
      if (users.academicYear) {
        await state.dbManager.setProjectSetting('academicYear', String(users.academicYear));
      }

      // Progress: 60%
      getMainWindow()?.webContents.send('progress', {
        percentage: 60,
        message: 'Importando usuarios...',
        details: `${totalGroups} grupos, ${totalUsers} usuarios encontrados`
      });

      logger.section('IMPORTING USERS TO DATABASE');
      logger.info(`Importing ${totalGroups} groups and ${totalUsers} users...`);
      const importReport = await state.dbManager.importUsers(users);
      logger.success('Users imported successfully');

      // Log import report summary
      logger.info('Import report summary', {
        imported: importReport.imported,
        withoutIdentifier: importReport.withoutIdentifier.length,
        withoutGroup: importReport.withoutGroup.length,
        duplicates: importReport.duplicates.length
      });

      // Generate detailed import report log if there are issues
      if (importReport.withoutIdentifier.length > 0 || importReport.withoutGroup.length > 0 || importReport.duplicates.length > 0) {
        const reportLogPath = path.join(folderPath, 'import-report.log');
        let reportContent = '='.repeat(80) + '\n';
        reportContent += 'INFORME DE IMPORTACIÓN DE USUARIOS\n';
        reportContent += '='.repeat(80) + '\n\n';
        reportContent += `Fecha: ${new Date().toLocaleString('es-ES')}\n`;
        reportContent += `Total de usuarios importados: ${importReport.imported}\n\n`;

        // Users without identifier
        if (importReport.withoutIdentifier.length > 0) {
          reportContent += '-'.repeat(80) + '\n';
          reportContent += `USUARIOS SIN IDENTIFICADOR (${importReport.withoutIdentifier.length})\n`;
          reportContent += '-'.repeat(80) + '\n';
          reportContent += 'Estos usuarios NO se han importado porque no tienen identificador válido.\n';
          reportContent += 'Los estudiantes requieren NIA y los docentes/no docentes requieren documento.\n\n';

          importReport.withoutIdentifier.forEach((user, index) => {
            reportContent += `${index + 1}. ${user.name}\n`;
            reportContent += `   Tipo: ${user.type}\n`;
            reportContent += `   Grupo: ${user.group}\n`;
            reportContent += `   Documento: ${user.document}\n`;
            reportContent += `   Razón: ${user.reason}\n\n`;
          });
        }

        // Users without group
        if (importReport.withoutGroup.length > 0) {
          reportContent += '-'.repeat(80) + '\n';
          reportContent += `USUARIOS SIN GRUPO (${importReport.withoutGroup.length})\n`;
          reportContent += '-'.repeat(80) + '\n';
          reportContent += 'Estos usuarios se han importado pero no tienen grupo asignado.\n\n';

          importReport.withoutGroup.forEach((user, index) => {
            reportContent += `${index + 1}. ${user.name}\n`;
            reportContent += `   Tipo: ${user.type}\n`;
            reportContent += `   Identificador: ${user.identifier}\n`;
            reportContent += `   Documento: ${user.document}\n`;
            if (user.note) {
              reportContent += `   Nota: ${user.note}\n`;
            }
            reportContent += '\n';
          });
        }

        // Duplicate users
        if (importReport.duplicates.length > 0) {
          reportContent += '-'.repeat(80) + '\n';
          reportContent += `USUARIOS DUPLICADOS (${importReport.duplicates.length})\n`;
          reportContent += '-'.repeat(80) + '\n';
          reportContent += 'Estos usuarios tienen el mismo identificador (NIA o documento).\n';
          reportContent += 'Se prioriza la importación del usuario que tiene grupo asignado.\n\n';

          importReport.duplicates.forEach((dup, index) => {
            reportContent += `${index + 1}. ${dup.identifier}\n`;
            reportContent += `   Tipo: ${dup.type}\n`;
            if (dup.allNames) {
              reportContent += `   Nombres encontrados: ${dup.allNames}\n`;
              if (dup.occurrencesCount) {
                reportContent += `   Ocurrencias: ${dup.occurrencesCount}\n`;
              }
            } else {
              reportContent += `   Primer usuario: ${dup.firstUser}\n`;
              if (dup.duplicateUser) {
                reportContent += `   Usuario duplicado: ${dup.duplicateUser}\n`;
              }
            }
            if (dup.allGroups) {
              reportContent += `   Grupos encontrados: ${dup.allGroups}\n`;
            }
            reportContent += `   Grupo importado: ${dup.group}\n`;
            if (dup.note) {
              reportContent += `   Nota: ${dup.note}\n`;
            }
            reportContent += '\n';
          });
        }

        reportContent += '='.repeat(80) + '\n';
        reportContent += 'FIN DEL INFORME\n';
        reportContent += '='.repeat(80) + '\n';

        fs.writeFileSync(reportLogPath, reportContent, 'utf8');
        logger.success(`Import report saved: ${reportLogPath}`);
      }

      // Progress: 80%
      getMainWindow()?.webContents.send('progress', {
        percentage: 80,
        message: 'Configurando vigilancia de carpetas...',
        details: ''
      });

      // Initialize image manager
      logger.section('INITIALIZING MANAGERS');
      state.imageManager = new ImageManager(importsPath);
      logger.info('Image manager initialized');

      await startIngestWatcher(ingestContext);

      // Progress: 100%
      getMainWindow()?.webContents.send('progress', {
        percentage: 100,
        message: 'Proyecto creado exitosamente',
        details: `${totalUsers} usuarios importados`
      });

      logger.section('PROJECT CREATION COMPLETED');
      logger.success('Project created successfully', {
        totalGroups,
        totalUsers,
        projectPath: folderPath
      });

      // Add to recent projects
      addRecentProject(folderPath);

      // Update window title
      updateWindowTitle();

      // Show import report dialog if there are issues
      if (importReport.withoutIdentifier.length > 0 || importReport.withoutGroup.length > 0 || importReport.duplicates.length > 0) {
        let reportMessage = `Se han importado ${importReport.imported} usuarios correctamente.\n\n`;

        if (importReport.withoutIdentifier.length > 0) {
          reportMessage += `⚠ ${importReport.withoutIdentifier.length} usuarios sin identificador (NO importados)\n`;
        }
        if (importReport.withoutGroup.length > 0) {
          reportMessage += `⚠ ${importReport.withoutGroup.length} usuarios sin grupo\n`;
        }
        if (importReport.duplicates.length > 0) {
          reportMessage += `⚠ ${importReport.duplicates.length} usuarios duplicados (se importó una sola vez cada uno, dando prioridad al que tiene grupo)\n`;
        }

        reportMessage += `\nConsulte el archivo 'import-report.log' en la carpeta del proyecto para más detalles.`;

        showAppMessage(getMainWindow(), {
          title: 'Informe de importación',
          message: 'Proyecto creado con advertencias.',
          detail: reportMessage
        });
      }

      return {
        success: true,
        message: 'Proyecto creado exitosamente',
        project: {
          folderPath: folderPath,
          xmlFilePath: xmlPath,
          ingestFolderPath: ingestPath,
          importsFolderPath: importsPath
        },
        importReport: {
          imported: importReport.imported,
          withoutIdentifier: importReport.withoutIdentifier.length,
          withoutGroup: importReport.withoutGroup.length,
          duplicates: importReport.duplicates.length
        },
        users: await state.dbManager.getUsers(),
        groups: await state.dbManager.getGroups()
      };
    } catch (error) {
      logger.error('Error creating project', error);
      return { success: false, error: error.message };
    }
  });

  // Open existing project
  ipcMain.handle('open-project', async (event, folderPath) => {
    try {
      // Initialize logger for this project
      logger.initialize(folderPath);
      logger.section('OPENING EXISTING PROJECT');
      logger.info('Project folder selected', { folderPath });

      if (!fs.existsSync(folderPath)) {
        throw new Error('La carpeta del proyecto no existe');
      }

      // Release the previous project before taking over its globals
      await closeCurrentProject();

      state.projectPath = folderPath;
      const dataPath = path.join(folderPath, 'data');
      const dbPath = path.join(dataPath, 'users.db');

      logger.info('Validating project structure...');
      if (!fs.existsSync(dbPath)) {
        throw new Error('No se encontró la base de datos del proyecto');
      }
      logger.success('Project structure validated');

      // Initialize database
      logger.section('LOADING DATABASE');
      logger.info(`Database path: ${dbPath}`);
      state.dbManager = new DatabaseManager(dbPath);
      await state.dbManager.initialize();
      logger.success('Database loaded successfully');

      const importsPath = path.join(folderPath, 'imports');

      // Initialize image manager
      logger.section('INITIALIZING MANAGERS');
      state.imageManager = new ImageManager(importsPath);
      logger.info('Image manager initialized');

      await startIngestWatcher(ingestContext);

      logger.section('PROJECT OPENED SUCCESSFULLY');
      logger.success('Project loaded', { projectPath: folderPath });

      // Add to recent projects
      addRecentProject(folderPath);

      // Update window title
      updateWindowTitle();

      // Same as the recent-project path: without this the repository mirror
      // never starts here, leaving repository indicators empty until something
      // else happens to trigger it
      await ensureRepositoryMirrorStarted();

      return { success: true, message: 'Proyecto abierto exitosamente' };
    } catch (error) {
      logger.error('Error opening project', error);
      return { success: false, error: error.message };
    }
  });

  // Update XML file
  ipcMain.handle('update-xml', async (event, xmlPath) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      logger.section('UPDATING XML FILE');
      logger.info(`New XML file: ${xmlPath}`);

      // Validate XML path
      if (!fs.existsSync(xmlPath)) {
        throw new Error('El archivo XML no existe');
      }

      // Progress: 10%
      getMainWindow()?.webContents.send('progress', {
        percentage: 10,
        message: 'Leyendo archivo XML...',
        details: xmlPath
      });

      // Parse new XML file
      const xmlParser = new XMLParser(xmlPath);
      const newData = await xmlParser.parse();

      const totalNewUsers = newData.students.length + newData.teachers.length + newData.nonTeachingStaff.length;
      logger.success('XML parsed successfully', {
        groups: newData.groups.length,
        students: newData.students.length,
        teachers: newData.teachers.length,
        nonTeachingStaff: newData.nonTeachingStaff.length,
        totalUsers: totalNewUsers
      });

      // Progress: 30%
      getMainWindow()?.webContents.send('progress', {
        percentage: 30,
        message: 'Comparando usuarios actuales...',
        details: ''
      });

      // Get current users from database
      const currentUsers = await state.dbManager.getUsers({});
      logger.info(`Current users in database: ${currentUsers.length}`);

      // Prepare new users map by identifier (NIA for students, document for others)
      const newUsersMap = new Map();

      // Add students (identified by NIA)
      newData.students.forEach(student => {
        if (student.nia) {
          newUsersMap.set(`student_${identifierKey(student.nia)}`, {
            type: 'student',
            identifier: student.nia,
            ...student
          });
        }
      });

      // Add teachers (identified by document)
      newData.teachers.forEach(teacher => {
        if (teacher.document) {
          newUsersMap.set(`teacher_${identifierKey(teacher.document)}`, {
            type: 'teacher',
            identifier: teacher.document,
            ...teacher
          });
        }
      });

      // Add non-teaching staff (identified by document)
      newData.nonTeachingStaff.forEach(staff => {
        if (staff.document) {
          newUsersMap.set(`non_teaching_staff_${identifierKey(staff.document)}`, {
            type: 'non_teaching_staff',
            identifier: staff.document,
            ...staff
          });
        }
      });

      // Compare and categorize changes
      const changes = {
        toAdd: [],
        toUpdate: [],
        toDelete: []
      };

      // Check for users to add or update
      for (const [key, newUser] of newUsersMap) {
        const existingUser = currentUsers.find(u => {
          if (u.type === 'student' && newUser.type === 'student') {
            return identifierKey(u.nia) === identifierKey(newUser.nia);
          } else if (u.type !== 'student' && newUser.type !== 'student') {
            return identifierKey(u.document) === identifierKey(newUser.document);
          }
          return false;
        });

        if (existingUser) {
          // User exists - always add to toUpdate (will be marked as updated or skipped in application phase)
          changes.toUpdate.push({
            id: existingUser.id,
            old: existingUser,
            new: newUser
          });
        } else {
          // New user
          changes.toAdd.push(newUser);
        }
      }

      // Check for users to delete (not in new XML)
      for (const currentUser of currentUsers) {
        const key = currentUser.type === 'student'
          ? `student_${identifierKey(currentUser.nia)}`
          : `${currentUser.type}_${identifierKey(currentUser.document)}`;

        if (!newUsersMap.has(key)) {
          changes.toDelete.push(currentUser);
        }
      }

      logger.info('Changes summary', {
        toAdd: changes.toAdd.length,
        toUpdate: changes.toUpdate.length,
        toDelete: changes.toDelete.length
      });

      // Progress: 50%
      getMainWindow()?.webContents.send('progress', {
        percentage: 50,
        message: 'Análisis completado',
        details: `${changes.toAdd.length} nuevos, ${changes.toUpdate.length} actualizados, ${changes.toDelete.length} eliminados`
      });

      // Return summary for confirmation
      return {
        success: true,
        needsConfirmation: true,
        changes: {
          toAdd: changes.toAdd.length,
          toUpdate: changes.toUpdate.length,
          toDelete: changes.toDelete.length,
          toDeleteWithImage: changes.toDelete.filter(u => u.image_path).length,
          toDeleteWithoutImage: changes.toDelete.filter(u => !u.image_path).length
        },
        groups: newData.groups,
        newUsersMap: Array.from(newUsersMap.entries()),
        deletedUsers: changes.toDelete,
        currentUsers: currentUsers, // Pass current users to avoid reloading
        // Handed back on confirmation, which is when it becomes the project's XML
        xmlPath,
        // An XML from another course usually means the new course's roll
        // applied over last year's project, which a new project should get
        academicYear: {
          current: parseAcademicYear(await state.dbManager.getProjectSetting('academicYear')),
          incoming: newData.academicYear
        }
      };
    } catch (error) {
      logger.error('Error analyzing XML update', error);
      return { success: false, error: error.message };
    }
  });

  // Confirm and apply XML update
  ipcMain.handle('confirm-update-xml', async (event, data) => {
    try {
      if (!state.dbManager) {
        throw new Error('No hay ningún proyecto abierto');
      }

      const { groups, newUsersMap, deletedUsers, currentUsers, xmlPath, academicYear } = data;

      logger.section('APPLYING XML UPDATE');

      // Progress: 60%
      getMainWindow()?.webContents.send('progress', {
        percentage: 60,
        message: 'Actualizando grupos...',
        details: ''
      });

      // Update groups
      logger.info('Updating groups...');
      await state.dbManager.importUsers({ groups, students: [], teachers: [], nonTeachingStaff: [] });
      logger.success(`Groups updated: ${groups.length}`);

      // Progress: 70%
      getMainWindow()?.webContents.send('progress', {
        percentage: 70,
        message: 'Procesando usuarios eliminados...',
        details: ''
      });

      // Process deleted users
      const deletedGroup = await context.ensureDeletedGroup();
      let movedToDeleted = 0;
      let permanentlyDeleted = 0;

      for (const user of deletedUsers) {
        if (user.image_path) {
          // Move to Eliminados group
          await state.dbManager.updateUser(user.id, { group_code: deletedGroup.code });
          movedToDeleted++;
          logger.info(`Moved user ${user.first_name} ${user.last_name1} to Eliminados group`);
        } else {
          // Delete from database
          await state.dbManager.deleteUser(user.id);
          permanentlyDeleted++;
          logger.info(`Deleted user ${user.first_name} ${user.last_name1} from database`);
        }
      }

      logger.success(`Processed deleted users: ${movedToDeleted} moved to Eliminados, ${permanentlyDeleted} permanently deleted`);

      // Progress: 80%
      getMainWindow()?.webContents.send('progress', {
        percentage: 80,
        message: 'Actualizando y agregando usuarios...',
        details: ''
      });

      // Process updates and additions
      // Note: We use the original currentUsers from the update-xml handler analysis
      logger.info(`Converting newUsersMap array to Map...`);
      const usersToProcess = new Map(newUsersMap);
      let updated = 0;
      let added = 0;
      let skipped = 0;

      // Gathered while walking the XML and imported together afterwards
      const usersToAdd = [];

      logger.info(`Processing ${usersToProcess.size} users from XML`);
      logger.info(`Current users in database (from snapshot): ${currentUsers.length}`);

      for (const [key, newUser] of usersToProcess) {
        // Find if user existed in original database (before deletions)
        const existingUser = currentUsers.find(u => {
          if (newUser.type === 'student') {
            return u.type === 'student' && identifierKey(u.nia) === identifierKey(newUser.nia);
          } else {
            // For teachers and non_teaching_staff, match by document and type
            return u.type === newUser.type && identifierKey(u.document) === identifierKey(newUser.document);
          }
        });

        if (existingUser) {
          // Check if this user actually needs updating
          const needsUpdate =
            existingUser.first_name !== newUser.first_name ||
            existingUser.last_name1 !== newUser.last_name1 ||
            existingUser.last_name2 !== newUser.last_name2 ||
            existingUser.birth_date !== newUser.birth_date ||
            existingUser.document !== newUser.document ||
            // Restores the leading zeros an older import dropped
            (newUser.type === 'student' && String(existingUser.nia) !== String(newUser.nia)) ||
            existingUser.group_code !== newUser.group_code;

          if (needsUpdate) {
            // Determine final group_code based on user type
            let finalGroupCode;
            if (newUser.group_code && newUser.group_code !== '') {
              // User has a group in the XML
              finalGroupCode = newUser.group_code;
            } else {
              // No group in XML - assign default based on type
              if (newUser.type === 'student') {
                finalGroupCode = 'SIN_GRUPO';
              } else if (newUser.type === 'teacher') {
                finalGroupCode = 'DOCENTES';
              } else if (newUser.type === 'non_teaching_staff') {
                finalGroupCode = 'NO_DOCENTES';
              } else {
                finalGroupCode = 'SIN_GRUPO'; // Fallback
              }
            }

            // Update existing user (including those moved to Eliminados)
            await state.dbManager.updateUser(existingUser.id, {
              first_name: newUser.first_name,
              last_name1: newUser.last_name1,
              last_name2: newUser.last_name2,
              birth_date: newUser.birth_date,
              document: newUser.document,
              group_code: finalGroupCode,
              nia: newUser.nia
            });
            updated++;
            logger.info(`Updated user ${newUser.first_name} ${newUser.last_name1} (ID: ${existingUser.id})`);
          } else {
            // User exists but no changes needed
            skipped++;
          }
        } else {
          // This is a completely new user - collect them, see below
          logger.info(`Adding new user: ${newUser.first_name} ${newUser.last_name1} (type: ${newUser.type})`);
          usersToAdd.push(newUser);
        }
      }

      // Imported in one go rather than one call per user. Each importUsers call
      // opens its own transaction and re-inserts every group, so adding a
      // hundred users used to mean a hundred commits.
      if (usersToAdd.length > 0) {
        await state.dbManager.importUsers({
          groups: [],
          students: usersToAdd.filter(user => user.type === 'student'),
          teachers: usersToAdd.filter(user => user.type === 'teacher'),
          nonTeachingStaff: usersToAdd.filter(user => user.type === 'non_teaching_staff')
        });

        added = usersToAdd.length;
        logger.success(`Added ${added} new users`);
      }

      logger.success(`Users processed: ${updated} updated, ${added} added, ${skipped} skipped (no changes)`);

      // Calculate total processed (updated + skipped)
      const totalProcessed = updated + skipped;

      // Progress: 100%
      getMainWindow()?.webContents.send('progress', {
        percentage: 100,
        message: 'Actualización completada',
        details: `${added} añadidos, ${totalProcessed} actualizados, ${movedToDeleted} movidos a Eliminados, ${permanentlyDeleted} eliminados`
      });

      logger.section('XML UPDATE COMPLETED');
      logger.success('XML update completed successfully');
      notifyGroupCoverage();

      // Only now is this the file the users came from. Recording it on
      // analysis showed a file that was missing, unreadable or never applied.
      if (xmlPath) {
        await state.dbManager.setProjectSetting('xmlFilePath', xmlPath);
      }

      // Shared with the other teams through the repository. Never stops the
      // update: what happened goes back to the renderer, which mentions it.
      let sharedXml = { status: 'not-applied' };
      if (xmlPath) {
        try {
          await recordAppliedXml(state.dbManager, fs.readFileSync(xmlPath));
          sharedXml = await publishAppliedXml({
            dbManager: state.dbManager,
            repositoryPath: await getImageRepositoryPath(state.dbManager),
            xmlPath
          });
        } catch (error) {
          sharedXml = { status: 'failed', error: error.message };
        }
        if (sharedXml.status === 'published') {
          logger.success(`School XML published to the repository as ${sharedXml.fileName}`);
        } else {
          logger.info(`School XML not published: ${sharedXml.status}`, sharedXml.error ? { error: sharedXml.error } : undefined);
        }
      }

      // The course follows the roll. An XML without one leaves it as it was.
      const incomingYear = parseAcademicYear(academicYear);
      if (incomingYear) {
        await state.dbManager.setProjectSetting('academicYear', String(incomingYear));
      }

      // Generate updated import report
      try {
        const allUsers = await state.dbManager.getUsers({});
        const reportLogPath = path.join(state.projectPath, 'import-report.log');

        // Analyze current users for report
        const usersWithoutGroup = allUsers.filter(u =>
          u.type === 'student' && (!u.group_code || u.group_code === 'SIN_GRUPO')
        );

        let reportContent = '='.repeat(80) + '\n';
        reportContent += 'INFORME DE IMPORTACIÓN DE USUARIOS\n';
        reportContent += '='.repeat(80) + '\n\n';
        reportContent += `Fecha: ${new Date().toLocaleString('es-ES')}\n`;
        reportContent += `Total de usuarios importados: ${allUsers.length}\n\n`;

        // Users without group
        if (usersWithoutGroup.length > 0) {
          reportContent += '-'.repeat(80) + '\n';
          reportContent += `USUARIOS SIN GRUPO (${usersWithoutGroup.length})\n`;
          reportContent += '-'.repeat(80) + '\n';
          reportContent += 'Estos usuarios se han importado pero no tienen grupo asignado.\n\n';

          usersWithoutGroup.forEach((user, index) => {
            reportContent += `${index + 1}. ${user.first_name} ${user.last_name1} ${user.last_name2 || ''}\n`;
            reportContent += `   Tipo: Estudiante\n`;
            reportContent += `   Identificador: NIA: ${user.nia}\n`;
            reportContent += `   Documento: ${user.document || 'Sin documento'}\n`;
            reportContent += `   Nota: No existen grupos asignados\n\n`;
          });
        }

        reportContent += '='.repeat(80) + '\n';
        reportContent += 'FIN DEL INFORME\n';
        reportContent += '='.repeat(80) + '\n';

        fs.writeFileSync(reportLogPath, reportContent, 'utf8');
        logger.success(`Import report updated: ${reportLogPath}`);
      } catch (reportError) {
        logger.error('Error generating import report', reportError);
        // Don't fail the whole operation if report generation fails
      }

      return {
        success: true,
        results: {
          added,
          updated: totalProcessed,
          movedToDeleted,
          permanentlyDeleted
        },
        sharedXml
      };
    } catch (error) {
      logger.error('Error applying XML update', error);
      // It may have stopped halfway, with some users already changed
      notifyGroupCoverage();
      return { success: false, error: error.message };
    }
  });

  // Is there a more recent school XML in the repository's Centro folder?
  // (docs/XML_COMPARTIDO_PLAN.md, 3.3). Never applies anything: the renderer
  // shows a notice and the update goes through the usual analysis.
  ipcMain.handle('check-shared-xml', async () => {
    try {
      if (!state.dbManager || !state.projectPath) {
        return { success: false, error: 'No hay ningún proyecto abierto' };
      }

      const repositoryPath = await getImageRepositoryPath(state.dbManager);
      if (!repositoryPath) {
        return { success: true, newer: null, reason: 'no-repository' };
      }

      const applied = await getAppliedXml(state.dbManager);
      const academicYear = parseAcademicYear(await state.dbManager.getProjectSetting('academicYear'))
        || academicYearOn(new Date());

      // Anything that changes the answer starts a new minute
      const key = [state.projectPath, repositoryPath, applied ? applied.hash : '', academicYear].join('|');
      const cached = state.sharedXmlCheck;
      if (cached && cached.key === key && Date.now() - cached.at < SHARED_XML_CHECK_INTERVAL) {
        return cached.result;
      }

      let result;
      if (!fs.existsSync(repositoryPath)) {
        result = { success: true, newer: null, reason: 'repository-unavailable' };
      } else {
        // Projects from before 1.25 never recorded what they applied: compare
        // with the file they last read, if it is still there
        let currentHash = null;
        if (!applied) {
          const xmlPath = await state.dbManager.getProjectSetting('xmlFilePath');
          try {
            if (xmlPath) currentHash = hashXml(fs.readFileSync(xmlPath));
          } catch {
            // Gone: anything published counts as different
          }
        }
        const newer = await findNewerXml({ repositoryPath, academicYear, applied, currentHash });
        result = { success: true, newer };
        if (newer) {
          logger.info(`A more recent school XML is in the repository: ${newer.fileName}`);
        }
      }

      state.sharedXmlCheck = { key, at: Date.now(), result };
      return result;
    } catch (error) {
      logger.error('Error checking the shared school XML', error);
      return { success: false, error: error.message };
    }
  });

  // Close project
  ipcMain.handle('close-project', async () => {
    try {
      logger.info('Closing project');

      await closeCurrentProject();

      // Update window title to default (without project name)
      updateWindowTitle();

      logger.info('Project closed successfully');

      // Flush and release the project's log file, so the folder is not left
      // with an open handle once the project is no longer in use
      await logger.close();

      return { success: true };
    } catch (error) {
      logger.error('Error closing project', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerProjectHandlers };