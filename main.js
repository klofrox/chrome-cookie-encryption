const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const browser = "chrome"; 
const debugPort = 9222;

const localAppData = process.env.LOCALAPPDATA;
const appData = process.env.APPDATA;
const programFiles = process.env.PROGRAMFILES;
const programFilesX86 = path.join('C:', 'Program Files (x86)');

const configs = {
    "chrome": {
        bin: path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        userData: path.join(localAppData, 'Google', 'Chrome', 'User Data')
    },
};

async function startBrowser() {
    const config = configs[browser];
    const command = `"${config.bin}"`;
    const args = [
        `--remote-debugging-port=${debugPort}`,
        `--remote-allow-origins=*`,
        '--headless',
        `--user-data-dir="${config.userData}"`
    ];
    const browserProcess = spawn(command, args, { shell: true })
    browserProcess.on('close', (code) => {
        console.log(`Browser process exited with code ${code}`);
    });
    return browserProcess;
}

async function getDebugWsUrl() {
    const url = `http://localhost:${debugPort}/json`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0]?.webSocketDebuggerUrl || null;
}

async function getCookies(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            ws.send(JSON.stringify({
                method: 'Network.getAllCookies',
                id: 1
            }));
        });

        ws.on('message', (data) => {
            const response = JSON.parse(data);
            if (response.id === 1 && response.result) {
                resolve(response.result.cookies);
                ws.close();
            }
        });

        ws.on('error', (error) => {
            reject(`Error connecting to WebSocket: ${error.message}`);
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed');
        });
    });
}

async function saveCookiesToFile(cookies) {
    const filePath = 'cookies.txt';
    const cookieData = cookies.map(cookie => {
        const secure = cookie.secure ? 'TRUE' : 'FALSE';
        const expires = cookie.expires ? new Date(cookie.expires * 1000).toUTCString() : 'Session';
        return `${cookie.domain}\t${secure}\t${cookie.path}\tTRUE\t${expires}\t${cookie.name}\t${cookie.value}`;
    }).join('\n');

    fs.writeFileSync(filePath, cookieData);
}

async function killChrome() {
    return new Promise((resolve) => {
        const kill = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { shell: true });
        kill.on('close', () => {
            console.log('Chrome kapatıldı');
            // Chrome'un tamamen kapanması için 2 saniye bekleyelim
            setTimeout(resolve, 2000);
        });
    });
}

async function main() {
    try {
        await killChrome();
        
        const browserProcess = await startBrowser();
        // Chrome'un başlaması için 3 saniye bekleyelim
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const wsUrl = await getDebugWsUrl();
        if (!wsUrl) {
            console.log('Failed to connect to browser debug URL');
            return;
        }
        const cookies = await getCookies(wsUrl);
        await saveCookiesToFile(cookies);
        
        // Browser process'i kapatmak yerine killChrome() kullanarak tüm Chrome işlemlerini kapatalım
        await killChrome();
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
