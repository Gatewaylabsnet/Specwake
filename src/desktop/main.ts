import { app, BrowserWindow, dialog, Menu, session } from 'electron';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { startStudio } from '../studio/server.js';
import { desktopWebPreferences, isDesktopUrl } from './policy.js';
import { desktopSelfTest } from './self-test.js';

const selfTestIndex = process.argv.indexOf('--self-test');
const reportPath = selfTestIndex >= 0 ? process.argv[selfTestIndex+1] : undefined;
if (reportPath && !requireAbsolute(reportPath)) app.exit(1);
function requireAbsolute(path: string) {return resolve(path) === path;}
let studio: Awaited<ReturnType<typeof startStudio>> | undefined;
let window: BrowserWindow | undefined;
let closing = false;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',() => {if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('window-all-closed',() => app.quit());
  app.on('before-quit',event => {
    if (!studio || closing) return;
    event.preventDefault();closing=true;
    void studio.close().finally(() => app.quit());
  });
  void app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const root = app.getAppPath();
    const tempRoot = join(app.getPath('temp'),'Specwake');
    const runtimeRoot = root.endsWith('.asar') ? root+'.unpacked' : root;
    studio = await startStudio(0,{root,runtimeRoot,tempRoot,runtimeEnv:{ELECTRON_RUN_AS_NODE:'1'}});
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details,callback) => {
      callback({cancel:!isDesktopUrl(details.url,studio!.origin) && !details.url.startsWith('blob:'+studio!.origin+'/')});
    });
    window = new BrowserWindow({
      title:'Specwake',width:1320,height:900,minWidth:820,minHeight:640,
      backgroundColor:'#f5f7fa',show:false,icon:resolve(root,'build/icon.png'),autoHideMenuBar:true,
      webPreferences:desktopWebPreferences
    });
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate',(event,url) => {if(!isDesktopUrl(url,studio!.origin))event.preventDefault();});
    window.webContents.on('will-attach-webview',event => event.preventDefault());
    await window.loadURL(studio.origin);
    if (reportPath) {
      await desktopSelfTest(studio.origin,reportPath,root);
      await writeFile(reportPath.replace(/\.json$/i,'')+'.png',(await window.webContents.capturePage()).toPNG());
      app.quit();
    } else window.show();
  }).catch(async () => {
    if (reportPath) {
      await mkdir(resolve(reportPath,'..'),{recursive:true});
      await writeFile(reportPath,JSON.stringify({passed:false,error:'Packaged desktop verification failed.'}));
    } else dialog.showErrorBox('Specwake could not start','Close Specwake and try again. If the problem continues, rebuild or reinstall the application.');
    await studio?.close();studio=undefined;app.exit(1);
  });
}
