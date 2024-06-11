const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

async function loadSavedCredentialsIfExist(tokenPath) {
    try {
        const content = fs.readFileSync(tokenPath);
        return JSON.parse(content);
    } catch (err) {
        return null;
    }
}

async function saveCredentials(client, tokenPath) {
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: client._clientId,
        client_secret: client._clientSecret,
        refresh_token: client.credentials.refresh_token,
    });
    fs.writeFileSync(tokenPath, payload);
}

async function authorize(credentialsPath, tokenPath) {
    const { client_secret, client_id, redirect_uris } = JSON.parse(fs.readFileSync(credentialsPath)).installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const token = await loadSavedCredentialsIfExist(tokenPath);
    if (token) {
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
    }

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) return reject(err);
                oAuth2Client.setCredentials(token);
                saveCredentials(oAuth2Client, tokenPath);
                resolve(oAuth2Client);
            });
        });
    });
}

async function sendEmail(to, subject, message, credentialsPath, tokenPath = './token.json') {
    try {
        if (!fs.existsSync(tokenPath)) {
            await authorize(credentialsPath, tokenPath);
        }

        const auth = await authorize(credentialsPath, tokenPath);
        const gmail = google.gmail({ version: 'v1', auth });

        const email = [
            `To: ${to}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${subject}`,
            '',
            message,
        ].join('\n');

        const encodedMessage = Buffer.from(email)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
            },
        });

        return 'Email sent successfully!';
    } catch (error) {
        console.error(error);
        throw new Error('Error sending email');
    }
}

module.exports = sendEmail;
