'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listAssets: () => ipcRenderer.invoke('assets:list'),
  getVersionInfo: () => ipcRenderer.invoke('app:getVersionInfo'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  listLanguages: () => ipcRenderer.invoke('i18n:list'),
  getStrings: (lang) => ipcRenderer.invoke('i18n:get', lang),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  importImage: (srcPath) => ipcRenderer.invoke('image:import', srcPath),
  deleteImage: (name) => ipcRenderer.invoke('image:delete', name),
  launch: (url) => ipcRenderer.invoke('game:launch', url),
  openLauncherDir: () => ipcRenderer.invoke('app:openLauncherDir'),
  openImagesDir: () => ipcRenderer.invoke('app:openImagesDir'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
});
