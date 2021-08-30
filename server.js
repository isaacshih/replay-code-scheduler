'use strict';

const REVIEWS_PER_DAY = 4
const REVIEW_WAIT_TIME = 14

const express = require('express')
const exphbs = require('express-handlebars')

var app = express()

var hbs = exphbs.create({
    helpers: {
        if_eq: function (a, b, opts) {
            if (a === b)
                return opts.fn(this)
            else
                return opts.inverse(this)
        }
    }
})

app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

const { google } = require('googleapis')
const passport = require('passport')
const passportConfig = require('./config/passport-config')
const cookieSession = require('cookie-session')
const methodOverride = require('method-override')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

app.use(express.urlencoded({ extended: false }));

app.use(cookieSession({
    maxAge: 24 * 60 * 60 * 1000,
    keys: [process.env.COOKIE_KEY]
}))

app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))



app.set('port', 8081)

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/callback',
    passport.authenticate('google'),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
    });

app.get('/', async function (req, res) {

    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    const getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values
    let submissionList = []
    let scheduleList = []

    if (dataArray) {
        for (let i = 0; i < dataArray.length; i++) {
            if (!dataArray[i][7]) {
                continue
            }

            while (dataArray[i].length < 10) {
                dataArray[i].push('')
            }

            const submissionItem = {
                'id': dataArray[i][0],
                'user_id': dataArray[i][1],
                'name': dataArray[i][2],
                'code': dataArray[i][3],
                'sr': dataArray[i][4],
                'role': dataArray[i][5],
                'info': dataArray[i][6],
                'approved': dataArray[i][7],
                'scheduled': dataArray[i][8],
                'completed': dataArray[i][9]
            }

            if (!dataArray[i][7] || (dataArray[i][8] + dataArray[i][9])) {
                i = i
            } else {
                submissionList.push(submissionItem)
            }

            if (dataArray[i][8]) {
                if (scheduleList.length) {
                    if (scheduleList[scheduleList.length - 1].submissions.length < REVIEWS_PER_DAY) {
                        scheduleList[scheduleList.length - 1].submissions.push(submissionItem)
                    } else {
                        scheduleList.push({
                            id: scheduleList.length,
                            submissions: [submissionItem]
                        })
                    }
                } else {
                    scheduleList.push({
                        id: scheduleList.length,
                        submissions: [submissionItem]
                    })
                }
            }
        }
    }
    var context = {}
    context.submissionList = submissionList
    context.scheduleList = scheduleList
    context.user = req.user
    context.admin = req.user === process.env.ADMIN_ID
    res.render('home', context)
})

app.get('/logout', function (req, res) {
    req.logout()
    res.redirect('/')
})

app.get('/submit', authenticateUser, function (req, res) {
    var context = {}
    context.user = req.user
    context.admin = req.user === process.env.ADMIN_ID
    res.render('submit', context)
})

app.post('/submit', authenticateUser, async function (req, res) {

    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    const getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    const { name, code, sr, role } = req.body

    const id = uuidv4()
    var info = ''
    if (dataArray) {

        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i][1] == req.user && dataArray[i][9]) {
                var d = new Date(dataArray[i][9])
                d.setDate(d.getDate() + REVIEW_WAIT_TIME)
                if (d > new Date()) {
                    info = 'Cannot be scheduled: Wait restriction. Can be scheduled after ' + d.toDateString().substring(0, 10) + '.'
                }
            } else if (dataArray[i][1] == req.user) {
                info = 'Cannot be scheduled: Multiple submissions. Can be scheduled after your higher priority submissons are completed.'
            }
        }
    }

    await googleSheets.spreadsheets.values.append({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            values: [[id, req.user, name, code, sr, role, info]]
        }
    })

    res.redirect('/')
})

app.get('/approve', authenticateAdmin, async function (req, res) {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    const getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values



    var unapproved = []
    for (let i = 0; i < dataArray.length; i++) {
        while (dataArray[i].length < 10) {
            dataArray[i].push('')
        }
        const submissionItem = {
            'id': dataArray[i][0],
            'user_id': dataArray[i][1],
            'name': dataArray[i][2],
            'code': dataArray[i][3],
            'sr': dataArray[i][4],
            'role': dataArray[i][5],
            'info': dataArray[i][6],
            'approved': dataArray[i][7],
            'scheduled': dataArray[i][8],
            'completed': dataArray[i][9]
        }
        if (!dataArray[i][7]) {
            if (typeof dataArray[i][0] !== "undefined") {
                unapproved.push(submissionItem)
            }
        }
    }

    var context = {}
    context.submissionList = unapproved
    context.user = req.user
    context.admin = req.user === process.env.ADMIN_ID
    res.render('approve', context)
})

app.post('/approve/:id', authenticateAdmin, async function (req, res) {
    const id = req.params.id

    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    var getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    const toUpdate = (row) => row[0] === id
    const index = (dataArray.findIndex(toUpdate) + 2)
    const updateRange = 'Sheet1!H' + index

    await googleSheets.spreadsheets.values.update({
        auth,
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [['approved']]
        }
    })

    res.redirect('/approve')
})

