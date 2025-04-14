const { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
import icon from '../../resources/icon.png?asset'
import { join } from 'path'
import {  is } from '@electron-toolkit/utils'

let mainWindow = null;
let popupWindow = null;
let tray = null;
let totalSeconds = 0;
let timerInterval = null;
let timeDisplay = 0;
let app_name = null
let n_pid = null
function createWindow() {
    mainWindow = new BrowserWindow({

        width: 800,
        height: 600,
        show: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/index.js'),
            sandbox: false,
        },
    });


    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
   // mainWindow.setMenu(null)
  
   // mainWindow.webContents.openDevTools(); 
    mainWindow.on('close', (e) => {
        if (!app.isQuiting) {
            e.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

function showMainWindow() {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
}

function createPopUp() {
    if (popupWindow) return;
    const cursorPosition = screen.getCursorScreenPoint();
    const distractedDisplay = screen.getDisplayNearestPoint(cursorPosition);


    const { x, y, width, height } = distractedDisplay.workArea;

    const popupWidth = 600;
    const popupHeight = 600;

    const popupX = x + (width - popupWidth) / 2;
    const popupY = y + (height - popupHeight) / 2;


    popupWindow = new BrowserWindow({
        width: popupWidth,
        height: popupHeight,
        x: Math.round(popupX),
        y: Math.round(popupY),
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      popupWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/popup.html')
    } else {
      popupWindow.loadFile(join(__dirname, '../renderer/popup.html'))
    }

    popupWindow.on('closed', () => {
        popupWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();
    ipcMain.on('show-popup-message', (event, appName, pid) => {
        console.log("pid", pid,"appName", appName)
        app_name = appName
        n_pid = pid
      createPopUp()
    });
   
    tray = new Tray(icon);
    const trayMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => showMainWindow() },
        {
            label: 'Quit', click: () => {
                app.isQuiting = true;
                if (mainWindow) {
                    mainWindow.close();
                }
                app.quit()
            }
        },
    ]);

    tray.setContextMenu(trayMenu);
    tray.setToolTip('Focusbook');

    tray.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
    globalShortcut.register('CommandOrControl+o', () => {
        showMainWindow();
    });

    globalShortcut.register('CommandOrControl+q', () => {
        app.isQuiting = true
        if (mainWindow) {
            mainWindow.close();
        }
        app.quit()
    });

});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
app.on('window-all-closed', (e) => {
    if (process.platform !== 'darwin') {
        e.preventDefault();
   
    }
});

ipcMain.on('stay-focused', (event,data) => {
    if (popupWindow) {
        popupWindow.close();
        popupWindow = null;
        if (!app_name.endsWith('.exe')) {
            const pythonProcess = spawn('python', ['closeTab.py', n_pid, app_name]);
            pythonProcess.stdout.on('data', (data) => {
                //const result = JSON.parse(data.toString());
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error('Python script error:', data.toString());
            });
        } else {
            exec(`taskkill /IM ${app_name} /F`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error closing app: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Error: ${stderr}`);
                    return;
                }
                console.log(`App closed: ${stdout}`);
            });
        }
    }
});
// app.on('activate', () => {
//     if (mainWindow && !mainWindow.isVisible()) {
//         mainWindow.show();
//     } else if (!mainWindow) {
//         createWindow();
//     }
// });
ipcMain.on('cooldown', (event) => {
    if (popupWindow) {
        popupWindow.close();
        popupWindow = null;
        if (mainWindow) {
            mainWindow.webContents.send('cooldown');
        }
    }
});

ipcMain.on('dismiss', (event) => {

    if (popupWindow) {
        if (mainWindow) {
            console.log("dismess index")
            mainWindow.webContents.send('dismiss', app_name);
        }
        popupWindow.close();
        popupWindow = null;
    }
});


ipcMain.on('categoriesUpdated', (event, catTags) => {

    console.log(catTags)
    const data  = JSON.stringify(catTags, null , 4)
    fs.writeFileSync('Distractedcat.json', data, (err)=>{
        console.log("error writing file", err)
    })
});


function formatTime(elapsedTime) {
    const hours = Math.floor(elapsedTime / (1000 * 60 * 60));
    const minutes = Math.floor((elapsedTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsedTime % (1000 * 60)) / 1000);

    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return  timeString;

  }
  
ipcMain.on('start-focus', (event, isFocused) => {
    timerInterval = setInterval(() => {
        totalSeconds++;
        timeDisplay = totalSeconds;
        mainWindow.webContents.send('start-focus', isFocused,timeDisplay);

      }, 1500);
});

ipcMain.on('end-focus',(event, isFocused)=>{
    mainWindow.webContents.send('end-focus',isFocused)

})