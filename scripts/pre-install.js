/* Copyright (c) 2010 - 2017, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Use in source and binary forms, redistribution in binary form only, with
 * or without modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 2. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 3. This software, with or without modification, must only be used with a Nordic
 *    Semiconductor ASA integrated circuit.
 *
 * 4. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY NORDIC SEMICONDUCTOR ASA "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/*
 * nRF5x-Command-Line-Tools (nrfjprog) is required for programming. This script
 * downloads nrfjprog for the current platform.
 *
 * On Linux/macOS, the nrfjprog libraries will be placed in pc-nrfjprog-js's directory,
 * so that nodejs can find them. The script extracts
 * the nrfjprog tar file, and copies the libraries to the correct directory.
 *
 * In win32 platforms, this just downloads the the installer and logs a message
 * to tell the user they should run it.
 */

'use strict';

const https = require('https');
const tar = require('tar');
const fs = require('fs');
const sander = require('sander');
const os = require('os');
const path = require('path');
const opn = require('opn');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'nrfjprog');
const LIB_DIR = path.join(DOWNLOAD_DIR, 'lib');
const PLATFORM_CONFIG = {
    linux: {
        // See https://www.nordicsemi.com/eng/nordic/Products/nRF51822/nRF5x-Command-Line-Tools-Linux64/51386
        url: 'https://www.nordicsemi.com/eng/nordic/download_resource/51386/27/17243451/94917',
        destinationFile: path.join(DOWNLOAD_DIR, 'nrfjprog-linux64.tar'),
    },
    darwin: {
        // See https://www.nordicsemi.com/eng/nordic/Products/nRF51822/nRF5x-Command-Line-Tools-OSX/53402
        url: 'https://www.nordicsemi.com/eng/nordic/download_resource/53402/19/93375824/99977',
        destinationFile: path.join(DOWNLOAD_DIR, 'nrfjprog-darwin.tar'),
    },
    win32: {
        // See https://www.nordicsemi.com/eng/nordic/Products/nRF51822/nRF5x-Command-Line-Tools-Win32/33444
        url: 'https://www.nordicsemi.com/eng/nordic/download_resource/33444/47/97153666/53210',
        destinationFile: path.join(DOWNLOAD_DIR, 'nrfjprog-win32.exe'),
    },
};

function downloadFile(url, destinationFile) {
    console.log(`Downloading nrfjprog from ${url} to ${destinationFile}...`);

    const destinationDir = path.dirname(destinationFile);
    return sander.mkdir(destinationDir)
        .then(() => new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destinationFile);
            https.get(url, response => {
                const statusCode = response.statusCode;
                if (statusCode !== 200) {
                    reject(new Error(`Unable to download ${url}. Got status code ${statusCode}`));
                } else {
                    response.pipe(file);
                    response.on('end', () => {
                        file.end();
                        resolve();
                    });
                }
            });
        }));
}

function extractTarFile(filePath, outputDir) {
    return sander.mkdir(outputDir)
        .then(() => tar.extract({
            file: filePath,
            filter: f => f.match(/\.so|\.dylib$|\.h$/),
            strip: 2,
            keep: true,
            cwd: outputDir,
        }));
}

function getLibraryVersion() {
    return new Promise((resolve, reject) => {
        try {
            // eslint-disable-next-line global-require
            const nrfjprog = require('..');
            nrfjprog.getLibraryVersion((err, version) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(version);
                }
            });
        } catch (ex) {
            reject(ex);
        }
    });
}

function isHeaderFileInstalledWin32() {
    const programFilesDir = process.env['ProgramFiles(x86)'];
    const headerFile = path.join(programFilesDir, 'Nordic Semiconductor', 'nrf5x', 'bin', 'headers', 'nrfjprog.h');
    try {
        fs.accessSync(headerFile);
        return true;
    } catch (ex) {
        return false;
    }
}

function installNrfjprog(pathToArtifact) {
    if (pathToArtifact.endsWith('.tar')) {
        console.log(`Extracting ${pathToArtifact} to ${LIB_DIR}...`);
        return extractTarFile(pathToArtifact, LIB_DIR);
    } else if (pathToArtifact.endsWith('.exe')) {
        console.log(`Running nrfjprog installer at ${pathToArtifact}...`);
        return opn(pathToArtifact);
    }
    return Promise.reject(new Error(`Unsupported nrfjprog artifact: ${pathToArtifact}`));
}

function removeFileIfExists(filePath) {
    if (sander.existsSync(filePath)) {
        return sander.unlink(filePath);
    }
    return Promise.resolve();
}

const platform = os.platform();
const platformConfig = PLATFORM_CONFIG[platform];

if (!platformConfig) {
    throw new Error(`Unsupported platform: '${platform}'. Cannot install nrfjprog libraries.`);
}

// Check if nrfjprog libraries are working or not
getLibraryVersion()
    .then(version => {
        console.log('Found nrfjprog libraries at version', version);
    })
    .catch(() => {
        // If we have nrfjprog header files on win32, then assume nrfjprog is installed.
        if (platform === 'win32' && isHeaderFileInstalledWin32()) {
            return Promise.resolve();
        }

        console.log('Could not find nrfjprog libraries. Trying to install.');

        let exitCode = 0;
        return downloadFile(platformConfig.url, platformConfig.destinationFile)
            .then(() => installNrfjprog(platformConfig.destinationFile))
            .catch(error => {
                exitCode = 1;
                console.log(`Error when installing nrfjprog libraries: ${error.message}`);
            })
            .then(() => removeFileIfExists(platformConfig.destinationFile))
            .catch(error => {
                exitCode = 1;
                console.log(`Unable to remove downloaded nrfjprog artifact: ${error.message}`);
            })
            .then(() => process.exit(exitCode));
    });