app.delete('/approve/:id', authenticateAdmin, async function (req, res) {
    const id = req.params.id

    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    var getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    const toUpdate = (row) => row[0] === id
    const index = (dataArray.findIndex(toUpdate) + 2)

    await googleSheets.spreadsheets.batchUpdate({
        auth,
        spreadsheetId,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: 0,
                        dimension: 'ROWS',
                        startIndex: index - 1,
                        endIndex: index
                    }
                }
            }]
        }
    })

    res.redirect('/approve')
})

app.post('/update/:id', authenticateAdmin, async function (req, res) {
    const id = req.params.id
    const { code, sr, role } = req.body

    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    var getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    const toUpdate = (row) => row[0] === id
    const index = (dataArray.findIndex(toUpdate) + 2)
    const updateRange = 'Sheet1!D' + index
    
    await googleSheets.spreadsheets.values.update({
        auth,
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [[code, sr, role, '']]
        }
    })
   
    res.redirect('/')
})

app.post('/', authenticateAdmin, async function (req, res) {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    const getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    let updates = []
    for (let i = 0; i < dataArray.length; i++) {
        updates.push(['','','','Cannot be scheduled: Code outdated. Update code to allow submission to be scheduled.',dataArray[i][7],''])
    }

    await googleSheets.spreadsheets.values.update({
        auth,
        spreadsheetId,
        range: 'Sheet1!D2:J',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: updates
        }
    })

    res.redirect('/')
})

app.post('/schedule', authenticateAdmin, async function (req, res) {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    const getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    let schedule = []

    for (let i = 0; i < dataArray.length; i++) {
        if (!dataArray[i][6] && dataArray[i][7] && !dataArray[i][8] && !dataArray[9]) {
            schedule.push(dataArray[i])

            const updateRange = 'Sheet1!I' + (i + 2)

            await googleSheets.spreadsheets.values.update({
                auth,
                spreadsheetId,
                range: updateRange,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['scheduled']]
                }
            })
        }
        if (schedule.length === REVIEWS_PER_DAY) {
            break
        }
    }

    res.redirect('/')
})

app.post('/schedule/complete', authenticateAdmin, async function (req, res) {
    let ids = req.body.schedule_items

    const auth = new google.auth.GoogleAuth({
        keyFile: 'keys.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    })

    const client = await auth.getClient()

    const googleSheets = google.sheets({
        version: 'v4',
        auth: client
    })

    const spreadsheetId = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

    var getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    let dataArray = getRows.data.values

    if (typeof ids === "string") {
        const toUpdate = (row) => row[0] === ids
        const index = (dataArray.findIndex(toUpdate) + 2)
        var ranges = ['Sheet1!I' + index]
    } else {
        var ranges = ids.map(function (i) {
            const toUpdate = (row) => row[0] === i
            const index = (dataArray.findIndex(toUpdate) + 2)
            return 'Sheet1!I' + index
        })
    }
    

    for (let i = 0; i < ranges.length; i++) {
        await googleSheets.spreadsheets.values.update({
            auth,
            spreadsheetId,
            range: ranges[i],
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [['',new Date().toDateString()]]
            }
        })
    }

    getRows = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Sheet1!A2:J'
    })

    dataArray = getRows.data.values

    let lastReview = new Map()
    ids = []

    for (let i = 0; i < dataArray.length; i++) {
        if (lastReview.get(dataArray[i][1])) {
            let d1 = lastReview.get(dataArray[i][1])
            if (dataArray[i][9]) {
                lastReview.set(dataArray[i][1], new Date(dataArray[i][9]))
            }
        } else if (dataArray[i][9]) {
            lastReview.set(dataArray[i][1], new Date(dataArray[i][9]))
        }

        if (lastReview.get(dataArray[i][1]) && !dataArray[i][9]) {
            let d1 = lastReview.get(dataArray[i][1])
            d1.setDate(d1.getDate() + REVIEW_WAIT_TIME)
            if (d1 > new Date()) {
                ids.push(dataArray[i][0])
            }
        }
    }

    ranges = ids.map(function (i) {
        const toUpdate = (row) => row[0] === i
        const index = (dataArray.findIndex(toUpdate) + 2)
        return 'Sheet1!G' + index
    })

    for (let i = 0; i < ranges.length; i++) {
        await googleSheets.spreadsheets.values.update({
            auth,
            spreadsheetId,
            range: ranges[i],
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [['Cannot be scheduled: Wait restriction. Can be scheduled after ' + lastReview.get(dataArray[i][1]).toDateString().substring(0, 10) + '.']]
            }
        })
    }

    res.redirect('/')
})

app.use(function (req, res) {
    res.status(404);
    res.render('404');
});

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.type('plain/text');
    res.status(500);
    res.render('500');
});

app.listen(app.get('port'), function () {
    console.log('Express started on localhost:' + app.get('port') + '; press Ctrl-C to terminate.');
});

function authenticateUser(req, res, next) {
    if (req.user) {
        return next()
    } else {
        res.redirect('/auth/google')
    }
}

function authenticateAdmin(req, res, next) {
    if (req.user === process.env.ADMIN_ID) {
        return next()
    } else {
        res.redirect('/')
    }
}