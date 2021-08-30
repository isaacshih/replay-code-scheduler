const { google } = require('googleapis')

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function authorize() {
    return new Promise(resolve => {
        const jwtClient = new google.auth.JWT(
            process.env.GOOGLE_CLIENT_EMAIL,
            null,
            process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 
            SCOPES
        );

        jwtClient.authorize(() => resolve(jwtClient));
    });
}

module.exports = {
    authorize,
}