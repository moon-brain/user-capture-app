// @ts-check
/**
 * Recent projects management utilities
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Get path to recent projects file
 * @returns {string} Path to recent-projects.json
 */
function getRecentProjectsPath() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

/**
 * Load recent projects from file
 * @returns {string[]} Array of project paths
 */
function loadRecentProjects() {
  try {
    const filePath = getRecentProjectsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      let projects = JSON.parse(data);

      // Validate that projects still exist
      projects = projects.filter(projectPath => {
        return fs.existsSync(projectPath) && fs.existsSync(path.join(projectPath, 'data', 'users.db'));
      });

      return projects;
    }
  } catch (error) {
    console.error('Error loading recent projects:', error);
  }
  return [];
}

/**
 * Save recent projects to file
 * @param {string[]} projects - Array of project paths
 * @returns {boolean} Success status
 */
function saveRecentProjects(projects) {
  try {
    const filePath = getRecentProjectsPath();
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving recent projects:', error);
    return false;
  }
}

/**
 * Add a project to recent projects list
 * @param {string} projectPath - Path to project
 * @param {string[]} currentProjects - Current list of recent projects
 * @returns {string[]} Updated list of recent projects
 */
function addRecentProject(projectPath, currentProjects = []) {
  // Remove if already exists
  let projects = currentProjects.filter(p => p !== projectPath);

  // Add to beginning
  projects.unshift(projectPath);

  // Keep only last 5
  projects = projects.slice(0, 5);

  return projects;
}

module.exports = {
  getRecentProjectsPath,
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject
};