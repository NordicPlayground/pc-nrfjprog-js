#!/usr/bin/env node

/* Copyright (c) 2015 - 2019, Nordic Semiconductor ASA
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

'use strict';

if (process.platform !== 'win32') {
    console.log(`Unsupported platform: '${platform}', you need to visit https://www.segger.com/downloads/jlink`);
    process.exit();
}

const commander = require('commander');
const axios = require('axios');
const fs = require('fs');
const sander = require('sander');
const path = require('path');
const sudo = require('sudo-prompt');
const regedit = require('regedit');
const { version, nrfjprog } = require('../package.json');

commander
    .version(version)
    .usage('Utility to download and/or execute the J-Link installer.')
    .option('-l, --list', 'only list the installed versions and the required version')
    .option('-o, --output-dir <path>', 'destination directory, cwd othewise')
    .option('-i, --install', 'execute the installer')
    .parse(process.argv);

const minVersion = nrfjprog.jlink;
const filename = `JLink_Windows_${minVersion}.exe`;
const fileUrl = `https://github.com/NordicSemiconductor/pc-nrfjprog-js/releases/download/nrfjprog/${filename}`;
const destinationFile = path.join(commander.outputDir || process.cwd(), filename);

function getCurrentJLinkVersion() {
    return new Promise(resolve => {
        const reg = 'HKCU\\Software\\SEGGER\\J-Link';
        regedit.list(reg, (err, result) => {
            if (err) {
                return resolve();
            }
            const versions = (result[reg].keys || []).sort();
            console.log('Currently installed J-Link versions:', versions.join(' '));
            return resolve(versions.pop());
        });
    });
}

async function downloadFile() {
    console.log('Downloading', fileUrl);
    const response = await axios.get(
        fileUrl,
        { responseType: 'stream' },
    );
    const statusCode = response.status;
    if (statusCode !== 200) {
        throw new Error(`Unable to download ${fileUrl}. ` +
            `Got status code ${statusCode}`);
    }
    console.log('Saving', destinationFile);
    await sander.mkdir(path.dirname(destinationFile));
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destinationFile);
        response.data.pipe(file);
        response.data.on('error', reject);
        response.data.on('end', () => {
            file.end();
            resolve();
        });
    });
}

function installJLink() {
    return new Promise(resolve => (
        const options = { name: 'JLink installer' };
        sudo.exec(destinationFile, options, (error, stdout, stderr) => {
            if (error) throw error;
            console.log(stdout);
            resolve();
        })
    ));
}

Promise.resolve()
    .then(() => getCurrentJLinkVersion())
    .then(currentVersion => {
        console.log('Minimum version required:', minVersion);
        if (currentVersion >= minVersion || commander.list) {
            process.exit();
        }
    })
    .then(() => downloadFile(fileUrl))
    .then(() => commander.install && installJLink())
    .then(process.exit);
